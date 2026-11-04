import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createNodeD1, createNodeHandler } from '../src/adapters/node.ts';
import { D1Repository } from '../src/server/repository.ts';
import { VocabularyService, type SeedData } from '../src/server/service.ts';
import { prepareMarkOperations, validateMarkOperations, type MarkOperation } from '../src/server/marks.ts';
import { addDays, createProgress, defaultSettings, type Word } from '../src/core/index.ts';
import { seedWords, seedScenes, lexiconInfo } from '../src/data/seed.ts';
import type { AIPlanner } from '../src/server/provider.ts';

const seed:SeedData={words:Array.from({length:4},(_,i)=>({id:`mark-word-${i}`,term:`term${i}`,meaning:`原创释义${i}`,tags:[],sceneIds:['mark-scene'],source:'Original CC0 local test'})),scenes:[{id:'mark-scene',title:'本地标记测试',description:'本地验证标记元数据',wordIds:Array.from({length:4},(_,i)=>`mark-word-${i}`)}],info:{coverage:'local-test'}};
const noAI:AIPlanner={configured:false,async generate(){throw new Error('NO_REAL_AI_CALLS');},async generateSemantic(){throw new Error('NO_REAL_AI_CALLS');}};
const now=()=>Date.parse('2026-10-31T01:00:00Z');
function setup(data=seed,path=':memory:') { const node=createNodeD1(path);const repository=new D1Repository(node.db,now);const service=new VocabularyService(repository,noAI,data,now);return {node,repository,service}; }
function op(id:string,delta:1|-1=1,wordId='mark-word-0'):MarkOperation {return {opId:id,wordId,delta};}
const packet=(...operations:MarkOperation[])=>({operations});

test('hard-count operations preserve every tap, order and zero floor without memory writes',async()=>{
 const s=setup();try {
  const ops=[op('floor-first',-1),op('plus-first',1),op('plus-second',1),op('minus-first',-1),op('minus-second',-1),op('floor-second',-1),op('plus-third',1)];
  const result=await s.service.marksBatch('a',packet(...ops));assert.equal(result.marks[0].hardCount,1);assert.equal(result.marks[0].revision,7);assert.deepEqual(result.appliedOpIds,ops.map(o=>o.opId));
  assert.equal((await s.service.bootstrap('a')).progress.length,0);assert.equal((await s.service.bootstrap('a')).stats.learned,0);
  const more=Array.from({length:200},(_,i)=>op(`rapid-${String(i).padStart(4,'0')}`));await s.service.marksBatch('a',{operations:more});
  const mark=(await s.repository.marksMany('a',['mark-word-0'])).get('mark-word-0')!;assert.equal(mark.hardCount,201);assert.equal(mark.revision,207);
  assert.equal((await s.service.bootstrap('a')).progress.length,0);
 }finally{s.node.close();}
});

test('replay and partial replay acknowledge stable IDs once and return latest revisions',async()=>{
 const s=setup();try {
  const first=await s.service.marksBatch('a',packet(op('replay-op-one')));assert.equal(first.marks[0].hardCount,1);
  const mixed=await s.service.marksBatch('a',packet(op('replay-op-one'),op('replay-op-two'),op('replay-op-three',-1)));assert.equal(mixed.marks[0].hardCount,1);assert.equal(mixed.marks[0].revision,3);assert.deepEqual(mixed.duplicateOpIds,['replay-op-one']);assert.equal(mixed.appliedOpIds.length,2);
  await s.service.marksBatch('a',packet(op('replay-op-four')));
  const late=await s.service.marksBatch('a',packet(op('replay-op-one')));assert.equal(late.marks[0].hardCount,2);assert.equal(late.marks[0].revision,4);assert.deepEqual(late.appliedOpIds,[]);assert.deepEqual(late.acknowledgedOpIds,['replay-op-one']);
  const duplicateInside=await s.service.marksBatch('a',packet(op('same-in-packet'),op('same-in-packet')));assert.equal(duplicateInside.marks[0].hardCount,3);assert.equal(duplicateInside.appliedOpIds.length,1);
 }finally{s.node.close();}
});

