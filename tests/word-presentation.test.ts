import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Word } from '../src/core/index.ts';
import { seedWords } from '../src/data/seed.ts';
import { computingCandidateWordIds, expansionInfo, seedWordOverlays } from '../src/data/lexicon-expansion.ts';
import { enrichWordForPlanning, wordPresentation } from '../src/data/word-presentation.ts';

const source = 'ECDICT @ab22ad36302c · MIT声明；上游混合来源，个人试用';
const seed = (term: string): Word => {
  const word = seedWords.find(word => word.term.toLowerCase() === term.toLowerCase());
  assert.ok(word, `Missing seed fixture: ${term}`);
  return word;
};
const sha = (text: string): string => createHash('sha256').update(text).digest('hex');
const fixture = (id: string, term: string, meaning: string): Word => ({ id, term, meaning, source,
  tags: ['cet4'], sceneIds: ['exp-cet4-ecdict'] });
const host = fixture('ec-host-4740ae63', 'host', 'n. 主人, 旅馆老板, 节目主持人\nvt. 当主人招待, 作...节目主持人\n[计] 主机, 宿主机');
const thread = fixture('ec-thread-39200d1e', 'thread', 'n. 线, 丝, 纤维, 线索\nvt. 穿线于, 穿过, 通过, 用线穿成\nvi. 穿过\n[计] 线索, 线程');

test('frozen expansion counts, hashes and non-official boundary remain explicit', () => {
  assert.equal(expansionInfo.totalWords, 3966);
  assert.equal(expansionInfo.newWords, 3742);
  assert.equal(expansionInfo.cet4Words, 3847);
  assert.equal(expansionInfo.rawCet4Members, 3849);
  assert.equal(expansionInfo.seedCet4Overlap, 129);
  assert.equal(expansionInfo.frozenImportSha256, '77391cc759b88f4a54917dd020af388f9596746d1f7510a07a39773ae47a1f69');
  assert.equal(expansionInfo.frozenMetadataSha256, 'aa8c0dea5e2d5ab3cdb2f1d5d29faefdf666b12423d635b542ef3c5e461b10d0');
  assert.match(expansionInfo.sourceNote, /非官方完整大纲/);
  assert.match(expansionInfo.license, /未完整核验/);
  assert.match(expansionInfo.phoneticNote, /不应全部标为美音/);
});

test('130 overlays use actual immutable seed IDs and exact 129 CET memberships', () => {
  const overlays = Object.entries(seedWordOverlays);
  assert.equal(overlays.length, 130);
  for (const [id, overlay] of overlays) {
    assert.equal(seedWords.find(word => word.id === id)?.term, overlay.term);
    assert.ok(Object.isFrozen(overlay));
    assert.ok(Object.isFrozen(overlay.addTags));
  }
  const cetIds = overlays.filter(([, overlay]) => overlay.cet4).map(([id]) => id).sort();
  assert.equal(cetIds.length, 129);
  // Fixed from the separately hashed approved metadata, not reconstructed from
  // whether a headword looks technical or sounds likely to appear on CET4.
  assert.equal(sha(cetIds.join('\n')), 'd95ad65691d048d7642bcc632d649c2a5ad353d49d2191d72932a77a3ad80715');
  assert.deepEqual(overlays.filter(([, overlay]) => !overlay.cet4).map(([id]) => id), ['w-runtime']);
  assert.deepEqual(seedWordOverlays['w-runtime'].addTags, ['cloud-native', 'programming']);
  assert.equal(seedWordOverlays['w-runtime'].generalMeaning, undefined);
});


test('runtime metadata wording never replaces or masquerades as its original scenario meaning', () => {
  const runtime = seed('runtime');
  const before = structuredClone(runtime);
  const supplemental = seedWordOverlays[runtime.id].technicalMeaning;
  assert.notEqual(supplemental, runtime.meaning);
  const view = wordPresentation(runtime);
  assert.equal(view.meanings[0].label, '本场景义 · 原创例句');
  assert.equal(view.meanings[0].text, runtime.meaning);
  assert.equal(view.meanings.some(section => section.text === supplemental), false);
  assert.ok(view.tags.includes('cloud-native'));
  assert.equal(view.tags.includes('cet4'), false);
  const enriched = enrichWordForPlanning(runtime);
  assert.ok(enriched.meaning.startsWith(`【本场景义 · 原创例句】${runtime.meaning}`));
  assert.equal(enriched.meaning.includes('或容器'), false);
  assert.deepEqual(runtime, before);
});

