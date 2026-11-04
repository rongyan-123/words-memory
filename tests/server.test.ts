import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { D1Repository } from '../src/server/repository.ts';
import { VocabularyService } from '../src/server/service.ts';
import { AIPlanningError, DeepSeekPlanner, type AIPlanner } from '../src/server/provider.ts';
import { createProgress, defaultSettings, type Plan, type Scene, type Word } from '../src/core/index.ts';

// Node's SQLite adapter exercises the exact D1 SQL and transaction shape locally.
function database() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(`CREATE TABLE word_marks(owner_id TEXT NOT NULL,word_id TEXT NOT NULL,hard_count INTEGER NOT NULL DEFAULT 0 CHECK(hard_count>=0 AND hard_count<=9007199254740991),revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1 AND revision<=9007199254740991),updated_at INTEGER NOT NULL,PRIMARY KEY(owner_id,word_id));
    CREATE TABLE mark_operations(owner_id TEXT NOT NULL,op_id TEXT NOT NULL,word_id TEXT NOT NULL,delta INTEGER NOT NULL CHECK(delta IN(-1,1)),claim_token TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(owner_id,op_id));
    CREATE TABLE plan_config(owner_id TEXT PRIMARY KEY,start_date TEXT NOT NULL,horizon_days INTEGER NOT NULL DEFAULT 10,page_size INTEGER NOT NULL DEFAULT 0,lease_token TEXT,lease_until INTEGER,retry_after INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);
    CREATE TABLE scheduled_days(owner_id TEXT NOT NULL,day TEXT NOT NULL,day_index INTEGER NOT NULL,plan_json TEXT NOT NULL,completed_at INTEGER,created_at INTEGER NOT NULL,PRIMARY KEY(owner_id,day));
    CREATE TABLE reserved_words(owner_id TEXT NOT NULL,word_id TEXT NOT NULL,day TEXT NOT NULL,PRIMARY KEY(owner_id,word_id));
    CREATE TABLE review_batches(owner_id TEXT NOT NULL,batch_id TEXT NOT NULL,payload_hash TEXT NOT NULL,claim_token TEXT NOT NULL,result_json TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(owner_id,batch_id));
    CREATE TABLE custom_lexicon(owner_id TEXT NOT NULL,record_id TEXT NOT NULL,kind TEXT NOT NULL,payload_json TEXT NOT NULL,PRIMARY KEY(owner_id,record_id,kind));
    CREATE TABLE user_state(owner_id TEXT PRIMARY KEY,settings_json TEXT NOT NULL,lexicon_json TEXT NOT NULL,updated_at INTEGER NOT NULL);
    CREATE TABLE word_progress(owner_id TEXT NOT NULL,word_id TEXT NOT NULL,progress_json TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,PRIMARY KEY(owner_id,word_id));
    CREATE TABLE review_events(owner_id TEXT NOT NULL,event_id TEXT NOT NULL,word_id TEXT NOT NULL,grade TEXT NOT NULL,claim_token TEXT NOT NULL,result_json TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(owner_id,event_id));
    CREATE TABLE daily_plans(owner_id TEXT NOT NULL,day TEXT NOT NULL,plan_json TEXT,generations INTEGER NOT NULL DEFAULT 0,claim_token TEXT,locked_until INTEGER,updated_at INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(owner_id,day));`);
  function prepare(query: string) {
    let args: (string | number | null)[] = [];
    const prepared = {
      bind(...values: (string | number | null)[]) {
        for (const value of values) if (typeof value === 'string' && value.startsWith('[')) assert.ok(new TextEncoder().encode(value).byteLength <= 400_000, 'D1 JSON parameter remains bounded');
        args = values; return prepared;
      },
      async first() { return sql.prepare(query).get(...args) ?? null; },
      async all() { return { results: sql.prepare(query).all(...args), success: true, meta: {} }; },
      execute() { const result = sql.prepare(query).run(...args); return { results: [], success: true, meta: { changes: Number(result.changes) } }; },
      async run() { return prepared.execute(); },
    }; return prepared;
  }
  const db = { prepare, async batch(statements: ReturnType<typeof prepare>[]) {
    sql.exec('BEGIN');
    try { const result = []; for (const statement of statements) result.push(statement.execute()); sql.exec('COMMIT'); return result; }
    catch (error) { sql.exec('ROLLBACK'); throw error; }
  } };
  return { db: db as unknown as D1Database, sql };
}
const today = '2026-10-31'; const now = () => Date.parse('2026-10-31T01:00:00Z');
const words: Word[] = Array.from({ length: 20 }, (_, n) => ({ id: `word-${n}`, term: `word${n}`, meaning: `释义${n}`, tags: ['计算机'], sceneIds: ['scene-1'], source: 'CC0 test' }));
const scenes: Scene[] = [{ id: 'scene-1', title: '部署网站', description: '顺序执行部署任务', task: '完成一次真实部署', wordIds: words.map(w => w.id) }];
const noAI = { configured: false, async generate(): Promise<Plan> { throw new Error('must not call'); } };
function setup(planner:AIPlanner = noAI) { const d = database(); const repository = new D1Repository(d.db, now); return { ...d, repository, service: new VocabularyService(repository, planner, { words, scenes, info: { coverage: 'test' } }, now) }; }

