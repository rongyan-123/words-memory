import test from 'node:test';
import assert from 'node:assert/strict';
import { clearPendingBatch, loadPendingBatch, makeBatchPayload, parsePendingBatch, persistPendingBatch, serializeBatchPayload, PendingBatchError, PENDING_BATCH_KEY, type BatchRating, type BatchStorage } from '../src/client/batch.ts';
function storage(): BatchStorage {
  const values = new Map<string, string>();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); }, removeItem: key => { values.delete(key); } };
}
const day = '2026-10-31';
const ratings: BatchRating[] = [{ wordId: 'server', grade: 'remembered' }, { wordId: 'deploy', grade: 'forgot' }];
test('batch creation clones and deep-freezes selections instead of sending each reveal/grade', () => {
  const selected = ratings.map(r => ({ ...r }));
  const packet = makeBatchPayload(day, selected, false, 'client-batch-1');
  selected[0].grade = 'forgot'; selected.push({ wordId: 'extra', grade: 'fuzzy' });
  assert.equal(packet.ratings.length, 2); assert.equal(packet.ratings[0].grade, 'remembered');
  assert.ok(Object.isFrozen(packet)); assert.ok(Object.isFrozen(packet.ratings)); assert.ok(Object.isFrozen(packet.ratings[0]));
  assert.equal(Reflect.set(packet.ratings[0], 'grade', 'forgot'), false);
  assert.equal(packet.ratings[0].grade, 'remembered');
});
test('a failed request and reload reuse byte-identical event packet, including the same batch ID', () => {
  const local = storage();
  const packet = makeBatchPayload(day, ratings, false, 'client-batch-2');
  const firstBody = persistPendingBatch(local, packet);
  const reloaded = loadPendingBatch(local)!;
  assert.equal(reloaded.body, firstBody);
  assert.equal(serializeBatchPayload(reloaded.payload), firstBody);
  assert.equal(reloaded.payload.batchId, 'client-batch-2');
  assert.equal(persistPendingBatch(local, reloaded.payload), firstBody);
  assert.equal(local.getItem(PENDING_BATCH_KEY), firstBody);
});
test('unresolved packets cannot change ratings, completion flag or batch identity', () => {
  const local = storage();
  const first = makeBatchPayload(day, ratings, false, 'client-batch-3');
  persistPendingBatch(local, first);
  for (const changed of [makeBatchPayload(day, ratings, true, 'client-batch-3'), makeBatchPayload(day, [{ wordId: 'server', grade: 'forgot' }], false, 'client-batch-3'), makeBatchPayload(day, ratings, false, 'client-batch-4')]) {
    assert.throws(() => persistPendingBatch(local, changed), (error: unknown) => error instanceof PendingBatchError && error.code === 'PENDING_BATCH_EXISTS');
  }
  assert.deepEqual(loadPendingBatch(local)!.payload, first);
});
test('only matching acknowledgement clears a journal, never a delayed earlier response', () => {
  const local = storage();
  persistPendingBatch(local, makeBatchPayload(day, ratings, false, 'client-batch-5'));
  assert.equal(clearPendingBatch(local, 'client-batch-4'), false);
  assert.ok(loadPendingBatch(local));
  assert.equal(clearPendingBatch(local, 'client-batch-5'), true); assert.equal(loadPendingBatch(local), null);
  persistPendingBatch(local, makeBatchPayload(day, ratings, false, 'client-batch-6'));
  assert.equal(clearPendingBatch(local, 'client-batch-5'), false);
  assert.equal(loadPendingBatch(local)!.payload.batchId, 'client-batch-6');
});
test('invalid or corrupt local journal stays protected instead of silently overwriting unsent data', () => {
  assert.equal(parsePendingBatch(null), null); assert.equal(parsePendingBatch('{'), null);
  assert.equal(parsePendingBatch(' '.repeat(128 * 1024 + 1)), null);
  const good = makeBatchPayload(day, ratings, false, 'client-batch-7');
  for (const bad of [{ ...good, day: '2026-02-30' }, { ...good, batchId: 'short' }, { ...good, dayCompleted: 'true' }, { ...good, ratings: [{ wordId: 'server', grade: 'unknown' }] }, { ...good, ratings: [ratings[0], ratings[0]] }, { ...good, secret: 'not accepted' }]) assert.equal(parsePendingBatch(JSON.stringify(bad)), null);
  const local = storage(); local.setItem(PENDING_BATCH_KEY, '{bad');
  assert.throws(() => loadPendingBatch(local), /INVALID_JOURNAL/);
  assert.throws(() => persistPendingBatch(local, good), /INVALID_JOURNAL/);
  assert.equal(local.getItem(PENDING_BATCH_KEY), '{bad');
});
test('navigation can journal dirty work synchronously before a failed asynchronous flush', async () => {
  const local = storage();
  const dirty = makeBatchPayload(day, ratings, false, 'navigate-batch-1');
  const body = persistPendingBatch(local, dirty);
  await assert.rejects(async () => { assert.equal(loadPendingBatch(local)!.body, body); throw new Error('offline'); }, /offline/);
  assert.equal(loadPendingBatch(local)!.body, body);
});
test('up to 200 selections form one batch, while duplicates and overbound input are rejected', () => {
  const many: BatchRating[] = Array.from({ length: 200 }, (_, i) => ({ wordId: `word-${i}`, grade: 'remembered' }));
  assert.equal(makeBatchPayload(day, many, true, 'large-batch-1').ratings.length, 200);
  assert.throws(() => makeBatchPayload(day, [...many, { wordId: 'word-200', grade: 'fuzzy' }], true, 'large-batch-1'));
  assert.throws(() => makeBatchPayload(day, [ratings[0], ratings[0]], false, 'large-batch-1'));
});
