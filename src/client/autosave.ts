/** Durable write-ahead outbox only. The server remains authoritative for marks/progress. */
import { isDateKey, type Grade, type WordMark } from '../core/index.ts';

interface OperationBase { readonly id: string; readonly createdAt: number }
export interface MarkOperation extends OperationBase { readonly kind: 'mark'; readonly wordId: string; readonly delta: 1 | -1 }
export interface GradeOperation extends OperationBase { readonly kind: 'grade'; readonly wordId: string; readonly grade: Grade; readonly date: string }
export interface CompletionOperation extends OperationBase { readonly kind: 'complete'; readonly date: string }
export type AutosaveOperation = MarkOperation | GradeOperation | CompletionOperation;
export interface AutosavePacket {
  readonly id: string;
  readonly kind: 'marks' | 'grades';
  readonly operationIds: readonly string[];
  readonly path: '/api/v1/marks/batch' | '/api/v1/reviews/batch';
  readonly body: string;
}
export interface MarkBase { readonly hardCount: number; readonly revision: number }
export interface AutosaveState {
  readonly schemaVersion: 1;
  readonly operations: readonly AutosaveOperation[];
  readonly markBases: Readonly<Record<string, MarkBase>>;
  readonly pending?: AutosavePacket;
}
export interface AutosaveStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }
export interface OperationOptions { id?: string; now?: number; base?: WordMark }
export const AUTOSAVE_KEY = 'vocab-wheel:autosave:v1';
export const MAX_AUTOSAVE_OPERATIONS = 10_000;
const MAX_SERIALIZED_CHARS = 4 * 1024 * 1024;
const ID = /^[A-Za-z0-9_-]{8,100}$/;
const PACKET_ID = /^[A-Za-z0-9_-]{8,64}$/;
const WORD_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$/;
export class AutosaveError extends Error {
  readonly code: 'INVALID_STATE' | 'QUEUE_FULL' | 'DUPLICATE_OPERATION' | 'INCOMPLETE_ACK';
  constructor(code: AutosaveError['code']) { super(code); this.name = 'AutosaveError'; this.code = code; }
}
export function emptyAutosaveState(): AutosaveState { return Object.freeze({ schemaVersion: 1, operations: Object.freeze([]), markBases: Object.freeze(Object.create(null) as Record<string, MarkBase>) }); }
function operationBase(state: AutosaveState, options: OperationOptions): OperationBase {
  const id = options.id ?? globalThis.crypto.randomUUID();
  const createdAt = options.now ?? Date.now();
  if (!ID.test(id) || !Number.isSafeInteger(createdAt) || createdAt < 0) throw new AutosaveError('INVALID_STATE');
  if (state.operations.some(operation => operation.id === id)) throw new AutosaveError('DUPLICATE_OPERATION');
  return { id, createdAt };
}
/** Every tap retains its own ID/order. Pass the current server base on first tap; omitted base means a new zero-count word. */
export function queueMark(state: AutosaveState, wordId: string, delta: 1 | -1, options: OperationOptions = {}): AutosaveState {
  if (!WORD_ID.test(wordId) || (delta !== 1 && delta !== -1)) throw new AutosaveError('INVALID_STATE');
  const hasQueuedMark = state.operations.some(operation => operation.kind === 'mark' && operation.wordId === wordId);
  const markBases = { ...state.markBases };
  if (!hasQueuedMark) {
    const base = options.base ?? { wordId, hardCount: 0, revision: 0, updatedAt: 0 };
    validateWordMark(base);
    if (base.wordId !== wordId) throw new AutosaveError('INVALID_STATE');
    markBases[wordId] = Object.freeze({ hardCount: base.hardCount, revision: base.revision });
  }
  return append({ ...state, markBases }, { ...operationBase(state, options), kind: 'mark', wordId, delta });
}
/** Only unsent corrections coalesce; a claimed grade packet is immutable. */
export function queueGrade(state: AutosaveState, wordId: string, grade: Grade, date: string, options: OperationOptions = {}): AutosaveState {
  if (!WORD_ID.test(wordId) || !isGrade(grade) || !isDateKey(date)) throw new AutosaveError('INVALID_STATE');
  const operation: GradeOperation = { ...operationBase(state, options), kind: 'grade', wordId, grade, date };
  const claimed = new Set(state.pending?.operationIds ?? []);
  const operations = state.operations.filter(old => !(old.kind === 'grade' && old.wordId === wordId && old.date === date && !claimed.has(old.id)));
  return append({ ...state, operations }, operation);
}
export function queueCompletion(state: AutosaveState, date: string, options: OperationOptions = {}): AutosaveState {
  if (!isDateKey(date)) throw new AutosaveError('INVALID_STATE');
  const operation: CompletionOperation = { ...operationBase(state, options), kind: 'complete', date };
  const claimed = new Set(state.pending?.operationIds ?? []);
  const operations = state.operations.filter(old => !(old.kind === 'complete' && old.date === date && !claimed.has(old.id)));
  return append({ ...state, operations }, operation);
}
export const enqueueMark = queueMark;
export const enqueueGrade = queueGrade;
function append(state: AutosaveState, operation: AutosaveOperation): AutosaveState {
  if (state.operations.length >= MAX_AUTOSAVE_OPERATIONS) throw new AutosaveError('QUEUE_FULL');
  return freezeState([...state.operations, Object.freeze(operation)], state.pending, state.markBases);
}
/** One immutable packet at a time. New actions may append while it is in flight. */
export function stageNextPacket(state: AutosaveState, packetId: string = globalThis.crypto.randomUUID()): AutosaveState {
  if (state.pending || state.operations.length === 0) return state;
  if (!PACKET_ID.test(packetId)) throw new AutosaveError('INVALID_STATE');
  const first = state.operations[0];
  const selected: AutosaveOperation[] = [];
  if (first.kind === 'mark') {
    selected.push(...state.operations.filter(operation => operation.kind === 'mark').slice(0, 200));
  } else {
    const date = first.date;
    const gradeWords = new Set<string>();
    const grades = state.operations.filter((operation): operation is GradeOperation => operation.kind === 'grade' && operation.date === date).filter(operation => {
      if (gradeWords.has(operation.wordId)) return false;
      gradeWords.add(operation.wordId); return true;
    });
    selected.push(...grades.slice(0, 200));
    // Never claim completion ahead of later queued grades, which would deadlock an immutable packet.
    if (selected.length < 200 && grades.length === selected.length) {
      const completion = state.operations.find(operation => operation.kind === 'complete' && operation.date === date);
      if (completion) selected.push(completion);
    }
  }
  const packet = makePacket(packetId, selected);
  return freezeState(state.operations, packet, state.markBases);
}
/** Validate successful acknowledgement, then remove exactly the originally claimed IDs. */
export function ackPacket(state: AutosaveState, packetId: string, acknowledgedOpIds?: readonly string[], serverMarks: readonly WordMark[] = []): AutosaveState {
  if (!state.pending || state.pending.id !== packetId) return state;
  const claimed = new Set(state.pending.operationIds);
  if (acknowledgedOpIds !== undefined) {
    const acknowledged = new Set(acknowledgedOpIds);
    if ([...claimed].some(id => !acknowledged.has(id))) throw new AutosaveError('INCOMPLETE_ACK');
  }
  const remaining = state.operations.filter(operation => !claimed.has(operation.id));
  const markBases = { ...state.markBases };
  const snapshots = new Map(mergeWordMarks([], serverMarks).map(mark => [mark.wordId, mark]));
  const affected = new Set(state.operations.filter((operation): operation is MarkOperation => operation.kind === 'mark' && claimed.has(operation.id)).map(operation => operation.wordId));
  for (const wordId of affected) {
    if (!remaining.some(operation => operation.kind === 'mark' && operation.wordId === wordId)) { delete markBases[wordId]; continue; }
    const oldBase = markBases[wordId];
    const snapshot = snapshots.get(wordId);
    if (snapshot && (!oldBase || snapshot.revision >= oldBase.revision)) {
      markBases[wordId] = Object.freeze({ hardCount: snapshot.hardCount, revision: snapshot.revision });
    } else if (oldBase) {
      let count = oldBase.hardCount;
      let revision = oldBase.revision;
      for (const operation of state.operations) if (operation.kind === 'mark' && operation.wordId === wordId && claimed.has(operation.id)) { count = Math.max(0, count + operation.delta); revision++; }
      markBases[wordId] = Object.freeze({ hardCount: count, revision });
    }
  }
  return freezeState(remaining, undefined, markBases);
}
/**
 * Only for a definitive, nonexecuted DAY_INCOMPLETE rejection. Never use on a
 * timeout, network failure or any outcome that might already have committed.
 * Release that completion intent; all grades become unsent and latest edits
 * coalesce again. A new explicit completion action is required afterwards.
 */