test('608 computing candidates exactly match source IDs; only 603 are CET4 members', () => {
  assert.equal(computingCandidateWordIds.size, 608);
  assert.equal(sha([...computingCandidateWordIds].sort().join('\n')), 'ad7daaef9231ba20968cc567162aaa61d5201971cbe2b5ec9e03e4e571536d2f');
  assert.equal(expansionInfo.computingCandidates, 608);
  assert.equal(expansionInfo.cet4ComputingCandidates, 603);
  assert.ok(computingCandidateWordIds.has('ec-host-4740ae63'));
  assert.ok(computingCandidateWordIds.has('ec-thread-39200d1e'));
  assert.equal(computingCandidateWordIds.has('w-host'), false);
  assert.equal(computingCandidateWordIds.has('w-thread'), false);
  assert.equal(computingCandidateWordIds.has('w-gpu'), false);
});

test('all 224 original examples get contextual teaching tags but only actual 129 get CET4', () => {
  const presentations = seedWords.map(wordPresentation);
  assert.equal(presentations.filter(view => view.tags.includes('technical-context')).length, 224);
  assert.equal(presentations.filter(view => view.tags.includes('cet4')).length, 129);
  assert.equal(presentations.filter(view => view.badges.includes('四级 × 技术场景')).length, 129);
  assert.ok(presentations.every(view => view.badges.includes('原创技术场景')));
  assert.equal(wordPresentation(seed('runtime')).tags.includes('cet4'), false);
});

test('scenario sense comes first and ordinary/candidate dictionary senses stay distinct', () => {
  for (const term of ['address', 'image', 'instance', 'port', 'process', 'volume']) {
    const original = seed(term);
    const view = wordPresentation(original);
    assert.equal(view.meanings[0].label, '本场景义 · 原创例句');
    assert.equal(view.meanings[0].text, seedWordOverlays[original.id].technicalMeaning);
    const general = view.meanings.find(section => section.label.startsWith('通用'));
    assert.ok(general);
    assert.equal(general.text.includes('[计]'), false);
    assert.ok(view.sources.some(item => item.label.includes('技术语境参考') && item.url.startsWith('https://')));
  }
  const image = wordPresentation(seed('image'));
  assert.match(image.meanings[0].text, /镜像/);
  assert.equal(image.meanings.find(section => section.label.includes('[计]'))?.text, '图象');
  assert.equal(image.meanings.find(section => section.label.startsWith('通用'))?.text.includes('镜像'), false);
  // No [计] marker exists in the source instance row; a cloud sense must not be
  // falsely attributed to that dictionary marker.
  assert.equal(wordPresentation(seed('instance')).tags.includes('computing-candidate'), false);
});

test('new host and thread retain actual ec IDs, separate general senses, and remain candidates', () => {
  for (const word of [host, thread]) {
    const view = wordPresentation(word);
    assert.ok(view.meanings.some(section => section.label.startsWith('通用')));
    assert.ok(view.meanings.some(section => section.label.includes('[计]')));
    assert.ok(view.tags.includes('computing-candidate'));
    assert.ok(view.badges.includes('词典 [计] 候选'));
    assert.equal(view.tags.includes('technical-context'), false);
    assert.equal(view.badges.includes('原创技术场景'), false);
    assert.equal(view.badges.includes('四级 × 技术场景'), false);
    const enriched = enrichWordForPlanning(word);
    assert.equal(enriched.id, word.id);
    assert.equal(enriched.meaning, word.meaning);
    assert.equal(enriched.source, word.source);
    assert.equal(view.badges.some(badge => /现代云技术已核实/.test(badge)), false);
  }
});

test('GPU keeps graphics-processing meaning and excludes unrelated ECDICT ground-power row', () => {
  const gpu = seed('GPU');
  const view = wordPresentation(gpu);
  assert.equal(seedWordOverlays['w-gpu'], undefined);
  assert.equal(view.tags.includes('cet4'), false);
  assert.match(view.meanings[0].text, /图形处理器/);
  assert.doesNotMatch(JSON.stringify(view), /地面动力|ground power/i);
  assert.equal(enrichWordForPlanning(gpu).meaning, gpu.meaning);
  assert.equal(view.sources.some(item => item.url.includes('ECDICT')), false);
});

