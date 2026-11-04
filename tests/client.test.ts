import test from 'node:test';
import assert from 'node:assert/strict';
import { csvScenes, parseLexiconCsv, stableHash } from '../src/client/import.ts';
import { validateLexiconImport } from '../src/core/index.ts';

test('CSV round trip handles Unicode, commas, quotes, multiline examples and source', () => {
 const words = parseLexiconCsv('term,meaning,example,tags,sceneIds,source\r\ndeploy,"部署，发布","Deploy the app, then test it.",服务器|通用,deploy-scene,原创\r\ninstance,实例,"A quoted ""word""\nand another line",云计算,deploy-scene,我的词库');
 assert.equal(words.length,2); assert.equal(words[0].meaning,'部署，发布'); assert.equal(words[1].example,'A quoted "word"\nand another line'); assert.deepEqual(words[0].tags,['服务器','通用']);
 const parsed = validateLexiconImport({words,scenes:csvScenes(words)}); assert.equal(parsed.scenes[0].wordIds.length,2); assert.equal(parsed.words[0].source,'原创');
});
test('CSV requires term and meaning, detects malformed quotes and stable ID conflicts', () => {
 assert.throws(() => parseLexiconCsv('word,meaning\nhello,你好'),/term/);
 assert.throws(() => parseLexiconCsv('term,meaning\nhello,"你好'),/双引号/);
 const words = parseLexiconCsv('term,meaning\nHello,你好\nhello,您好'); assert.equal(words[0].id,words[1].id); assert.throws(() => validateLexiconImport({words}),/重复/);
 assert.equal(stableHash('deploy'),stableHash('deploy'));
});