test('bootstrap persists default settings and keeps owners isolated', async () => {
  const { service } = setup();
  await service.settings('owner-a', { ...defaultSettings(today), dailyMinutes: 35 });
  assert.equal((await service.bootstrap('owner-a')).settings.dailyMinutes, 35);
  assert.equal((await service.bootstrap('owner-b')).settings.dailyMinutes, 20);
  assert.equal((await service.bootstrap('owner-a')).lexiconCounts.total, 20);
});

test('event replay is idempotent; new events have bounded exposures and cannot double-advance', async () => {
  const { service } = setup();
  const first = await service.review('a', { eventId: 'event-0001', wordId: 'word-0', grade: 'forgot' });
  assert.equal(first.progress.exposuresToday, 1);
  const replay = await service.review('a', { eventId: 'event-0001', wordId: 'word-0', grade: 'forgot' });
  assert.equal(replay.duplicate, true); assert.equal(replay.progress.exposuresToday, 1);
  await assert.rejects(service.review('a', { eventId: 'event-0001', wordId: 'word-0', grade: 'remembered' }), /同一事件/);
  for (let n = 2; n <= 4; n++) await service.review('a', { eventId: `event-000${n}`, wordId: 'word-0', grade: 'remembered' });
  const p = (await service.bootstrap('a')).progress[0];
  assert.equal(p.exposuresToday, 3); assert.equal(p.stage, 0); assert.equal(p.nextDueOn, '2026-11-01');
  assert.equal((await service.bootstrap('b')).progress.length, 0);
});

test('optimistic revision rejects stale writes and duplicate event tokens atomically', async () => {
  const { repository } = setup();
  await repository.load('a', today);
  const p = { ...createProgress('word-0'), firstLearnedOn: today, nextDueOn: '2026-11-01', lastExposureOn: today, lastReviewedOn: today, exposuresToday: 1, lastGrade: 'remembered' as const };
  const result = { wordId: 'word-0', grade: 'remembered' as const, progress: p, applied: true, reason: 'applied' };
  assert.equal(await repository.commitReview('a', 'unique-event-1', 0, result), true);
  assert.equal(await repository.commitReview('a', 'unique-event-1', 0, result), false);
  assert.equal(await repository.commitReview('a', 'unique-event-2', 0, result), false);
  assert.equal(await repository.event('a', 'unique-event-2'), null);
  assert.equal((await repository.progress('a', 'word-0')).revision, 1);
});

test('missing AI produces labelled durable curated plan and cached requests spend nothing', async () => {
  const { service } = setup();
  const plan = await service.plan('a');
  assert.equal(plan.source, 'curated'); assert.match(plan.notice, /非 AI/);
  assert.deepEqual(await service.plan('a'), plan);
  await assert.rejects(service.plan('a', true), /冻结/);
});

test('AI outage is a labelled fallback, not a broken study day', async () => {
  const { service } = setup({ configured: true, async generate() { throw new Error('legacy unused'); }, async generateSemantic() { throw new Error('network'); } });
  const plan = await service.plan('a'); assert.equal(plan.source, 'curated'); assert.match(plan.notice, /AI 暂时不可用/);
});