test('same-ID changed data or one unknown word rejects the entire marker packet',async()=>{
 const s=setup();try {
  await s.service.marksBatch('a',packet(op('conflict-old')));
  await assert.rejects(s.service.marksBatch('a',packet(op('conflict-new',1,'mark-word-1'),op('conflict-old',-1))),e=>(e as {code:string}).code==='MARK_OPERATION_CONFLICT');
  assert.equal((await s.repository.marksMany('a',['mark-word-1'])).get('mark-word-1')!.hardCount,0);
  await assert.rejects(s.service.marksBatch('a',packet(op('unknown-good',1,'mark-word-1'),op('unknown-bad',1,'not-in-lexicon'))),/词库中没有/);
  assert.equal((await s.repository.markRecords('a',['conflict-new','unknown-good'])).size,0);
  await assert.rejects(s.service.marksBatch('a',packet(op('same-id-conflict'),op('same-id-conflict',-1))),e=>(e as {code:string}).code==='MARK_OPERATION_CONFLICT');
 }finally{s.node.close();}
});

test('eight concurrent new packets retain all increments, and concurrent replays count once',async()=>{
 const s=setup();try {
  await Promise.all(Array.from({length:8},(_,n)=>s.service.marksBatch('a',{operations:Array.from({length:10},(_,i)=>op(`concurrent-${n}-${i}`))})));
  let mark=(await s.repository.marksMany('a',['mark-word-0'])).get('mark-word-0')!;assert.equal(mark.hardCount,80);assert.equal(mark.revision,80);
  const same=packet(op('duplicate-concurrent'));
  const results=await Promise.all(Array.from({length:8},()=>s.service.marksBatch('a',same)));assert.equal(results.filter(r=>r.appliedOpIds.length===1).length,1);
  mark=(await s.repository.marksMany('a',['mark-word-0'])).get('mark-word-0')!;assert.equal(mark.hardCount,81);assert.equal(mark.revision,81);
 }finally{s.node.close();}
});

test('one failed word write rolls back counts and every operation ID for safe retry',async()=>{
 const s=setup();try {
  await s.node.db.prepare(`CREATE TRIGGER reject_mark BEFORE INSERT ON word_marks WHEN NEW.word_id='mark-word-1' BEGIN SELECT RAISE(ABORT,'local-marker-rollback'); END`).run();
  const body=packet(op('rollback-mark-one'),op('rollback-mark-two',1,'mark-word-1'));
  await assert.rejects(s.service.marksBatch('a',body),/local-marker-rollback/);assert.equal((await s.repository.marks('a')).length,0);assert.equal((await s.repository.markRecords('a',body.operations.map(o=>o.opId))).size,0);
  await s.node.db.prepare('DROP TRIGGER reject_mark').run();const retry=await s.service.marksBatch('a',body);assert.deepEqual(retry.marks.map(m=>m.hardCount),[1,1]);assert.equal(retry.appliedOpIds.length,2);
 }finally{s.node.close();}
});

test('hard count is global across day lists and remembered grades never erase it',async()=>{
 const s=setup();try {
  await s.service.planningTick('a',{});await s.service.marksBatch('a',packet(op('global-mark-one'),op('global-mark-two'),op('global-mark-three')));
  await s.service.reviewBatch('a',{batchId:'independent-grade',day:'2026-10-31',ratings:[{wordId:'mark-word-0',grade:'remembered'}],dayCompleted:false});
  const before=(await s.repository.progress('a','mark-word-0')).progress;
  await s.service.marksBatch('a',packet(op('after-grade-more')));
  assert.deepEqual((await s.repository.progress('a','mark-word-0')).progress,before);
  const today=await s.service.dayList('a',{day:1});const futureReview=await s.service.dayList('a',{day:2});
  assert.equal(today.marks.find(m=>m.wordId==='mark-word-0')!.hardCount,4);assert.equal(futureReview.marks.find(m=>m.wordId==='mark-word-0')!.hardCount,4);
  for(let i=0;i<4;i++) await s.service.reviewBatch('a',{batchId:`grade-after-hard-${i}`,day:'2026-10-31',ratings:[{wordId:'mark-word-0',grade:'remembered'}],dayCompleted:false});
  assert.equal((await s.repository.progress('a','mark-word-0')).progress.exposuresToday,3);assert.equal((await s.repository.marks('a'))[0].hardCount,4);
  await s.service.marksBatch('a',packet(op('decrease-explicit',-1)));assert.equal((await s.repository.marks('a'))[0].hardCount,3);
 }finally{s.node.close();}
});

