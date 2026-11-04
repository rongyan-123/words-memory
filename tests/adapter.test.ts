import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createNodeD1, createNodeHandler } from '../src/adapters/node.ts';
import { defaultSettings, type Plan, type Progress, type Settings } from '../src/core/index.ts';
import type { SeedData } from '../src/server/service.ts';

const now = () => Date.parse('2026-10-31T01:00:00Z');
const seed: SeedData = {
  words: [{ id: 'node-word', term: 'server', meaning: '服务器', tags: ['计算机'], sceneIds: ['node-scene'], source: 'Original adapter test' }],
  scenes: [{ id: 'node-scene', title: '部署服务', description: '配置服务器', task: '部署一个网站', wordIds: ['node-word'] }],
  info: { coverage: 'test' },
};
const disabledPlanner = { configured: false, async generate(): Promise<Plan> { throw new Error('NO_REAL_MODEL_CALLS'); } };
const request = (path: string, method = 'GET', body?: unknown, extra: Record<string, string> = {}) => new Request(`http://127.0.0.1:8788/api/v1/${path}`, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...extra }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });

test('Node SQLite adapter applies exact migrations and rolls batches back atomically', async () => {
  const database = createNodeD1();
  try {
    const db = database.db;
    await db.prepare('INSERT INTO user_state(owner_id,settings_json,lexicon_json,updated_at) VALUES (?,?,?,?)').bind('a', '{}', '{}', 1).run();
    assert.equal(await db.prepare('SELECT owner_id FROM user_state WHERE owner_id=?').bind('a').first('owner_id'), 'a');
    await assert.rejects(db.batch([
      db.prepare('INSERT INTO user_state(owner_id,settings_json,lexicon_json,updated_at) VALUES (?,?,?,?)').bind('b', '{}', '{}', 1),
      db.prepare('INSERT INTO missing_table(value) VALUES (?)').bind('oops'),
    ]));
    assert.equal(await db.prepare('SELECT owner_id FROM user_state WHERE owner_id=?').bind('b').first(), null);
    assert.equal((await db.prepare('SELECT owner_id FROM user_state').all()).results.length, 1);
  } finally { database.close(); }
});