test('lexicon imports preserve source and reject built-in ID collisions; backup is portable', async () => {
  const { service } = setup();
  const imported = { words: [{ id: 'my-hello', term: 'hello', meaning: '你好', tags: [], sceneIds: [] }] };
  await service.import('a', { kind: 'lexicon', data: imported });
  const b = await service.bootstrap('a'); assert.equal(b.lexiconCounts.imported, 1); assert.match(b.words.find(w => w.id === 'my-hello')!.source!, /用户导入/);
  await assert.rejects(service.import('a', { kind: 'lexicon', data: { words: [{ ...words[0], sceneIds: [] }] } }), /冲突/);
  await service.review('a', { eventId: 'backup-event-1', wordId: 'my-hello', grade: 'remembered' });
  const backup = await service.export('a');
  await service.import('b', { kind: 'backup', data: backup });
  assert.deepEqual((await service.bootstrap('b')).progress, (await service.bootstrap('a')).progress);
  assert.equal((await service.bootstrap('b')).settings.dailyMinutes, backup.settings.dailyMinutes);
  const future = [{ ...backup.progress[0], firstLearnedOn: '2026-11-02', lastExposureOn: '2026-11-02', lastReviewedOn: '2026-11-02', nextDueOn: '2026-11-03' }];
  await assert.rejects(service.import('a', { kind: 'progress', data: future }), /未来/);
});

test('provider uses official Flash low JSON without an artificial output-token budget and rejects unknown model IDs', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (url, init) => {
    calls++; assert.equal(url, 'https://api.deepseek.com/chat/completions');
    const body = JSON.parse(init!.body as string); assert.equal(body.model, 'deepseek-flash'); assert.equal(body.reasoning_effort, 'low'); assert.equal(body.response_format.type, 'json_object'); assert.equal('max_tokens' in body, false); assert.equal('max_completion_tokens' in body, false);
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ title: '测试计划', rationale: '这是任务链', groups: [{ sceneId: 'scene-1', title: '部署任务', task: '完成部署', wordIds: ['not-in-lexicon'] }] }) } }] }));
  };
  const provider = new DeepSeekPlanner('test-placeholder-not-a-real-key', fetcher);
  await assert.rejects(provider.generate({ date: today, words, scenes, availableWordIds: words.map(w => w.id), range: { min: 1, max: 4, target: 2, capacity: 4, remaining: 20, daysLeft: 30, reviewMinutes: 0, reason: 'test' } }), /AI_PLAN_INVALID/);
  assert.equal(calls, 1);
});

test('valid AI plan carries verified provider token usage and source metadata', async () => {
  const fetcher: typeof fetch = async () => new Response(JSON.stringify({ usage: { prompt_tokens: 110, completion_tokens: 70, total_tokens: 180 }, choices: [{ message: { content: JSON.stringify({ title: '真实部署任务', rationale: '先准备主机再部署应用', groups: [{ sceneId: 'scene-1', title: '配置主机', task: '依次完成部署步骤', wordIds: ['word-0','word-1'] }] }) } }] }));
  const provider = new DeepSeekPlanner('placeholder-not-a-secret', fetcher);
  const plan = await provider.generate({ date: today, words, scenes, availableWordIds: words.map(w => w.id), range: { min: 1, max: 4, target: 2, capacity: 4, remaining: 20, daysLeft: 30, reviewMinutes: 0, reason: 'test' } });
  assert.equal(plan.source, 'ai'); assert.equal(plan.aiModel, 'deepseek-flash'); assert.equal(plan.aiReasoning, 'low'); assert.equal(plan.aiUsage!.totalTokens, 180);
});

test('large lexicon uses bounded per-record storage and supports merge without deleting history', async () => {
  const { service, sql } = setup();
  const imported = { words: Array.from({ length: 1200 }, (_, n) => ({ id: `my-large-${n}`, term: `term${n}`, meaning: '含义'.repeat(100), tags: [], sceneIds: [], source: 'Original CC0 test' })) };
  await service.import('a', { kind: 'lexicon', data: imported });
  assert.equal((await service.bootstrap('a')).lexiconCounts.imported, 1200);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM custom_lexicon').get()!.n, 1200);
  await service.import('a', { kind: 'lexicon', data: { words: [{ id: 'my-extra', term: 'extra', meaning: '额外的', tags: [], sceneIds: [] }] } });
  assert.equal((await service.bootstrap('a')).lexiconCounts.imported, 1201);
});