export function releaseRejectedCompletion(state: AutosaveState, packetId: string): AutosaveState {
  if (!state.pending || state.pending.id !== packetId || state.pending.kind !== 'grades') return state;
  const claimed = new Set(state.pending.operationIds);
  const rejectedCompletionIds = new Set(state.operations.filter(operation => operation.kind === 'complete' && claimed.has(operation.id)).map(operation => operation.id));
  if (rejectedCompletionIds.size === 0) return state;
  const remaining = state.operations.filter(operation => !rejectedCompletionIds.has(operation.id));
  const latestGrades = new Map<string, string>();
  for (const operation of remaining) if (operation.kind === 'grade') latestGrades.set(`${operation.date}\u0000${operation.wordId}`, operation.id);
  const coalesced = remaining.filter(operation => operation.kind !== 'grade' || latestGrades.get(`${operation.date}\u0000${operation.wordId}`) === operation.id);
  return freezeState(coalesced, undefined, state.markBases);
}
/** Caller assigns the returned state only after setItem succeeds; failures never claim UI success. */
export function commitAutosaveState(storage: AutosaveStorage, next: AutosaveState, key = AUTOSAVE_KEY): AutosaveState {
  const body = serializeAutosaveState(next);
  storage.setItem(key, body);
  return next;
}
export function serializeAutosaveState(state: AutosaveState): string {
  const validated = validateState(state);
  const body = JSON.stringify(validated);
  if (body.length > MAX_SERIALIZED_CHARS) throw new AutosaveError('QUEUE_FULL');
  return body;
}
/** Missing journal means empty; corrupt journal throws and must remain visible, not be discarded. */
export function parseAutosaveState(raw: string | null): AutosaveState {
  if (raw === null) return emptyAutosaveState();
  if (raw.length === 0 || raw.length > MAX_SERIALIZED_CHARS) throw new AutosaveError('INVALID_STATE');
  try { return validateState(JSON.parse(raw)); }
  catch (error) { if (error instanceof AutosaveError) throw error; throw new AutosaveError('INVALID_STATE'); }
}
export function loadAutosaveState(storage: AutosaveStorage, key = AUTOSAVE_KEY): AutosaveState { return parseAutosaveState(storage.getItem(key)); }
/** Pending/newer local selections override a server grade only for the matching actual day. */
export function effectiveGrade(state: AutosaveState, wordId: string, date: string, serverGrade: Grade | null = null): Grade | null {
  for (let index = state.operations.length - 1; index >= 0; index--) {
    const operation = state.operations[index];
    if (operation.kind === 'grade' && operation.wordId === wordId && operation.date === date) return operation.grade;
  }
  return serverGrade;
}
/** Preview the ordered, nonnegative counter without changing authoritative server metadata. */
export function projectedHardCount(baseCount: number, state: AutosaveState, wordId: string): number {
  return optimisticMarkCount(state, wordId, baseCount);
}
/** The persisted pre-queue basis prevents a committed-but-unacknowledged tap being counted twice after reload. */
export function optimisticMarkCount(state: AutosaveState, wordId: string, serverCount: number): number {
  if (!Number.isSafeInteger(serverCount) || serverCount < 0) throw new AutosaveError('INVALID_STATE');
  const base = Object.hasOwn(state.markBases, wordId) ? state.markBases[wordId] : undefined;
  let count = base?.hardCount ?? serverCount;
  for (const operation of state.operations) if (operation.kind === 'mark' && operation.wordId === wordId) {
    count = Math.max(0, count + operation.delta);
    if (!Number.isSafeInteger(count)) throw new AutosaveError('INVALID_STATE');
  }
  return count;
}
/** Slow/old acknowledgements cannot roll a newer server snapshot back. */
export function mergeWordMarks(current: readonly WordMark[], incoming: readonly WordMark[]): WordMark[] {
  const marks = new Map<string, WordMark>();
  for (const mark of [...current, ...incoming]) {
    validateWordMark(mark);
    const previous = marks.get(mark.wordId);
    if (!previous || mark.revision > previous.revision) marks.set(mark.wordId, { ...mark });
  }
  return [...marks.values()];
}
function makePacket(id: string, operations: readonly AutosaveOperation[]): AutosavePacket {
  if (!PACKET_ID.test(id) || operations.length === 0 || operations.length > 200) throw new AutosaveError('INVALID_STATE');
  const first = operations[0];
  const kind = first.kind === 'mark' ? 'marks' : 'grades';
  let body: string;
  if (kind === 'marks') {
    if (operations.some(operation => operation.kind !== 'mark')) throw new AutosaveError('INVALID_STATE');
    body = JSON.stringify({ operations: operations.map(operation => { const mark = operation as MarkOperation; return { opId: mark.id, wordId: mark.wordId, delta: mark.delta }; }) });
  } else {
    const date = (first as GradeOperation | CompletionOperation).date;
    if (operations.some(operation => operation.kind === 'mark' || operation.date !== date)) throw new AutosaveError('INVALID_STATE');
    const grades = operations.filter((operation): operation is GradeOperation => operation.kind === 'grade');
    if (new Set(grades.map(operation => operation.wordId)).size !== grades.length) throw new AutosaveError('INVALID_STATE');
    body = JSON.stringify({ batchId: id, day: date, ratings: grades.map(operation => ({ wordId: operation.wordId, grade: operation.grade })), dayCompleted: operations.some(operation => operation.kind === 'complete') });
  }
  return Object.freeze({ id, kind, operationIds: Object.freeze(operations.map(operation => operation.id)), path: kind === 'marks' ? '/api/v1/marks/batch' : '/api/v1/reviews/batch', body });
}
function freezeState(operations: readonly AutosaveOperation[], pending?: AutosavePacket, markBases: Readonly<Record<string, MarkBase>> = {}): AutosaveState {
  const bases = Object.create(null) as Record<string, MarkBase>;
  for (const [wordId, base] of Object.entries(markBases)) bases[wordId] = Object.freeze({ ...base });
  return Object.freeze({ schemaVersion: 1, operations: Object.freeze([...operations]), markBases: Object.freeze(bases), ...(pending ? { pending } : {}) });
}
function validateWordMark(mark: WordMark) {
  if (!mark || !WORD_ID.test(mark.wordId) || ![mark.hardCount, mark.revision, mark.updatedAt].every(value => Number.isSafeInteger(value) && value >= 0)) throw new AutosaveError('INVALID_STATE');
}