test('local HTTP handler persists state/idempotency and cached plan across SQLite reopen', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'vocab-adapter-'));
  const path = join(directory, 'data.sqlite');
  let database = createNodeD1(path);
  try {
    let handle = createNodeHandler({ db: database.db, planner: disabledPlanner, seed, now });
    assert.equal((await handle(request('bootstrap'))).status, 200);
    let response = await handle(request('review', 'POST', { eventId: 'adapter-event1', wordId: 'node-word', grade: 'remembered' }));
    assert.equal(response.status, 200); assert.equal((await response.json() as { progress: Progress }).progress.exposuresToday, 1);
    response = await handle(request('plan', 'POST', {}));
    const firstPlan = await response.json() as Plan; assert.equal(firstPlan.source, 'curated');
    response = await handle(request('settings', 'PUT', { ...defaultSettings('2026-10-31'), dailyMinutes: 40 })); assert.equal(response.status, 200);
    database.close(); database = createNodeD1(path);
    handle = createNodeHandler({ db: database.db, planner: disabledPlanner, seed, now });
    const bootstrap = await (await handle(request('bootstrap'))).json() as { progress: Progress[]; settings: Settings };
    assert.equal(bootstrap.progress[0].wordId, 'node-word'); assert.equal(bootstrap.settings.dailyMinutes, 40);
    const replay = await (await handle(request('review', 'POST', { eventId: 'adapter-event1', wordId: 'node-word', grade: 'remembered' }))).json() as { duplicate: boolean; progress: Progress };
    assert.equal(replay.duplicate, true); assert.equal(replay.progress.exposuresToday, 1);
    assert.deepEqual(await (await handle(request('plan', 'POST', {}))).json(), firstPlan);
    assert.equal(statSync(path).mode & 0o777, 0o600);
  } finally { database.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('local HTTP adapter rejects external hosts, cross-origin writes, invalid bodies and oversized requests', async () => {
  const database = createNodeD1();
  try {
    const handle = createNodeHandler({ db: database.db, planner: disabledPlanner, seed, now });
    assert.equal((await handle(new Request('http://evil.example/api/v1/bootstrap'))).status, 403);
    assert.equal((await handle(request('review', 'POST', {}, { Origin: 'https://evil.example' }))).status, 403);
    assert.equal((await handle(request('bootstrap', 'GET', undefined, { 'Sec-Fetch-Site': 'cross-site' }))).status, 403);
    assert.equal((await handle(new Request('http://127.0.0.1:8788/api/v1/review', { method: 'POST', body: '{}' }))).status, 415);
    assert.equal((await handle(request('bootstrap', 'POST', {}))).status, 405);
    assert.equal((await handle(request('not-here'))).status, 404);
    assert.equal((await handle(new Request('http://127.0.0.1:8788/api/v1/review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' }))).status, 400);
    assert.equal((await handle(request('import', 'POST', {}, { 'Content-Length': `${9 * 1024 * 1024}` }))).status, 413);
    const streamed = new Request('http://127.0.0.1:8788/api/v1/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: ' '.repeat(8 * 1024 * 1024 + 1) });
    assert.equal((await handle(streamed)).status, 413);
    const b = await handle(request('bootstrap'));
    assert.equal(b.headers.get('cache-control'), 'no-store'); assert.equal(b.headers.get('access-control-allow-origin'), null);
  } finally { database.close(); }
});

test('local adapter uses server-owned namespace and does not trust client owner headers', async () => {
  const database = createNodeD1();
  try {
    const a = createNodeHandler({ db: database.db, planner: disabledPlanner, seed, now, owner: 'a' });
    const b = createNodeHandler({ db: database.db, planner: disabledPlanner, seed, now, owner: 'b' });
    await a(request('review', 'POST', { eventId: 'identity-event', wordId: 'node-word', grade: 'forgot', owner: 'b' }, { 'oai-authenticated-user-id': 'b' }));
    assert.equal((await (await a(request('bootstrap'))).json() as { progress: Progress[] }).progress.length, 1);
    assert.equal((await (await b(request('bootstrap'))).json() as { progress: Progress[] }).progress.length, 0);
  } finally { database.close(); }
});

test('local export/import uses same versioned portable API and dependency-injected planner', async () => {
  const database = createNodeD1();
  try {
    const handle = createNodeHandler({ db: database.db, planner: disabledPlanner, seed, now });
    await handle(request('review', 'POST', { eventId: 'backup-event1', wordId: 'node-word', grade: 'remembered' }));
    const exported = await handle(request('export'));
    assert.match(exported.headers.get('content-disposition')!, /backup\.json/);
    const backup = await exported.json() as { format: string }; assert.equal(backup.format, 'vocab-wheel-backup');
    const response = await handle(request('import', 'POST', { kind: 'backup', data: backup }, { Origin: 'http://127.0.0.1:8788' }));
    assert.equal(response.status, 200);
    assert.equal((await (await handle(request('bootstrap'))).json() as { progress: Progress[] }).progress[0].exposuresToday, 1);
  } finally { database.close(); }
});

test('new rolling day/tick and batch APIs work through real local HTTP adapter', async () => {
 const database=createNodeD1();
 try{
  const handle=createNodeHandler({db:database.db,planner:disabledPlanner,seed,now});
  const before=await (await handle(request('bootstrap'))).json() as {planning:{horizonDays:number;currentBatch:number[]}};
  assert.equal(before.planning.horizonDays,10);assert.deepEqual(before.planning.currentBatch,[1,3]);
  assert.equal((await handle(request('day?day=1'))).status,200);
  const tick=await handle(request('planning/tick','POST',{}));assert.equal(tick.status,200);
  const day=await (await handle(request('day?day=1'))).json() as {status:string;wordIds:string[];date:string};assert.equal(day.status,'ready');assert.deepEqual(day.wordIds,['node-word']);
  const payload={batchId:'adapter-batch-001',day:day.date,ratings:[{wordId:'node-word',grade:'remembered'}],dayCompleted:true};
  const saved=await handle(request('reviews/batch','POST',payload));assert.equal(saved.status,200);
  const replay=await (await handle(request('reviews/batch','POST',payload))).json() as {duplicate:boolean;progress:Progress[]};assert.equal(replay.duplicate,true);assert.equal(replay.progress[0].exposuresToday,1);
  const future=await (await handle(request('day?day=2'))).json() as {canRate:boolean};assert.equal(future.canRate,false);
 }finally{database.close();}
});