test('past overdue backup progress remains valid and deduped due today', async () => {
  const { service } = setup();
  const p = { ...createProgress('word-0'), firstLearnedOn: '2026-10-01', nextDueOn: '2026-10-02', lastReviewedOn: '2026-10-01', lastExposureOn: '2026-10-01', exposuresToday: 1, lastGrade: 'remembered' };
  await service.import('a', { kind: 'progress', data: [p] });
  const b = await service.bootstrap('a'); assert.deepEqual(b.dueWordIds, ['word-0']); assert.equal(b.stats.due, 1);
  const result = await service.review('a', { eventId: 'overdue-test-1', wordId: 'word-0', grade: 'remembered' });
  assert.equal(result.progress.stage, 1); assert.equal(result.progress.nextDueOn, '2026-11-01');
  assert.equal((await service.bootstrap('a')).stats.due, 0);
});

test('simultaneous same-event requests count once and late replays return latest state', async () => {
  const { service } = setup();
  const payload = { eventId: 'concurrent-event', wordId: 'word-0', grade: 'forgot' };
  const results = await Promise.all(Array.from({ length: 12 }, () => service.review('a', payload)));
  assert.equal(results.filter(r => !r.duplicate).length, 1);
  assert.equal((await service.bootstrap('a')).progress[0].exposuresToday, 1);
  await service.review('a', { ...payload, eventId: 'next-event-0001', grade: 'remembered' });
  const late = await service.review('a', payload); assert.equal(late.duplicate, true); assert.equal(late.progress.exposuresToday, 2);
});

test('three concurrent distinct grades are serialized by revision without losing updates', async () => {
  const { service } = setup();
  await Promise.all(Array.from({ length: 3 }, (_, n) => service.review('a', { eventId: `distinct-event-${n}`, wordId: 'word-0', grade: 'remembered' })));
  const p = (await service.bootstrap('a')).progress[0]; assert.equal(p.exposuresToday, 3); assert.equal(p.stage, 0);
});

test('full 10000-word corpus plus every built-in progress exports under 8MiB and restores', async () => {
  const { service } = setup();
  const importedWords = Array.from({ length: 10_000 }, (_, n) => ({ id: `my-${String(n).padStart(5,'0')}${'a'.repeat(92)}`, term: `term${n}`, meaning: '原创释义'.repeat(5), tags: [], sceneIds: [], source: 'Original CC0' }));
  await service.import('a', { kind: 'lexicon', data: { words: importedWords } });
  const all = (await service.bootstrap('a')).words;
  const progress = all.map(w => ({ ...createProgress(w.id), firstLearnedOn: '2026-10-01', stage: 2, nextDueOn: '2026-11-01', lastReviewedOn: '2026-10-30', lastExposureOn: '2026-10-30', exposuresToday: 3, lastGrade: 'remembered' }));
  await service.import('a', { kind: 'progress', data: progress });
  const backup = await service.export('a');
  assert.equal(backup.progress.length, 10_020);
  assert.ok(new TextEncoder().encode(JSON.stringify(backup)).byteLength < 8 * 1024 * 1024);
  await service.import('b', { kind: 'backup', data: backup });
  const restored = await service.bootstrap('b'); assert.equal(restored.progress.length, 10_020); assert.equal(restored.lexiconCounts.imported, 10_000);
});

test('cumulative lexicon resource cap rejects oversized data before any write', async () => {
  const { service } = setup();
  const tooLarge = { words: Array.from({ length: 2500 }, (_, n) => ({ id: `my-oversize-${n}`, term: `term${n}`, meaning: '含'.repeat(490), tags: [], sceneIds: [], source: 'CC0' })) };
  await assert.rejects(service.import('a', { kind: 'lexicon', data: tooLarge }), /3 MiB/);
  assert.equal((await service.bootstrap('a')).lexiconCounts.imported, 0);
});


test("AI fallback persists safe category diagnostics for hosted acceptance", async () => {
 const {service} = setup({configured:true, async generate(){throw new Error('legacy unused');}, async generateSemantic(){throw new AIPlanningError("AI_OUTPUT_TRUNCATED",{finishReason:"length",completionTokens:2400,contentChars:0});}});
 const plan = await service.plan("a"); assert.equal(plan.source,"curated"); assert.equal(plan.aiFailure?.code,"AI_OUTPUT_TRUNCATED"); assert.match(plan.notice,/AI_OUTPUT_TRUNCATED/); assert.deepEqual((await service.bootstrap("a")).plan?.aiFailure,plan.aiFailure);
});
