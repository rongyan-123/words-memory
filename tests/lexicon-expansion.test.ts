import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createNodeD1} from '../src/adapters/node.ts';
import {D1Repository} from '../src/server/repository.ts';
import {VocabularyService} from '../src/server/service.ts';
import type {AIPlanner,SemanticPlannerInput} from '../src/server/provider.ts';
import {exportDisasterBackup} from '../src/server/disaster-export.ts';
import {compareSnapshots,canonicalize,validateSnapshot} from '../src/backup/format.mjs';
import {restoreIsolated} from '../scripts/restore-backup-source.mjs';
import {seedWords,seedScenes,lexiconInfo} from '../src/data/seed.ts';
import {validateLexiconImport,defaultSettings,type Word} from '../src/core/index.ts';

const owner='site-owner',now=()=>Date.parse('2026-10-31T12:00:00Z');
const payload=JSON.parse(readFileSync('public/lexicons/final-import.json','utf8'));
const seedIds=new Set(seedWords.map(w=>w.id));
const noAI:AIPlanner={configured:false,async generate(){throw new Error('NO_PAID_API_CALLS');}};
async function fixture(){const node=createNodeD1();const repository=new D1Repository(node.db,now);const service=new VocabularyService(repository,noAI,{words:seedWords,scenes:seedScenes,info:lexiconInfo},now);await service.bootstrap(owner);for(let i=0;i<3;i++)await service.planningTick(owner,{});const day=await service.dayList(owner,{day:1});const packet={batchId:'expansion-existing-history',day:day.date,ratings:day.wordIds.map(wordId=>({wordId,grade:'remembered'})),dayCompleted:true};await service.reviewBatch(owner,packet);await service.marksBatch(owner,{operations:[{opId:'expansion-old-marker',wordId:day.wordIds[0],delta:1}]});return{node,repository,service,packet,before:await exportDisasterBackup(node.db,owner,{now})};}
function originalDataTables(snapshot:any){return Object.fromEntries(['word_progress','review_events','review_batches','word_marks','mark_operations','scheduled_days','reserved_words'].map(name=>[name,snapshot.tables[name]]));}

test('approved new-only artifact references existing seed members without rewriting seed words/scenes',()=>{
 const raw=readFileSync('public/lexicons/final-import.json');assert.equal(createHash('sha256').update(raw).digest('hex'),'5c531442ccbfbd09d225ecc4340dc2444dcdc29cb9623b68f9106809ffa72c26');assert.ok(raw.length<3*1024*1024);
 const validated=validateLexiconImport(payload,[...seedIds]);assert.equal(validated.words.length,3742);assert.equal(validated.scenes.length,2);assert.ok(validated.words.every(w=>!seedIds.has(w.id)));assert.equal(new Set([...seedIds,...validated.words.map(w=>w.id)]).size,3966);
 const cet=validated.scenes.find(s=>s.id==='exp-cet4-ecdict')!;assert.equal(cet.wordIds.length,3847);assert.equal(cet.wordIds.filter(id=>seedIds.has(id)).length,129);assert.equal(validated.scenes.find(s=>s.id==='exp-cloud-native')!.wordIds.length,25);assert.ok(!validated.words.some(w=>w.term.toLowerCase()==='gpu'));assert.ok(!validated.words.some(w=>['reservior','uptodate','world-wide'].includes(w.term.toLowerCase())));
 assert.throws(()=>validateLexiconImport(payload),/未知单词/);
});

test('real SQLite import is atomic/idempotent and preserves three frozen days, progress, marks and request dedupe',async()=>{
 const f=await fixture();try{
  const result=await f.service.import(owner,{kind:'lexicon',data:payload});assert.equal(result.total,3966);assert.equal(result.imported,3742);const boot=await f.service.bootstrap(owner);assert.equal(boot.lexiconCounts.total,3966);assert.equal(boot.lexiconCounts.scenes,18);assert.equal(boot.lexiconCoverage.cet4,3847);assert.equal(boot.lexiconCoverage.overlap,129);assert.equal(boot.settings.horizonDays,10);assert.ok(boot.inventory.unassigned>3800);assert.ok(boot.newWordRange.capacity<=60);
  const after=await exportDisasterBackup(f.node.db,owner,{now});assert.equal(canonicalize(originalDataTables(after)),canonicalize(originalDataTables(f.before)));assert.equal(after.tables.custom_lexicon.rowCount,3744);assert.equal((await validateSnapshot(after)).valid,true);assert.equal((await compareSnapshots(after,f.before)).decision,'approve');
  const imported=await f.service.import(owner,{kind:'lexicon',data:payload});assert.equal(imported.total,3966);const twice=await exportDisasterBackup(f.node.db,owner,{now});assert.equal(twice.contentSha256,after.contentSha256);
  const replay=await f.service.reviewBatch(owner,f.packet);assert.equal(replay.duplicate,true);assert.ok(replay.progress.every(p=>p.exposuresToday===1));
  await restoreIsolated(twice,{inspect:async({path}:{path:string})=>{const restored=createNodeD1(path);try{const s=new VocabularyService(new D1Repository(restored.db,now),noAI,{words:seedWords,scenes:seedScenes,info:lexiconInfo},now);assert.equal((await s.bootstrap(owner)).lexiconCounts.total,3966);assert.equal((await s.reviewBatch(owner,f.packet)).duplicate,true);}finally{restored.close();}}});
 }finally{f.node.close();}
});