test('safe-integer maximum is exact, overflow rejects all operations and floor remains independent',async()=>{
 const s=setup();try {
  const base=await s.service.export('a');await s.service.import('a',{kind:'backup',data:{...base,marks:[{wordId:'mark-word-0',hardCount:Number.MAX_SAFE_INTEGER}]}});
  await assert.rejects(s.service.marksBatch('a',packet(op('before-overflow',1,'mark-word-1'),op('overflow-mark',1))),e=>(e as {code:string}).code==='MARK_COUNT_OVERFLOW');
  assert.equal((await s.repository.markRecords('a',['before-overflow','overflow-mark'])).size,0);assert.equal((await s.repository.marksMany('a',['mark-word-1'])).get('mark-word-1')!.hardCount,0);
  const down=await s.service.marksBatch('a',packet(op('maximum-down',-1)));assert.equal(down.marks[0].hardCount,Number.MAX_SAFE_INTEGER-1);
  await assert.rejects(s.node.db.prepare('INSERT INTO word_marks(owner_id,word_id,hard_count,revision,updated_at) VALUES(?,?,?,?,?)').bind('a','unsafe-direct',Number.MAX_SAFE_INTEGER+1,1,now()).run(),/CHECK/);
  await assert.rejects(s.node.db.prepare('INSERT INTO word_marks(owner_id,word_id,hard_count,revision,updated_at) VALUES(?,?,?,?,?)').bind('a','fraction-direct',0.5,1,now()).run(),/CHECK/);
 }finally{s.node.close();}
});

test('marker revision overflow is rejected instead of returning unsafe stale-ack metadata',async()=>{
 const s=setup();try {
  await s.node.db.prepare('INSERT INTO word_marks(owner_id,word_id,hard_count,revision,updated_at) VALUES(?,?,?,?,?)').bind('a','mark-word-0',1,Number.MAX_SAFE_INTEGER,now()).run();
  await assert.rejects(s.service.marksBatch('a',packet(op('revision-too-high',-1))),e=>(e as {code:string}).code==='MARK_REVISION_OVERFLOW');
  assert.equal((await s.repository.markRecords('a',['revision-too-high'])).size,0);const backup=await s.service.export('a');
  await assert.rejects(s.service.import('a',{kind:'backup',data:backup}),e=>(e as {code:string}).code==='MARK_REVISION_OVERFLOW');
 }finally{s.node.close();}
});

test('v3 snapshot restore is monotonic, does not replay clicks and keeps old operation dedupe',async()=>{
 const s=setup();try {
  await s.service.marksBatch('a',packet(op('restore-old-op')));const before=(await s.repository.marks('a'))[0];const backup=await s.service.export('a');assert.equal(backup.schemaVersion,3);assert.deepEqual(backup.marks,[{wordId:'mark-word-0',hardCount:1}]);
  await s.service.import('a',{kind:'backup',data:{...backup,marks:[{wordId:'mark-word-0',hardCount:15,revision:999,updatedAt:1}]}});
  let mark=(await s.repository.marks('a'))[0];assert.equal(mark.hardCount,15);assert.equal(mark.revision,before.revision+1);assert.equal(mark.updatedAt,now());
  const replay=await s.service.marksBatch('a',packet(op('restore-old-op')));assert.equal(replay.marks[0].hardCount,15);assert.equal(replay.appliedOpIds.length,0);
  for(const schemaVersion of [1,2]) await s.service.import('a',{kind:'backup',data:{...backup,schemaVersion,marks:undefined}});
  mark=(await s.repository.marks('a'))[0];assert.equal(mark.hardCount,15);assert.equal(mark.revision,before.revision+1);
  await s.service.import('a',{kind:'backup',data:{...backup,marks:[{wordId:'mark-word-0',hardCount:0}]}});assert.equal((await s.repository.marks('a'))[0].hardCount,0);
 }finally{s.node.close();}
});

