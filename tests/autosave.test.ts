import test from 'node:test';
import assert from 'node:assert/strict';
import { ackPacket, AUTOSAVE_KEY, commitAutosaveState, effectiveGrade, emptyAutosaveState, loadAutosaveState, MAX_AUTOSAVE_OPERATIONS, mergeWordMarks, optimisticMarkCount, parseAutosaveState, queueCompletion, queueGrade, queueMark, releaseRejectedCompletion, serializeAutosaveState, stageNextPacket, type AutosaveState, type AutosaveStorage } from '../src/client/autosave.ts';
const DAY = '2026-10-31';
const base = (hardCount = 0, revision = 0) => ({ wordId: 'server', hardCount, revision, updatedAt: 1 });
function storage(): AutosaveStorage { const values = new Map<string, string>(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); }, removeItem: key => { values.delete(key); } }; }
function add(state: AutosaveState, index: number, delta: 1 | -1 = 1): AutosaveState { return queueMark(state, 'server', delta, { id: `mark-op-${index}`, now: index, base: base() }); }

test('ten rapid +1 taps retain ten independent IDs/counts and never generate grades', () => {
  let state = emptyAutosaveState();
  for (let index = 0; index < 10; index++) state = add(state, index);
  assert.equal(state.operations.length, 10); assert.equal(new Set(state.operations.map(op => op.id)).size, 10);
  assert.ok(state.operations.every(op => op.kind === 'mark'));
  assert.equal(optimisticMarkCount(state, 'server', 0), 10);
  state = stageNextPacket(state, 'packet-mark-1');
  const body = JSON.parse(state.pending!.body);
  assert.equal(body.operations.length, 10); assert.ok(body.operations.every((op: {delta:number}) => op.delta === 1));
  assert.equal(state.pending!.path, '/api/v1/marks/batch');
});
test('new edits remain editable in flight and an old acknowledgement removes only claimed IDs', () => {
  let state = stageNextPacket(add(emptyAutosaveState(), 0), 'packet-old-1');
  const oldBody = state.pending!.body;
  state = add(state, 1); state = add(state, 2, -1);
  assert.equal(state.pending!.body, oldBody); assert.equal(state.operations.length, 3);
  state = ackPacket(state, 'packet-old-1', ['mark-op-0'], [base(1, 1)]);
  assert.equal(state.pending, undefined); assert.deepEqual(state.operations.map(op => op.id), ['mark-op-1', 'mark-op-2']);
  assert.equal(optimisticMarkCount(state, 'server', 1), 1);
  const next = stageNextPacket(state, 'packet-next-1');
  assert.equal(ackPacket(next, 'packet-old-1'), next);
});
test('offline/reload retries preserve packet bytes and the original marker baseline', () => {
  const local = storage();
  let state = queueMark(emptyAutosaveState(), 'server', 1, { id: 'offline-op-1', base: base(4, 4) });
  state = stageNextPacket(state, 'packet-offline-1');
  const body = state.pending!.body;
  commitAutosaveState(local, state);
  const restored = loadAutosaveState(local);
  assert.equal(restored.pending!.body, body); assert.equal(stageNextPacket(restored, 'packet-different').pending!.body, body);
  // Server already committed +1 but its response was lost. Local pending +1 must not display 6.
  assert.equal(optimisticMarkCount(restored, 'server', 5), 5);
  assert.equal(serializeAutosaveState(restored), serializeAutosaveState(state));
});
test('ack rebases newer taps on returned snapshots and stale packet IDs cannot change a baseline', () => {
  let state = queueMark(emptyAutosaveState(), 'server', 1, { id: 'baseline-op-1', base: base(4, 4) });
  state = stageNextPacket(state, 'packet-base-1');
  state = queueMark(state, 'server', 1, { id: 'baseline-op-2', base: base(5, 5) });
  assert.equal(optimisticMarkCount(state, 'server', 5), 6);
  state = ackPacket(state, 'packet-base-1', ['baseline-op-1'], [base(5, 5)]);
  assert.equal(state.markBases.server.hardCount, 5); assert.equal(optimisticMarkCount(state, 'server', 5), 6);
  const current = stageNextPacket(state, 'packet-base-2');
  assert.equal(ackPacket(current, 'packet-base-1', ['baseline-op-1'], [base(99, 99)]), current);
  const done = ackPacket(current, 'packet-base-2', ['baseline-op-2'], [base(6, 6)]);
  assert.equal(done.operations.length, 0); assert.equal(Object.keys(done.markBases).length, 0);
});
test('partial packet limit drains 200 ordered taps then preserves the remaining 5', () => {
  let state = emptyAutosaveState();
  for (let index = 0; index < 205; index++) state = add(state, index, index % 2 === 0 ? 1 : -1);
  state = stageNextPacket(state, 'packet-200-1');
  assert.equal(state.pending!.operationIds.length, 200);
  assert.deepEqual(JSON.parse(state.pending!.body).operations.map((op: {opId:string}) => op.opId), Array.from({length:200}, (_, i) => `mark-op-${i}`));
  assert.throws(() => ackPacket(state, 'packet-200-1', ['mark-op-0']), /INCOMPLETE_ACK/);
  state = ackPacket(state, 'packet-200-1', state.pending!.operationIds, [base(0, 200)]);
  assert.equal(state.operations.length, 5); assert.equal(optimisticMarkCount(state, 'server', 0), 1);
  state = stageNextPacket(state, 'packet-200-2'); assert.equal(state.pending!.operationIds.length, 5);
});
test('unsent grade corrections coalesce without extra exposure, while pending grades stay immutable', () => {
  let state = queueGrade(emptyAutosaveState(), 'server', 'forgot', DAY, { id: 'grade-op-1' });
  state = queueGrade(state, 'server', 'remembered', DAY, { id: 'grade-op-2' });
  assert.equal(state.operations.length, 1); assert.equal(effectiveGrade(state, 'server', DAY), 'remembered');
  state = stageNextPacket(state, 'packet-grade-1');
  const body = state.pending!.body;
  assert.deepEqual(JSON.parse(body).ratings, [{wordId:'server',grade:'remembered'}]);
  state = queueGrade(state, 'server', 'forgot', DAY, { id: 'grade-op-3' });
  state = queueGrade(state, 'server', 'remembered', DAY, { id: 'grade-op-4' });
  assert.equal(state.operations.length, 2); assert.equal(state.pending!.body, body);
  state = ackPacket(state, 'packet-grade-1');
  assert.deepEqual(state.operations.map(op => op.id), ['grade-op-4']);
  assert.equal(effectiveGrade(state, 'server', '2026-11-01', null), null);
});
test('mark plus explicit forgot can be composed into one durable local action', () => {
  const local = storage();
  let state = emptyAutosaveState();
  let next = queueMark(state, 'server', 1, {id:'composed-mark-1',base:base()});
  next = queueGrade(next, 'server', 'forgot', DAY, {id:'composed-grade-1'});
  state = commitAutosaveState(local, next);
  assert.equal(loadAutosaveState(local).operations.length, 2);
  assert.equal(optimisticMarkCount(state, 'server', 0), 1);
  assert.equal(effectiveGrade(state, 'server', DAY), 'forgot');
  // Repeated marker taps do not need a second automatic forgot; UI can use effectiveGrade.
  if (effectiveGrade(state, 'server', DAY) !== 'forgot') state = queueGrade(state, 'server', 'forgot', DAY);
  state = queueMark(state, 'server', 1, {id:'composed-mark-2'});
  assert.equal(state.operations.filter(op => op.kind === 'grade').length, 1);
});
test('storage failure keeps caller state unchanged; corrupt journals never silently disappear', () => {
  let current = emptyAutosaveState();
  const failing: AutosaveStorage = {getItem:()=>null,setItem:()=>{throw new Error('QUOTA');},removeItem:()=>{}};
  assert.throws(() => { current = commitAutosaveState(failing, add(current, 0)); }, /QUOTA/);
  assert.equal(current.operations.length, 0);
  const local = storage(); local.setItem(AUTOSAVE_KEY, '{broken');
  assert.throws(() => loadAutosaveState(local), /INVALID_STATE/);
  assert.equal(local.getItem(AUTOSAVE_KEY), '{broken');
  assert.throws(() => parseAutosaveState(JSON.stringify({schemaVersion:1,operations:[],markBases:{},pending:{id:'bad'}})), /INVALID_STATE/);
});
test('completion may be an explicit zero-rating grade packet; there are no timer/reveal operations', () => {
  let state = queueCompletion(emptyAutosaveState(), DAY, {id:'complete-op-1'});
  state = stageNextPacket(state, 'packet-complete-1');
  assert.deepEqual(JSON.parse(state.pending!.body), {batchId:'packet-complete-1',day:DAY,ratings:[],dayCompleted:true});
  assert.equal(stageNextPacket(emptyAutosaveState()).pending, undefined);
});
test('floor-zero projection preserves decrement/increment order and metadata merge ignores stale revisions', () => {
  let state = add(emptyAutosaveState(), 0, -1); state = add(state, 1, 1);
  assert.equal(optimisticMarkCount(state, 'server', 99), 1);
  const merged = mergeWordMarks([base(3, 8)], [base(99, 7), base(4, 9), base(100, 8)]);
  assert.deepEqual(merged, [base(4, 9)]);
});
test('queue cap rejects a new tap rather than silently dropping old unsaved operations', () => {
  const raw = {schemaVersion:1,operations:Array.from({length:MAX_AUTOSAVE_OPERATIONS}, (_, i)=>({id:`full-op-${i}`,createdAt:i,kind:'mark',wordId:'server',delta:1})),markBases:{server:{hardCount:0,revision:0}}};
  const state = parseAutosaveState(JSON.stringify(raw));
  assert.throws(() => add(state, MAX_AUTOSAVE_OPERATIONS), /QUEUE_FULL/);
  assert.equal(state.operations.length, MAX_AUTOSAVE_OPERATIONS);
});

