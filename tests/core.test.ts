import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, applyGrade, buildFallbackPlan, calculateNewWordRange, canRepeat, createProgress, dateKey, daysBetween, defaultSettings, dueProgress, isDateKey, memoryStatus, validateAIPlan, validateLexiconImport, validateProgressImport, validateSettings, validateSemanticSelection, buildSemanticFallback, rollingBatch, uniqueDayWordIds } from '../src/core/index.ts';
import type { Progress, Word, Scene } from '../src/core/index.ts';

const TODAY = '2026-10-31';
const word = (id: string, sceneIds = ['deploy']): Word => ({ id, term: id, meaning: `释义 ${id}`, tags: ['tech'], sceneIds });
const words = ['server','deploy','configure','memory','allocate','release'].map(id => word(id));
const scenes: Scene[] = [{ id: 'deploy', title: '部署服务', description: '部署前检查、配置、发布', wordIds: words.map(w => w.id), task: '从配置服务器到上线服务。' }];
const grade = (p: Progress, value: 'remembered' | 'fuzzy' | 'forgot', day = TODAY) => applyGrade(p, value, day).progress;

test('Shanghai calendar boundary is not the UTC date', () => {
  assert.equal(dateKey('2026-10-31T15:59:59Z'), '2026-10-31');
  assert.equal(dateKey('2026-10-31T16:00:00Z'), '2026-11-01');
  assert.equal(dateKey('2026-03-08T16:00:00Z'), '2026-03-09');
  assert.throws(() => dateKey('invalid'));
});
test('calendar arithmetic handles leap day/year transitions and rejects impossible dates', () => {
  assert.equal(addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(daysBetween('2026-10-31', '2026-11-07'), 7);
  assert.equal(isDateKey('2026-02-29'), false);
  assert.throws(() => addDays('2026-02-30', 1));
});
test('first learning anchors 1/3/7 days and remembered never advances on learning day', () => {
  let p = grade(createProgress('server'), 'remembered');
  assert.equal(p.firstLearnedOn, TODAY); assert.equal(p.stage, 0); assert.equal(p.nextDueOn, '2026-11-01');
  assert.equal(memoryStatus(p), 'learning');
  assert.throws(() => applyGrade(p, 'remembered', '2026-10-30'));
  p = grade(p, 'remembered'); assert.equal(p.stage, 0);
  p = grade(p, 'remembered', '2026-11-01'); assert.equal(p.stage, 1); assert.equal(p.nextDueOn, '2026-11-03');
  p = grade(p, 'remembered', '2026-11-03'); assert.equal(p.stage, 2); assert.equal(p.nextDueOn, '2026-11-07');
  p = grade(p, 'remembered', '2026-11-07'); assert.equal(p.stage, 3); assert.equal(p.nextDueOn, null); assert.equal(memoryStatus(p), 'solid');
});
test('weak wheel repeats are bounded at three exposures and do not falsely advance a day stage', () => {
  let p = grade(createProgress('server'), 'forgot');
  assert.equal(canRepeat(p, TODAY), true);
  p = grade(p, 'fuzzy'); assert.equal(p.exposuresToday, 2);
  p = grade(p, 'remembered'); assert.equal(p.exposuresToday, 3); assert.equal(p.stage, 0);
  assert.equal(canRepeat(p, TODAY), false);
  assert.deepEqual(applyGrade(p, 'forgot', TODAY), { progress: p, applied: false, reason: 'daily_limit' });
  p = grade(p, 'forgot', '2026-11-01'); assert.equal(p.exposuresToday, 1); assert.equal(p.stage, 0); assert.equal(p.nextDueOn, '2026-11-02');
  p = grade(p, 'remembered', '2026-11-01'); assert.equal(p.stage, 0); assert.equal(p.nextDueOn, '2026-11-02');
});
test('late review deduplicates overdue items, advances once, and never schedules another stage today', () => {
  const original = grade(createProgress('server'), 'remembered');
  assert.equal(dueProgress([original, { ...original }], '2026-11-10').length, 1);
  let p = grade(original, 'remembered', '2026-11-10');
  assert.equal(p.stage, 1); assert.equal(p.nextDueOn, '2026-11-11');
  assert.equal(dueProgress([p], '2026-11-10').length, 0);
  p = grade(p, 'remembered', '2026-11-10'); assert.equal(p.stage, 1);
  p = grade(p, 'remembered', '2026-11-11'); assert.equal(p.stage, 2); assert.equal(p.nextDueOn, '2026-11-12');
});
test('fuzzy and forgotten reviews retry tomorrow without erasing passed stages', () => {
  let p = grade(createProgress('server'), 'remembered');
  p = grade(p, 'remembered', '2026-11-01');
  p = grade(p, 'forgot', '2026-11-03'); assert.equal(p.stage, 1); assert.equal(p.nextDueOn, '2026-11-04');
  p = grade(p, 'fuzzy', '2026-11-04'); assert.equal(p.stage, 1); assert.equal(p.nextDueOn, '2026-11-05');
});
test('range respects review budget, remaining words, goal pace, finite bounds, and max60', () => {
  const settings = defaultSettings(TODAY);
  const ordinary = calculateNewWordRange({ remaining: 1000, dueCount: 0, settings, today: TODAY });
  assert.ok(ordinary.min <= ordinary.target && ordinary.target <= ordinary.max && ordinary.max <= 60);
  const heavy = calculateNewWordRange({ remaining: 1000, dueCount: 1000, settings, today: TODAY });
  assert.equal(heavy.min, 0); assert.equal(heavy.max, 0);
  const done = calculateNewWordRange({ remaining: 0, dueCount: 1, settings, today: TODAY });
  assert.equal(done.max, 0);
  const small = calculateNewWordRange({ remaining: 2, dueCount: 0, settings, today: TODAY });
  assert.ok(small.max <= 2);
  const overdueGoal = calculateNewWordRange({ remaining: 1000, dueCount: 0, settings: { ...settings, goalDate: '2026-01-01', dailyMinutes: 180, newWordSeconds: 10 }, today: TODAY });
  assert.equal(overdueGoal.max, 60); assert.equal(overdueGoal.daysLeft, 1);
  const invalidCounts = calculateNewWordRange({ remaining: Number.NaN, dueCount: Infinity, settings, today: TODAY });
  assert.ok(Object.values(invalidCounts).filter(v => typeof v === 'number').every(Number.isFinite));
  assert.throws(() => validateSettings({ ...settings, dailyMinutes: Infinity }));
});
test('curated fallback chooses known unlearned IDs once, stays bounded, and honestly labels source', () => {
  const p = buildFallbackPlan({ words, scenes, availableWordIds: ['server','deploy','configure'], range: { min: 2, max: 3 }, date: TODAY });
  assert.equal(p.source, 'curated'); assert.match(p.notice, /未调用 AI/);
  assert.deepEqual(p.wordIds, ['server','deploy','configure']);
  assert.equal(new Set(p.wordIds).size, p.wordIds.length);
  const zero = buildFallbackPlan({ words, scenes, availableWordIds: words.map(w => w.id), range: { min: 0, max: 0 }, date: TODAY });
  assert.deepEqual(zero.wordIds, []); assert.equal(zero.groups.length, 0);
});
test('range widens for a whole fourteen-word scene within twenty-minute budget', () => {
  const settings = defaultSettings(TODAY);
  const range = calculateNewWordRange({ remaining: 224, dueCount: 0, settings, today: TODAY, groupSizes: [14, 14, 14] });
  assert.equal(range.target, 8); assert.ok(range.min <= 14 && range.max >= 14); assert.ok(range.max <= range.capacity);
  const manyWords = Array.from({ length: 14 }, (_, i) => word(`task${i}`));
  const wholeScene = { ...scenes[0], wordIds: manyWords.map(w => w.id) };
  const plan = buildFallbackPlan({ words: manyWords, scenes: [wholeScene], availableWordIds: manyWords.map(w => w.id), range, date: TODAY });
  assert.equal(plan.wordIds.length, 14); assert.equal(plan.groups[0].title, wholeScene.title); assert.doesNotMatch(plan.notice, /任务片段/);
});
test('fallback prefers complete fitting scene over a larger scene and labels unavoidable fragments', () => {
  const manyWords = Array.from({ length: 30 }, (_, i) => word(`task${i}`));
  const big = { ...scenes[0], id: 'big', title: '完整部署', wordIds: manyWords.map(w => w.id) };
  const small = { ...scenes[0], id: 'small', title: '预检', wordIds: manyWords.slice(0, 6).map(w => w.id) };
  const input = { words: manyWords, scenes: [big, small], availableWordIds: manyWords.map(w => w.id), range: { min: 6, max: 11 }, date: TODAY };
  const whole = buildFallbackPlan(input);
  assert.equal(whole.wordIds.length, 6); assert.equal(whole.groups[0].sceneId, 'small'); assert.doesNotMatch(whole.notice, /任务片段/);
  const fragment = buildFallbackPlan({ ...input, scenes: [big] });
  assert.equal(fragment.wordIds.length, 11); assert.match(fragment.groups[0].title, /任务片段/); assert.match(fragment.groups[0].task, /时间预算分阶段/); assert.match(fragment.notice, /分阶段/);
});
test('thirty-word scene may widen range to thirty when the time capacity allows it', () => {
  const settings = { ...defaultSettings(TODAY), goalDate: addDays(TODAY, 29), dailyMinutes: 60 };
  const range = calculateNewWordRange({ remaining: 600, dueCount: 0, settings, today: TODAY, groupSizes: [30] });
  assert.equal(range.target, 20); assert.ok(range.max >= 30); assert.ok(range.max <= 60);
  const heavy = calculateNewWordRange({ remaining: 600, dueCount: 1000, settings, today: TODAY, groupSizes: [30] });
  assert.equal(heavy.max, 0);
});
test('AI plan validator rejects hallucinated, duplicate, out-of-budget and unrelated IDs', () => {
  const input = { availableWordIds: ['server','deploy','configure'], scenes, range: { min: 2, max: 3 }, date: TODAY };
  const data = { title: '部署一个服务', rationale: '按操作顺序快速记忆', groups: [{ sceneId: 'deploy', title: '部署步骤', task: '先配置，再发布服务。', wordIds: ['server','deploy'] }] };
  assert.equal(validateAIPlan(data, input).source, 'ai');
  assert.throws(() => validateAIPlan({ ...data, groups: [{ ...data.groups[0], wordIds: ['server','ghost'] }] }, input));
  assert.throws(() => validateAIPlan({ ...data, groups: [{ ...data.groups[0], wordIds: ['server','server'] }] }, input));
  assert.throws(() => validateAIPlan({ ...data, groups: [{ ...data.groups[0], wordIds: ['server'] }] }, input));
  assert.throws(() => validateAIPlan({ ...data, groups: [{ ...data.groups[0], sceneId: 'imagined' }] }, input));
  assert.throws(() => validateAIPlan({ ...data, groups: [{ ...data.groups[0], sceneId: 'imported' }] }, input));
  const withOther = { ...input, availableWordIds: [...input.availableWordIds,'island'], scenes: [...scenes, { id: 'travel', title: '旅行', description: '', wordIds: ['island'] }] };
  assert.throws(() => validateAIPlan({ ...data, groups: [{ ...data.groups[0], wordIds: ['server','island'] }] }, withOther));
});
test('lexicon import validates schema, unique IDs, refs, and plain-text bounds', () => {
  assert.equal(validateLexiconImport({ words, scenes }).words.length, words.length);
  assert.throws(() => validateLexiconImport({ words: [words[0], words[0]], scenes }));
  assert.throws(() => validateLexiconImport({ words: [{ ...words[0], term: '' }], scenes }));
  assert.throws(() => validateLexiconImport({ words, scenes: [{ ...scenes[0], wordIds: ['missing'] }] }));
  assert.throws(() => validateLexiconImport({ words: [{ ...words[0], sceneIds: ['missing'] }], scenes: [] }));
  assert.equal(validateLexiconImport({ words: [{ id:'mine',term:'my word',meaning:'自定义词' }] }).words[0].tags.length, 0);
});
test('progress import validates known IDs, stages, coherent dates, and counts', () => {
  const learned = grade(createProgress('server'), 'remembered');
  assert.deepEqual(validateProgressImport([learned], ['server']), [learned]);
  assert.throws(() => validateProgressImport([learned, learned], ['server']));
  assert.throws(() => validateProgressImport([learned], []));
  assert.throws(() => validateProgressImport([{ ...learned, stage: 4 }], ['server']));
  assert.throws(() => validateProgressImport([{ ...learned, lastReviewedOn: null }], ['server']));
  assert.throws(() => validateProgressImport([{ ...learned, lastExposureOn: '2026-10-30' }], ['server']));
  assert.throws(() => validateProgressImport([{ ...learned, stage: 3 }], ['server']));
  assert.throws(() => validateProgressImport([{ ...learned, exposuresToday: 4 }], ['server']));
  assert.throws(() => validateProgressImport([{ ...learned, nextDueOn: '2026-02-30' }], ['server']));
  assert.throws(() => validateProgressImport([{ ...createProgress('server'), nextDueOn: '2026-11-01' }], ['server']));
});

test('progress backup supports built-in plus ten-thousand imported words without unbounded input', () => {
  const ids = Array.from({ length: 10_224 }, (_, i) => `many-${i}`);
  assert.equal(validateProgressImport(ids.map(createProgress), ids).length, ids.length);
  const excess = Array.from({ length: 20_001 }, (_, i) => `excess-${i}`);
  assert.throws(() => validateProgressImport(excess.map(createProgress), excess));
});

test('horizon/page settings are validated independently from daily memory rules', () => {
  const defaults = defaultSettings(TODAY);
  assert.equal(defaults.horizonDays, 10); assert.equal(defaults.pageSize, 0);
  assert.equal(validateSettings({ ...defaults, horizonDays: 10, pageSize: 20 }).pageSize, 20);
  assert.equal(validateSettings({ ...defaults, horizonDays: undefined, pageSize: undefined }).horizonDays, 10);
  assert.throws(() => validateSettings({ ...defaults, horizonDays: 0 }));
  assert.throws(() => validateSettings({ ...defaults, horizonDays: 3.5 }));
  assert.throws(() => validateSettings({ ...defaults, pageSize: 201 }));
});
test('semantic selection accepts naturally sized 32- and 200-word groups without daily quota clipping', () => {
  for (const count of [32, 64, 200]) {
    const ids = Array.from({ length: count }, (_, i) => `semantic-${i}`);
    const fullScene = { ...scenes[0], wordIds: ids };
    const selected = validateSemanticSelection({ title: '一次完整的部署', rationale: '按真实部署任务形成完整语义组', groups: [{ sceneId: fullScene.id, title: '完整部署链路', task: '从环境准备一直推进到验证上线', wordIds: ids }] }, { availableWordIds: ids, scenes: [fullScene] });
    assert.equal(selected.wordIds.length, count); assert.equal(selected.groups[0].wordIds.length, count);
    assert.equal(selected.source, 'ai'); assert.equal('date' in selected, false);
    assert.match(selected.notice, /不受每日分钟数或分页大小限制/);
  }
});
test('semantic response safety is not a target and rejects invalid membership or more than 200', () => {
  const ids = Array.from({ length: 201 }, (_, i) => `semantic-${i}`);
  const scene = { ...scenes[0], wordIds: ids };
  const raw = { title: '语义任务', rationale: '语义决定自然数量', groups: [{ sceneId: scene.id, title: '任务步骤', task: '一组完整的任务步骤', wordIds: ids }] };
  assert.throws(() => validateSemanticSelection(raw, { availableWordIds: ids, scenes: [scene] }));
  assert.throws(() => validateSemanticSelection({ ...raw, groups: [] }, { availableWordIds: ids, scenes: [scene] }));
  assert.throws(() => validateSemanticSelection({ ...raw, groups: [{ ...raw.groups[0], wordIds: [ids[0], ids[0]] }] }, { availableWordIds: ids, scenes: [scene] }));
  assert.throws(() => validateSemanticSelection({ ...raw, groups: [{ ...raw.groups[0], wordIds: ['missing'] }] }, { availableWordIds: ids, scenes: [scene] }));
  assert.throws(() => validateSemanticSelection({ ...raw, groups: [{ ...raw.groups[0], sceneId: 'imported', wordIds: ids.slice(0, 32) }] }, { availableWordIds: ids, scenes: [scene] }));
  const small = validateSemanticSelection({ ...raw, groups: [{ ...raw.groups[0], wordIds: ids.slice(0, 2) }] }, { availableWordIds: ids, scenes: [scene] });
  assert.equal(small.wordIds.length, 2);
});
test('semantic fallback keeps a whole 32-word task and reservation never creates learning progress', () => {
  const ids = Array.from({ length: 32 }, (_, i) => `reserve-${i}`);
  const fullScene = { ...scenes[0], wordIds: ids };
  const originalProgress = ids.map(createProgress);
  const before = JSON.stringify(originalProgress);
  const selected = buildSemanticFallback({ words: ids.map(id => word(id)), scenes: [fullScene], availableWordIds: ids });
  assert.equal(selected.wordIds.length, 32); assert.equal(selected.source, 'curated');
  assert.equal(JSON.stringify(originalProgress), before);
  assert.equal(originalProgress.every(p => p.firstLearnedOn === null), true);
  assert.equal(dueProgress(originalProgress, '2026-11-07').length, 0);
});
test('rolling horizon exposes only three-day batches and advances by calendar or completion', () => {
  assert.deepEqual(rollingBatch('2026-10-31', TODAY, 10), [1, 3]);
  assert.deepEqual(rollingBatch('2026-11-02', TODAY, 10), [1, 3]);
  assert.deepEqual(rollingBatch('2026-11-03', TODAY, 10), [4, 6]);
  assert.deepEqual(rollingBatch(TODAY, TODAY, 10, [1, 2]), [1, 3]);
  assert.deepEqual(rollingBatch(TODAY, TODAY, 10, [3]), [4, 6]);
  assert.deepEqual(rollingBatch(TODAY, TODAY, 10, [3, 6]), [7, 9]);
  assert.deepEqual(rollingBatch(TODAY, TODAY, 10, [3, 6, 9]), [10, 10]);
  assert.deepEqual(rollingBatch('2026-12-20', TODAY, 10), [10, 10]);
  assert.deepEqual(rollingBatch('2026-10-30', TODAY, 2), [1, 2]);
  assert.throws(() => rollingBatch(TODAY, TODAY, 0));
});
test('rolling calendar changes at Shanghai midnight, not UTC midnight', () => {
  assert.deepEqual(rollingBatch(dateKey('2026-11-02T15:59:59Z'), TODAY, 10), [1, 3]);
  assert.deepEqual(rollingBatch(dateKey('2026-11-02T16:00:00Z'), TODAY, 10), [4, 6]);
});
test('daily lists dedupe new/review overlap in stable new-first order', () => {
  assert.deepEqual(uniqueDayWordIds(['a', 'b', 'a'], ['b', 'c', 'c']), ['a', 'b', 'c']);
  assert.deepEqual(uniqueDayWordIds([], ['b', 'c']), ['b', 'c']);
  assert.throws(() => uniqueDayWordIds(['bad id'], []));
});

test('lexicon scenes may reference only explicit trusted existing IDs plus new imported IDs', () => {
  const trusted = Object.freeze(['w-server']);
  const seed = Object.freeze({ id: 'w-server', term: 'server', meaning: '服务器', sceneIds: Object.freeze(['seed-scene']) });
  const input = {
    words: [{ id: 'my-runtime', term: 'runtime', meaning: '运行时', tags: [], sceneIds: ['my-cet4-runtime'] }],
    scenes: [{ id: 'my-cet4-runtime', title: '运行环境', description: '沿用已存在词条并补充新词', wordIds: ['w-server', 'my-runtime'] }],
  };
  assert.throws(() => validateLexiconImport(input), /未知单词/);
  const result = validateLexiconImport(input, trusted);
  assert.deepEqual(result.scenes[0].wordIds, ['w-server', 'my-runtime']);
  assert.deepEqual(result.words.map(word => word.id), ['my-runtime']);
  assert.deepEqual(trusted, ['w-server']); assert.deepEqual(seed.sceneIds, ['seed-scene']);
  assert.equal(seed.meaning, '服务器');
});
test('payload-asserted IDs, unknown IDs and IDs outside trusted owner context remain rejected', () => {
  const input = {
    knownWordIds: ['other-owner-word'],
    words: [{ id: 'my-word', term: 'word', meaning: '单词', tags: [], sceneIds: ['my-scene'] }],
    scenes: [{ id: 'my-scene', title: '我的情境', description: '', wordIds: ['my-word', 'other-owner-word'] }],
  };
  assert.throws(() => validateLexiconImport(input), /未知单词/);
  assert.throws(() => validateLexiconImport(input, ['my-owner-existing-word']), /未知单词/);
  assert.throws(() => validateLexiconImport(input, ['invalid trusted id']), /可信词 ID/);
  assert.throws(() => validateLexiconImport(input, new Array(20_001).fill('w-server')), /可信词 ID/);
  assert.throws(() => validateLexiconImport(input, null as unknown as string[]), /可信词 ID/);
});
test('trusted word IDs do not broaden imported words scene-reference authority', () => {
  const input = {
    words: [{ id: 'my-word', term: 'word', meaning: '单词', tags: [], sceneIds: ['seed-scene'] }],
    scenes: [{ id: 'my-scene', title: '我的情境', description: '', wordIds: ['my-word', 'w-server'] }],
  };
  assert.throws(() => validateLexiconImport(input, ['w-server']), /未知情境/);
});