test('invalid or failed marker restore rolls settings, lexicon and progress back together',async()=>{
 const s=setup();try {
  const backup=await s.service.export('source');const imported:Word={id:'my-backup-mark',term:'persist',meaning:'持久化',tags:[],sceneIds:[],source:'CC0'};
  const data={...backup,settings:{...backup.settings,dailyMinutes:45},lexicon:{words:[imported],scenes:[]},progress:[{...createProgress(imported.id),firstLearnedOn:'2026-10-30',nextDueOn:'2026-11-01',lastExposureOn:'2026-10-30',lastReviewedOn:'2026-10-30',exposuresToday:1,lastGrade:'remembered'}],marks:[{wordId:imported.id,hardCount:5}]};
  await s.service.bootstrap('target');await s.node.db.prepare(`CREATE TRIGGER reject_restore_mark BEFORE INSERT ON word_marks WHEN NEW.owner_id='target' BEGIN SELECT RAISE(ABORT,'restore-marker-rollback'); END`).run();
  await assert.rejects(s.service.import('target',{kind:'backup',data}),/restore-marker-rollback/);let state=await s.service.bootstrap('target');assert.equal(state.settings.dailyMinutes,20);assert.equal(state.lexiconCounts.imported,0);assert.equal(state.progress.length,0);assert.equal(state.marks.length,0);
  await s.node.db.prepare('DROP TRIGGER reject_restore_mark').run();await assert.rejects(s.service.import('target',{kind:'backup',data:{...data,marks:[{wordId:imported.id,hardCount:-1}]}}),/非负安全整数/);state=await s.service.bootstrap('target');assert.equal(state.lexiconCounts.imported,0);
  await s.service.import('target',{kind:'backup',data});state=await s.service.bootstrap('target');assert.equal(state.settings.dailyMinutes,45);assert.equal(state.progress.length,1);assert.equal(state.marks[0].hardCount,5);
 }finally{s.node.close();}
});

test('marker data and operation dedupe survive SQLite close/reopen and remain owner scoped',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'vocab-marks-'));const path=join(directory,'state.sqlite');let s=setup(seed,path);
 try {
  await s.service.marksBatch('a',packet(op('durable-op-one'),op('durable-op-two')));await s.service.marksBatch('b',packet(op('durable-op-one')));
  s.node.close();s=setup(seed,path);const replay=await s.service.marksBatch('a',packet(op('durable-op-one')));assert.equal(replay.marks[0].hardCount,2);assert.equal(replay.duplicateOpIds.length,1);assert.equal((await s.repository.marks('b'))[0].hardCount,1);assert.equal((await s.service.bootstrap('a')).progress.length,0);
 }finally{s.node.close();rmSync(directory,{recursive:true,force:true});}
});

test('marker operation validation accepts only bounded valid IDs and exact signed unit deltas',()=>{
 assert.throws(()=>validateMarkOperations({operations:[]}),/1–200/);assert.throws(()=>validateMarkOperations({operations:Array.from({length:201},(_,i)=>op(`too-many-${i}`))}),/1–200/);
 assert.throws(()=>validateMarkOperations({operations:[{opId:'valid-id-123',wordId:'mark-word-0',delta:2}]}),/只能/);assert.throws(()=>validateMarkOperations({operations:[{opId:'bad',wordId:'mark-word-0',delta:1}]}),/ID/);
 const prepared=prepareMarkOperations(new Map(),[op('ordered-minus',-1),op('ordered-plus')],now());assert.equal(prepared[0].hardCount,1);assert.equal(prepared[0].revision,2);
});