function validateState(value: unknown): AutosaveState {
  const raw = object(value);
  if (raw.schemaVersion !== 1 || !Array.isArray(raw.operations) || raw.operations.length > MAX_AUTOSAVE_OPERATIONS || Object.keys(raw).some(key => !['schemaVersion', 'operations', 'pending', 'markBases'].includes(key))) throw new AutosaveError('INVALID_STATE');
  const ids = new Set<string>();
  const operations = raw.operations.map((item: unknown): AutosaveOperation => {
    const operation = object(item);
    if (typeof operation.id !== 'string' || !ID.test(operation.id) || ids.has(operation.id) || !Number.isSafeInteger(operation.createdAt) || (operation.createdAt as number) < 0) throw new AutosaveError('INVALID_STATE');
    ids.add(operation.id);
    const base = { id: operation.id, createdAt: operation.createdAt as number };
    if (operation.kind === 'mark') {
      exactKeys(operation, ['id', 'createdAt', 'kind', 'wordId', 'delta']);
      if (typeof operation.wordId !== 'string' || !WORD_ID.test(operation.wordId) || ![1, -1].includes(operation.delta as number)) throw new AutosaveError('INVALID_STATE');
      return Object.freeze({ ...base, kind: 'mark', wordId: operation.wordId, delta: operation.delta as 1 | -1 });
    }
    if (operation.kind === 'grade') {
      exactKeys(operation, ['id', 'createdAt', 'kind', 'wordId', 'grade', 'date']);
      if (typeof operation.wordId !== 'string' || !WORD_ID.test(operation.wordId) || !isGrade(operation.grade) || !isDateKey(operation.date)) throw new AutosaveError('INVALID_STATE');
      return Object.freeze({ ...base, kind: 'grade', wordId: operation.wordId, grade: operation.grade, date: operation.date });
    }
    if (operation.kind === 'complete') {
      exactKeys(operation, ['id', 'createdAt', 'kind', 'date']);
      if (!isDateKey(operation.date)) throw new AutosaveError('INVALID_STATE');
      return Object.freeze({ ...base, kind: 'complete', date: operation.date });
    }
    throw new AutosaveError('INVALID_STATE');
  });
  const basesRaw = object(raw.markBases);
  const markBases = Object.create(null) as Record<string, MarkBase>;
  const markWords = new Set(operations.filter((operation): operation is MarkOperation => operation.kind === 'mark').map(operation => operation.wordId));
  for (const [wordId, rawBase] of Object.entries(basesRaw)) {
    const base = object(rawBase);
    exactKeys(base, ['hardCount', 'revision']);
    if (!WORD_ID.test(wordId) || !markWords.has(wordId) || !Number.isSafeInteger(base.hardCount) || (base.hardCount as number) < 0 || !Number.isSafeInteger(base.revision) || (base.revision as number) < 0) throw new AutosaveError('INVALID_STATE');
    markBases[wordId] = Object.freeze({ hardCount: base.hardCount as number, revision: base.revision as number });
  }
  if ([...markWords].some(wordId => !Object.hasOwn(markBases, wordId))) throw new AutosaveError('INVALID_STATE');
  let pending: AutosavePacket | undefined;
  if (raw.pending !== undefined) {
    const packet = object(raw.pending);
    exactKeys(packet, ['id', 'kind', 'operationIds', 'path', 'body']);
    if (typeof packet.id !== 'string' || !PACKET_ID.test(packet.id) || !Array.isArray(packet.operationIds) || packet.operationIds.length === 0 || packet.operationIds.length > 200 || new Set(packet.operationIds).size !== packet.operationIds.length || packet.operationIds.some(id => typeof id !== 'string' || !ids.has(id))) throw new AutosaveError('INVALID_STATE');
    const map = new Map(operations.map(operation => [operation.id, operation]));
    pending = makePacket(packet.id, packet.operationIds.map(id => map.get(id as string)!));
    if (packet.kind !== pending.kind || packet.path !== pending.path || packet.body !== pending.body) throw new AutosaveError('INVALID_STATE');
  }
  return freezeState(operations, pending, markBases);
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AutosaveError('INVALID_STATE');
  return value as Record<string, unknown>;
}
function exactKeys(value: Record<string, unknown>, allowed: string[]) { if (Object.keys(value).some(key => !allowed.includes(key))) throw new AutosaveError('INVALID_STATE'); }
function isGrade(value: unknown): value is Grade { return value === 'remembered' || value === 'fuzzy' || value === 'forgot'; }