test('one failing row rolls back the complete expanded lexicon and leaves old learning unchanged',async()=>{
 const f=await fixture();try{
  const target=payload.words[1000].id;await f.node.db.prepare(`CREATE TRIGGER reject_expansion BEFORE INSERT ON custom_lexicon WHEN NEW.record_id='${target}' BEGIN SELECT RAISE(ABORT,'isolated expansion failure'); END`).run();
  await assert.rejects(f.service.import(owner,{kind:'lexicon',data:payload}),/isolated expansion failure/);await f.node.db.prepare('DROP TRIGGER reject_expansion').run();
  const after=await exportDisasterBackup(f.node.db,owner,{now});assert.equal(after.contentSha256,f.before.contentSha256);assert.equal((await f.service.bootstrap(owner)).lexiconCounts.total,224);
 }finally{f.node.close();}
});

test('only an ungenerated date uses enriched inventory, and seed-in-custom-scene plans remain fully restorable',async()=>{
 const f=await fixture();let calls=0;let seen:SemanticPlannerInput|undefined;
 const planner:AIPlanner={configured:true,async generate(){throw new Error('No legacy full-library AI job');},async generateSemantic(input){calls++;seen=input;const available=new Set(input.availableWordIds);const cet=input.scenes.find(s=>s.id==='exp-cet4-ecdict')!;const tech=input.scenes.find(s=>s.id==='exp-cloud-native')!;const original=cet.wordIds.find(id=>seedIds.has(id)&&available.has(id))!;const general=cet.wordIds.filter(id=>!seedIds.has(id)&&available.has(id)).slice(0,5);const cloud=tech.wordIds.filter(id=>!seedIds.has(id)&&available.has(id)&&!general.includes(id)).slice(0,3);return{source:'ai',title:'隔离测试的语义组',rationale:'Only a synthetic adapter; no paid model invoked',notice:'isolated fixture only',groups:[{sceneId:cet.id,title:'四级技术交集',task:'Use validated existing IDs',wordIds:[original,...general]},{sceneId:tech.id,title:'云原生任务',task:'Use persisted scene membership',wordIds:cloud}],wordIds:[original,...general,...cloud]};}};
 try{
  await f.service.import(owner,{kind:'lexicon',data:payload});const s=new VocabularyService(f.repository,planner,{words:seedWords,scenes:seedScenes,info:lexiconInfo},now);
  await s.planningTick(owner,{day:1});assert.equal(calls,0);const result=await s.planningTick(owner,{day:4});assert.equal(result.generatedDay,4);assert.equal(calls,1);assert.equal(seen!.selectionKey,'2026-11-03');assert.ok(seen!.words.some(w=>seedIds.has(w.id)&&w.tags.includes('cet4')&&w.tags.includes('technical-context')));
  const after=await exportDisasterBackup(f.node.db,owner,{now});for(const table of ['word_progress','review_events','review_batches','word_marks','mark_operations'])assert.equal(canonicalize(after.tables[table]),canonicalize(f.before.tables[table]));assert.equal(after.tables.scheduled_days.rowCount,4);assert.deepEqual(after.tables.scheduled_days.rows.slice(0,3),f.before.tables.scheduled_days.rows);assert.equal((await compareSnapshots(after,f.before)).decision,'approve');assert.equal((await restoreIsolated(after)).restored,true);
  const rawSeed=seedWords.find(w=>w.id==='w-access')!;assert.ok(!rawSeed.tags.includes('cet4'));assert.ok(!rawSeed.meaning.includes('通用'));
 }finally{f.node.close();}
});

test('provider-unavailable giant lists use the time reference slice and never pretend to be AI semantic groups',async()=>{
 const words:Word[]=Array.from({length:400},(_,i)=>({id:`fallback-${i}`,term:`word${i}`,meaning:'隔离测试词义',tags:['cet4'],sceneIds:['giant-list']}));const scenes=[{id:'giant-list',title:'来源词表',description:'A broad source list, not a coherent task',wordIds:words.map(w=>w.id)}];
 for(const configured of [false,true]){const node=createNodeD1();try{const planner:AIPlanner={configured,async generate(){throw new Error('NO_REAL_API');},async generateSemantic(){throw new Error('isolated provider outage');}};const s=new VocabularyService(new D1Repository(node.db,now),planner,{words,scenes,info:{}},now);await s.settings(owner,{...defaultSettings('2026-10-31'),dailyMinutes:5});const reference=(await s.bootstrap(owner)).newWordRange;await s.planningTick(owner,{});const day=await s.dayList(owner,{day:1});assert.equal(day.plan!.source,'curated');assert.ok(day.newWordIds.length>0);assert.ok(day.newWordIds.length<=reference.max);assert.ok(day.newWordIds.length<200);assert.match(day.plan!.notice,/非 AI 语义分组/);assert.ok(!day.plan!.notice.includes('已切换精选情境计划'));assert.equal((await s.bootstrap(owner)).progress.length,0);}finally{node.close();}}
});

test('a small curated semantic task remains whole even when its size exceeds the time reference',async()=>{
 const node=createNodeD1();try{const words:Word[]=Array.from({length:32},(_,i)=>({id:`whole-${i}`,term:`term${i}`,meaning:'完整任务词义',tags:[],sceneIds:['small-task']}));const scenes=[{id:'small-task',title:'完整小任务',description:'Coherent local source task',wordIds:words.map(w=>w.id)}];const s=new VocabularyService(new D1Repository(node.db,now),noAI,{words,scenes,info:{}},now);await s.settings(owner,{...defaultSettings('2026-10-31'),dailyMinutes:5});await s.planningTick(owner,{});const day=await s.dayList(owner,{day:1});assert.equal(day.newWordIds.length,32);assert.ok(!day.plan!.notice.includes('非 AI 语义分组'));}finally{node.close();}
});