test('maximum 3MiB corpus plus10224 progress/count snapshots exports and restores below8MiB',async()=>{
 // All fixtures stay in a fresh local SQLite database; no production writes/API calls.
 const s=setup({words:seedWords,scenes:seedScenes,info:lexiconInfo});try {
  const imported:Word[]=Array.from({length:10_000},(_,i)=>({id:`max-${String(i).padStart(5,'0')}${'z'.repeat(91)}`,term:'term',meaning:'义'.repeat(10),tags:[],sceneIds:[],source:'Original CC0 local test'}));
  const lexicon={words:imported,scenes:[]};const encoder=new TextEncoder();
  let budget=3*1024*1024-64-encoder.encode(JSON.stringify(lexicon)).byteLength;
  for(const w of imported) {if(budget<=13) break;const length=Math.min(1000,budget-13);w.example='x'.repeat(length);budget-=length+13;}
  const corpusBytes=encoder.encode(JSON.stringify(lexicon)).byteLength;assert.ok(corpusBytes>3*1024*1024-128);assert.ok(corpusBytes<=3*1024*1024);
  await s.service.import('source',{kind:'lexicon',data:lexicon});const all=[...seedWords,...imported];
  const progress=all.map(w=>({...createProgress(w.id),firstLearnedOn:'2026-10-01',stage:2,nextDueOn:'2026-11-01',lastReviewedOn:'2026-10-31',lastExposureOn:'2026-10-31',exposuresToday:3,lastGrade:'remembered'}));
  const base=await s.service.export('source');
  await s.service.import('source',{kind:'backup',data:{...base,settings:{...base.settings,horizonDays:365},progress,marks:all.map(w=>({wordId:w.id,hardCount:Number.MAX_SAFE_INTEGER}))}});
  const backup=await s.service.export('source');const bytes=encoder.encode(JSON.stringify({kind:'backup',data:backup})).byteLength;
  assert.ok(bytes<8*1024*1024,`entire restore request ${bytes} bytes must fit8MiB`);assert.equal(backup.progress.length,10224);assert.equal(backup.marks.length,10224);assert.deepEqual(Object.keys(backup.marks[0]).sort(),['hardCount','wordId']);
  await s.service.import('target',{kind:'backup',data:backup});const restored=await s.service.bootstrap('target');assert.equal(restored.progress.length,10224);assert.equal(restored.marks.length,10224);assert.ok(restored.marks.every(m=>m.hardCount===Number.MAX_SAFE_INTEGER&&m.revision===1));
 }finally{s.node.close();}
});

test('versioned HTTP marks endpoint persists/replays and v3 export restores zero-learning difficulty',async()=>{
 const node=createNodeD1();try {
  const handle=createNodeHandler({db:node.db,planner:noAI,seed,now,owner:'http-owner'});
  const req=(path:string,method='GET',body?:unknown,extra:Record<string,string>={})=>new Request(`http://127.0.0.1:8788/api/v1/${path}`,{method,headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const body=packet(op('http-marker-001'),op('http-marker-002'));
  let response=await handle(req('marks/batch','POST',body));assert.equal(response.status,200);let result=await response.json() as {marks:{hardCount:number;revision:number}[];appliedOpIds:string[]};assert.equal(result.marks[0].hardCount,2);assert.equal(result.marks[0].revision,2);
  response=await handle(req('marks/batch','POST',body));assert.equal(response.status,200);result=await response.json() as typeof result;assert.equal(result.appliedOpIds.length,0);assert.equal(result.marks[0].hardCount,2);
  response=await handle(req('marks/batch','POST',packet(op('http-marker-001',-1))));assert.equal(response.status,409);assert.equal((await response.json() as {code:string}).code,'MARK_OPERATION_CONFLICT');
  assert.equal((await handle(req('marks/batch','POST',packet(op('cross-origin-op')),{'Origin':'https://evil.example'}))).status,403);
  const backup=await (await handle(req('export'))).json() as {schemaVersion:number;marks:unknown[];progress:unknown[]};assert.equal(backup.schemaVersion,3);assert.equal(backup.marks.length,1);assert.equal(backup.progress.length,0);
  const target=createNodeHandler({db:node.db,planner:noAI,seed,now,owner:'http-restored'});
  response=await target(req('import','POST',{kind:'backup',data:backup}));assert.equal(response.status,200);
  const restored=await (await target(req('bootstrap'))).json() as {marks:{hardCount:number}[];progress:unknown[]};assert.equal(restored.marks[0].hardCount,2);assert.equal(restored.progress.length,0);
 }finally{node.close();}
});