test('completion cannot overtake a multi-packet grade backlog', () => {
  let state = queueCompletion(emptyAutosaveState(), DAY, {id:'completion-backlog'});
  for (let index = 0; index < 201; index++) state = queueGrade(state, `word-${index}`, 'remembered', DAY, {id:`backlog-grade-${index}`});
  state = stageNextPacket(state, 'packet-backlog-1');
  const first = JSON.parse(state.pending!.body);
  assert.equal(first.ratings.length, 200); assert.equal(first.dayCompleted, false);
  state = ackPacket(state, 'packet-backlog-1');
  state = stageNextPacket(state, 'packet-backlog-2');
  const second = JSON.parse(state.pending!.body);
  assert.equal(second.ratings.length, 1); assert.equal(second.dayCompleted, true);
});

test('definitive rejected completion releases its intent but preserves latest grades and new marker taps', () => {
  let state = queueGrade(emptyAutosaveState(), 'server', 'forgot', DAY, {id:'rejected-grade-old'});
  state = queueCompletion(state, DAY, {id:'rejected-complete-old'});
  state = stageNextPacket(state, 'packet-rejected-1');
  assert.equal(JSON.parse(state.pending!.body).dayCompleted, true);
  state = queueGrade(state, 'server', 'remembered', DAY, {id:'rejected-grade-new'});
  state = queueMark(state, 'server', 1, {id:'rejected-mark-new',base:base()});
  state = queueGrade(state, 'deploy', 'fuzzy', DAY, {id:'rejected-other-new'});
  const released = releaseRejectedCompletion(state, 'packet-rejected-1');
  assert.equal(released.pending, undefined);
  assert.deepEqual(released.operations.map(operation => operation.id), ['rejected-grade-new','rejected-mark-new','rejected-other-new']);
  assert.equal(optimisticMarkCount(released, 'server', 0), 1);
  assert.equal(effectiveGrade(released, 'server', DAY), 'remembered');
  const next = stageNextPacket(released, 'packet-after-reject');
  const packet = JSON.parse(next.pending!.body);
  assert.equal(packet.dayCompleted, false);
  assert.deepEqual(packet.ratings, [{wordId:'server',grade:'remembered'},{wordId:'deploy',grade:'fuzzy'}]);
  assert.equal(next.operations.filter(operation => operation.kind === 'complete').length, 0);
  assert.equal(parseAutosaveState(serializeAutosaveState(next)).pending!.body, next.pending!.body);
});
test('rejected completion recovery is a no-op for stale IDs, marker packets and grade-only packets', () => {
  const markers = stageNextPacket(add(emptyAutosaveState(), 0), 'packet-keep-mark');
  assert.equal(releaseRejectedCompletion(markers, 'packet-keep-mark'), markers);
  const grades = stageNextPacket(queueGrade(emptyAutosaveState(), 'server', 'forgot', DAY, {id:'keep-only-grade'}), 'packet-keep-grade');
  assert.equal(releaseRejectedCompletion(grades, 'packet-keep-grade'), grades);
  const completion = stageNextPacket(queueCompletion(emptyAutosaveState(), DAY, {id:'keep-completion'}), 'packet-keep-complete');
  assert.equal(releaseRejectedCompletion(completion, 'packet-stale-old'), completion);
});
test('rejected completion recovery does not erase a newer explicit completion action', () => {
  let state = stageNextPacket(queueCompletion(emptyAutosaveState(), DAY, {id:'complete-reject-old'}), 'packet-reject-old');
  state = queueCompletion(state, DAY, {id:'complete-new-intent'});
  state = releaseRejectedCompletion(state, 'packet-reject-old');
  assert.deepEqual(state.operations.map(operation => operation.id), ['complete-new-intent']);
});
