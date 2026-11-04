/** Only an unsent journal lives in browser storage; server records remain authoritative. */
import { isDateKey, type Grade } from '../core/index.ts';

export interface BatchRating { readonly wordId: string; readonly grade: Grade }
export interface BatchPayload {
  readonly batchId: string;
  readonly day: string;
  readonly ratings: readonly BatchRating[];
  readonly dayCompleted: boolean;
}
export interface BatchStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export const PENDING_BATCH_KEY = 'vocab-wheel:pending-batch:v1';
const MAX_JOURNAL_CHARS = 128 * 1024;
const BATCH_ID = /^[A-Za-z0-9_-]{8,64}$/;
const WORD_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$/;
export class PendingBatchError extends Error {
  readonly code: 'INVALID_BATCH' | 'PENDING_BATCH_EXISTS' | 'INVALID_JOURNAL';
  constructor(code: PendingBatchError['code']) { super(code); this.name = 'PendingBatchError'; this.code = code; }
}
/** A newly staged packet is deeply frozen; retries must reuse it without editing. */
export function makeBatchPayload(day: string, ratings: readonly BatchRating[], dayCompleted = false, batchId: string = globalThis.crypto.randomUUID()): BatchPayload {
  return validatePayload({ batchId, day, ratings, dayCompleted });
}
/** Fixed key order plus preserved rating order gives byte-identical retries after reload. */
export function serializeBatchPayload(payload: BatchPayload): string {
  const value = validatePayload(payload);
  return JSON.stringify({ batchId: value.batchId, day: value.day, ratings: value.ratings.map(rating => ({ wordId: rating.wordId, grade: rating.grade })), dayCompleted: value.dayCompleted });
}
export function parsePendingBatch(raw: string | null): BatchPayload | null {
  if (raw === null || raw.length === 0 || raw.length > MAX_JOURNAL_CHARS) return null;
  try { return validatePayload(JSON.parse(raw)); } catch { return null; }
}
/** Refuse to overwrite any unresolved packet, even if a later selection reuses its ID. */
export function persistPendingBatch(storage: BatchStorage, payload: BatchPayload, key = PENDING_BATCH_KEY): string {
  const body = serializeBatchPayload(payload);
  const existing = storage.getItem(key);
  if (existing !== null) {
    const parsed = parsePendingBatch(existing);
    if (!parsed) throw new PendingBatchError('INVALID_JOURNAL');
    if (serializeBatchPayload(parsed) !== body) throw new PendingBatchError('PENDING_BATCH_EXISTS');
    // Return the originally stored bytes for the actual retry; never silently rewrite a request.
    return existing;
  }
  storage.setItem(key, body);
  return body;
}
export function loadPendingBatch(storage: BatchStorage, key = PENDING_BATCH_KEY): { payload: BatchPayload; body: string } | null {
  const body = storage.getItem(key);
  if (body === null) return null;
  const payload = parsePendingBatch(body);
  if (!payload) throw new PendingBatchError('INVALID_JOURNAL');
  return Object.freeze({ payload, body });
}
/** A late acknowledgement must never remove a newer pending packet. */
export function clearPendingBatch(storage: BatchStorage, acknowledgedBatchId: string, key = PENDING_BATCH_KEY): boolean {
  const raw = storage.getItem(key);
  if (raw === null) return false;
  const pending = parsePendingBatch(raw);
  if (!pending) throw new PendingBatchError('INVALID_JOURNAL');
  if (pending.batchId !== acknowledgedBatchId) return false;
  storage.removeItem(key);
  return true;
}
function validatePayload(value: unknown): BatchPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new PendingBatchError('INVALID_BATCH');
  const x = value as Record<string, unknown>;
  if (Object.keys(x).some(key => !['batchId', 'day', 'ratings', 'dayCompleted'].includes(key))) throw new PendingBatchError('INVALID_BATCH');
  if (typeof x.batchId !== 'string' || !BATCH_ID.test(x.batchId) || !isDateKey(x.day) || typeof x.dayCompleted !== 'boolean' || !Array.isArray(x.ratings) || x.ratings.length > 200) throw new PendingBatchError('INVALID_BATCH');
  const seen = new Set<string>();
  const ratings = x.ratings.map((raw: unknown): BatchRating => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new PendingBatchError('INVALID_BATCH');
    const rating = raw as Record<string, unknown>;
    if (Object.keys(rating).some(key => !['wordId', 'grade'].includes(key)) || typeof rating.wordId !== 'string' || !WORD_ID.test(rating.wordId) || !['remembered', 'fuzzy', 'forgot'].includes(rating.grade as string) || seen.has(rating.wordId)) throw new PendingBatchError('INVALID_BATCH');
    seen.add(rating.wordId);
    return Object.freeze({ wordId: rating.wordId, grade: rating.grade as Grade });
  });
  return Object.freeze({ batchId: x.batchId, day: x.day, ratings: Object.freeze(ratings), dayCompleted: x.dayCompleted });
}
