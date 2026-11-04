#!/usr/bin/env node
/** Prepare an explicitly approved, source-pinned import; never touches a database. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {seedWords,seedScenes} from '../src/data/seed.ts';
import {validateLexiconImport} from '../src/core/index.ts';

const args=process.argv.slice(2);
if(args.length!==2||args[0]!=='--source-dir')throw new Error('Usage: node scripts/prepare-expanded-lexicon.mjs --source-dir APPROVED_DIRECTORY');
const source=resolve(args[1]);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const pinned={
 'lexicon-new-only.json':'77391cc759b88f4a54917dd020af388f9596746d1f7510a07a39773ae47a1f69',
 'lexicon-metadata.json':'aa8c0dea5e2d5ab3cdb2f1d5d29faefdf666b12423d635b542ef3c5e461b10d0',
};
const inputs={};
for(const[name,expected]of Object.entries(pinned)){const bytes=readFileSync(join(source,name));assert.equal(hash(bytes),expected,`Approved source changed: ${name}`);inputs[name]=JSON.parse(bytes);}
const input=inputs['lexicon-new-only.json'],metadata=inputs['lexicon-metadata.json'];
const seedIds=new Set(seedWords.map(w=>w.id));const seedSceneIds=new Set(seedScenes.map(s=>s.id));
assert.equal(input.words.length,3742);assert.equal(input.scenes.length,2);
assert.ok(input.words.every(w=>!seedIds.has(w.id)));assert.ok(input.scenes.every(s=>!seedSceneIds.has(s.id)));
const allIds=new Set([...seedIds,...input.words.map(w=>w.id)]);assert.equal(allIds.size,3966);
const scenes=input.scenes.map(scene=>{
 const full=metadata.additionalSceneMemberships[scene.id];assert.ok(Array.isArray(full),`Missing approved full membership: ${scene.id}`);
 assert.equal(new Set(full).size,full.length);assert.ok(full.every(id=>allIds.has(id)));assert.ok(scene.wordIds.every(id=>full.includes(id)));
 return{...scene,wordIds:full};
});
assert.equal(scenes.find(s=>s.id==='exp-cet4-ecdict').wordIds.length,3847);
assert.equal(scenes.find(s=>s.id==='exp-cloud-native').wordIds.length,25);
const prepared=validateLexiconImport({words:input.words,scenes},[...seedIds]);
assert.equal(prepared.words.filter(w=>w.tags.includes('cet4')).length,3718);
assert.ok(!prepared.words.some(w=>w.term.toLowerCase()==='gpu'));
const bytes=Buffer.from(JSON.stringify(prepared));assert.ok(bytes.length<3*1024*1024);
mkdirSync('public/lexicons',{recursive:true});
const output='public/lexicons/final-import.json';writeFileSync(output,bytes);
const memberMapping=JSON.parse(readFileSync(join(source,'source-member-mapping.json'),'utf8'));
assert.equal(memberMapping.length,3849);assert.equal(new Set(memberMapping.map(row=>row.rawTerm)).size,3849);assert.equal(new Set(memberMapping.map(row=>row.wordId)).size,3847);assert.ok(memberMapping.every(row=>allIds.has(row.wordId)));
const cleaning=JSON.parse(readFileSync(join(source,'cleaning-report.json'),'utf8'));assert.equal(cleaning.rawSourceMembers,3849);assert.equal(cleaning.canonicalLearningMembers,3847);assert.deepEqual(cleaning.corrections.map(row=>[row.raw,row.canonical]),[['reservior','reservoir'],['uptodate','up-to-date'],['world-wide','worldwide']]);
const auditFiles={};for(const[name,value]of Object.entries({'source-member-mapping.json':memberMapping,'cleaning-report.json':cleaning})){const content=Buffer.from(JSON.stringify(value));writeFileSync(join('public/lexicons',name),content);auditFiles[name]={sha256:hash(content),bytes:content.length};}
const manifest={version:1,importFile:'/lexicons/final-import.json',sha256:hash(bytes),bytes:bytes.length,newWords:3742,totalWithSeed:3966,cet4CanonicalMembers:3847,cet4RawSourceMembers:3849,seedCet4Overlap:129,scenes:Object.fromEntries(scenes.map(s=>[s.id,s.wordIds.length])),sourceSha256:pinned,auditFiles,note:'Only new words and two new custom scenes are imported. Existing seed IDs are referenced, never rewritten. No progress, settings, frozen days, or reservations are included.'};
writeFileSync('public/lexicons/import-manifest.json',JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify(manifest));