test('presentation and planning copies never mutate original words, tags, sources or pinned plan snapshots', () => {
  const original = structuredClone(seed('image'));
  Object.freeze(original.tags); Object.freeze(original.sceneIds); Object.freeze(original);
  const before = JSON.stringify(original);
  const pinned = Object.freeze({ wordIds: Object.freeze([original.id]), title: 'Already pinned plan' });
  const pinnedBefore = JSON.stringify(pinned);
  const view = wordPresentation(original);
  const enriched = enrichWordForPlanning(original);
  assert.notEqual(enriched, original);
  assert.notEqual(enriched.tags, original.tags);
  assert.notEqual(enriched.sceneIds, original.sceneIds);
  assert.equal(enriched.id, original.id);
  assert.equal(enriched.source, original.source);
  assert.equal(enriched.phonetic, original.phonetic);
  assert.equal(enriched.partOfSpeech, original.partOfSpeech);
  assert.ok(enriched.meaning.startsWith('【本场景义'));
  assert.ok(enriched.meaning.slice(0, 160).includes('镜像'));
  view.tags.push('only-view'); view.meanings[0].text = 'only-view'; view.sources[0].label = 'only-view';
  enriched.tags.push('only-copy'); enriched.sceneIds.push('only-copy');
  assert.equal(JSON.stringify(original), before);
  assert.equal(JSON.stringify(pinned), pinnedBefore);
  assert.equal(wordPresentation(original).tags.includes('only-view'), false);
  assert.equal(wordPresentation(original).tags.includes('only-copy'), false);
});

test('unknown imported words use their own meaning/tags and do not gain inferred evidence', () => {
  const word: Word = { id: 'custom-host', term: 'host', meaning: '自带释义', tags: ['personal'], sceneIds: ['my-scene'], source: '自备词表', phonetic: 'source-phonetic', partOfSpeech: 'source-pos' };
  const view = wordPresentation(word);
  assert.deepEqual(view.tags, ['personal']);
  assert.deepEqual(view.meanings, [{ label: '释义', text: '自带释义' }]);
  assert.deepEqual(view.badges, []);
  const enriched = enrichWordForPlanning(word);
  assert.deepEqual(enriched, word);
  assert.notEqual(enriched, word);
  assert.notEqual(enriched.tags, word.tags);
  assert.notEqual(enriched.sceneIds, word.sceneIds);
  const reusedId = { ...word, id: 'w-address', term: 'unrelated' };
  assert.deepEqual(wordPresentation(reusedId).meanings, [{ label: '释义', text: '自带释义' }]);
  assert.equal(enrichWordForPlanning(reusedId).tags.includes('cet4'), false);
});

test('CNCF headword references cite originals without copying definitions or inventing IPA', () => {
  const word: Word = { id: 'ec-api-gateway-a34b1bb4', term: 'API Gateway', meaning: 'API 网关；统一接收并转发接口请求的入口', tags: ['cloud-native', 'network'], sceneIds: ['exp-cloud-native'], source: '原创技术简释 · CC0-1.0；术语依据 https://glossary.cncf.io/api-gateway/' };
  const view = wordPresentation(word);
  assert.ok(view.sources.some(item => item.url === 'https://glossary.cncf.io/api-gateway/'));
  assert.equal(view.sources.some(item => item.url.includes('ECDICT')), false);
  assert.ok(view.badges.includes('CNCF 术语 · 原创简释'));
  assert.equal(enrichWordForPlanning(word).phonetic, undefined);
  assert.equal(enrichWordForPlanning(word).partOfSpeech, undefined);
});

test('distributed ECDICT notice retains full original MIT and mixed-upstream limitation', () => {
  const license = readFileSync(new URL('../public/licenses/ecdict.txt', import.meta.url), 'utf8');
  for (const text of ['Copyright (c) 2025 Linwei', 'Permission is hereby granted', 'THE SOFTWARE IS PROVIDED "AS IS"', 'mixed upstream', 'not a claim']) assert.ok(license.includes(text));
  assert.equal(expansionInfo.licenseUrl, '/licenses/ecdict.txt');
});
