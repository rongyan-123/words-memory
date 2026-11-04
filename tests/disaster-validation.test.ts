import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { applyGrade, createProgress, defaultSettings } from '../src/core/index.ts';
import { seedWords, seedScenes, lexiconInfo } from '../src/data/seed.ts';
import { canonicalize, compareSnapshots, sealSnapshot, sha256, TABLE_DEFINITIONS, SUPPORTED_MIGRATIONS, validateSnapshot } from '../src/backup/format.mjs';
const owner='site-owner',exportedAt='2026-11-01T01:00:00.000Z',oldTime=Date.parse('2026-10-31T01:00:00Z'),newTime=Date.parse(exportedAt);
// Synthetic fixtures only. No real user backup is read or committed by these tests.
function raw(empty=false): any {
  const tables:any={};
  for(const [name,d] of Object.entries(TABLE_DEFINITIONS) as [string,any][]) tables[name]={columns:d.columns,primaryKey:d.primaryKey,schemaSql:d.schemaSql,rows:[],rowCount:0};
  if(!empty) {
    tables.user_state.rows=[{owner_id:owner,settings_json:JSON.stringify(defaultSettings('2026-10-31')),lexicon_json:'{"words":[],"scenes":[]}',updated_at:oldTime}];
    tables.plan_config.rows=[{owner_id:owner,start_date:'2026-10-31',horizon_days:10,page_size:0,lease_token:null,lease_until:null,retry_after:0,created_at:oldTime,updated_at:oldTime}];
  }
  return {format:'vocab-wheel-disaster-backup',version:1,exportedAt,complete:true,scope:{ownerId:owner},application:{name:'vocab-wheel',packageVersion:'0.1.0',sourceTreeSha256:'2'.repeat(64),baseCommit:'1'.repeat(40),schemaVersion:3,migrations:SUPPORTED_MIGRATIONS.map((m:any)=>({...m,sql:readFileSync(new URL(`../drizzle/${m.name}`,import.meta.url),'utf8')})),seed:{words:seedWords,scenes:seedScenes,info:lexiconInfo}},tables};
}
function finalize(r:any) {for(const [name,t] of Object.entries(r.tables) as [string,any][]) {t.rows.sort((a:any,b:any)=>{const x=JSON.stringify(t.primaryKey.map((k:string)=>a[k])),y=JSON.stringify(t.primaryKey.map((k:string)=>b[k]));return x<y?-1:x>y?1:0;});t.rowCount=t.rows.length;delete t.sha256;}delete r.summary;delete r.contentSha256;return sealSnapshot(r);}
function unseal(snapshot:any):any {return JSON.parse(JSON.stringify(snapshot));}
function progressRow(index=0) {const wordId=seedWords[index].id;return {owner_id:owner,word_id:wordId,progress_json:JSON.stringify(applyGrade(createProgress(wordId),'remembered','2026-10-31').progress),revision:1};}
function review(r:any,index=0,grade:'remembered'|'fuzzy'|'forgot'='remembered',id='review-test-0001') {
  const row=r.tables.word_progress.rows.find((p:any)=>p.word_id===seedWords[index].id);
  const before=row?JSON.parse(row.progress_json):createProgress(seedWords[index].id);
  const result={wordId:before.wordId,grade,...applyGrade(before,grade,'2026-11-01')};
  if(row){row.progress_json=JSON.stringify(result.progress);row.revision++;}else r.tables.word_progress.rows.push({owner_id:owner,word_id:before.wordId,progress_json:JSON.stringify(result.progress),revision:1});
  r.tables.review_events.rows.push({owner_id:owner,event_id:id,word_id:before.wordId,grade,claim_token:`claim-${id}`,result_json:JSON.stringify(result),created_at:newTime});
}
test('empty snapshot can be structurally valid but overwrite always requires a baseline',async()=>{
  const fresh=await finalize(raw(true));assert.equal((await validateSnapshot(fresh)).valid,true);
  assert.deepEqual((await compareSnapshots(fresh)).reasons,['BASELINE_REQUIRED']);
  const r=raw();r.tables.word_progress.rows=[progressRow()];const previous=await finalize(r);
  assert.equal((await compareSnapshots(fresh,previous)).decision,'reject');
});
test('content checksum ignores export time and normal review transitions are evidence verified',async()=>{
  const r=raw();r.tables.word_progress.rows=[progressRow()];const previous=await finalize(r);
  const same=unseal(previous);same.exportedAt='2026-11-02T01:00:00.000Z';
  assert.equal((await compareSnapshots(same,previous)).decision,'unchanged');
  const changed=unseal(previous);review(changed);const next=await finalize(changed);
  assert.equal((await compareSnapshots(next,previous)).decision,'approve');
});
test('same-count learned word replacement and fully zeroed progress both reject',async()=>{
  const r=raw();r.tables.word_progress.rows=[progressRow()];const previous=await finalize(r);
  const replace=unseal(previous);replace.tables.word_progress.rows=[progressRow(1)];
  assert.equal((await compareSnapshots(await finalize(replace),previous)).decision,'reject');
  const reset=unseal(previous);reset.tables.word_progress.rows[0].progress_json=JSON.stringify(createProgress(seedWords[0].id));reset.tables.word_progress.rows[0].revision++;
  assert.equal((await compareSnapshots(await finalize(reset),previous)).decision,'reject');
});
test('new forged review evidence cannot reset a previously passed review stage',async()=>{
  const r=raw();r.tables.word_progress.rows=[progressRow()];review(r);const previous=await finalize(r);
  const reset=unseal(previous),row=reset.tables.word_progress.rows[0];
  const p=JSON.parse(row.progress_json);p.stage=0;p.nextDueOn='2026-11-02';p.lastGrade='forgot';p.exposuresToday++;
  row.progress_json=JSON.stringify(p);row.revision++;
  reset.tables.review_events.rows.push({owner_id:owner,event_id:'forged-review-0001',word_id:p.wordId,grade:'forgot',claim_token:'forged-token',result_json:JSON.stringify({wordId:p.wordId,grade:'forgot',progress:p,applied:true,reason:'applied'}),created_at:newTime});
  assert.equal((await compareSnapshots(await finalize(reset),previous)).decision,'reject');
});
test('append-only review history cannot disappear even if counts/progress stay the same',async()=>{
  const r=raw();review(r);const previous=await finalize(r);
  const changed=unseal(previous);changed.tables.review_events.rows=[];
  assert.equal((await compareSnapshots(await finalize(changed),previous)).decision,'reject');
});
test('legitimate negative mark with new unique operation is allowed; unsupported counter reset rejects',async()=>{
  const r=raw();const wordId=seedWords[0].id;r.tables.word_marks.rows=[{owner_id:owner,word_id:wordId,hard_count:3,revision:3,updated_at:oldTime}];const previous=await finalize(r);
  const changed=unseal(previous);Object.assign(changed.tables.word_marks.rows[0],{hard_count:2,revision:4,updated_at:newTime});changed.tables.mark_operations.rows=[{owner_id:owner,op_id:'negative-mark-0001',word_id:wordId,delta:-1,claim_token:'mark-claim',created_at:newTime}];
  assert.equal((await compareSnapshots(await finalize(changed),previous)).decision,'approve');
  changed.tables.word_marks.rows[0].hard_count=0;
  assert.equal((await compareSnapshots(await finalize(changed),previous)).decision,'reject');
});
test('hard-count total is an exact decimal string beyond Number.MAX_SAFE_INTEGER',async()=>{
  const r=raw();r.tables.word_marks.rows=seedWords.slice(0,2).map(w=>({owner_id:owner,word_id:w.id,hard_count:Number.MAX_SAFE_INTEGER,revision:1,updated_at:oldTime}));
  const snapshot=await finalize(r);assert.equal(snapshot.summary.hardCountTotal,(BigInt(Number.MAX_SAFE_INTEGER)*BigInt(2)).toString());
});
test('checksums, missing tables/columns, unsupported SQL and padded unknown data fail closed',async()=>{
  const snapshot=await finalize(raw());
  const badChecksum=unseal(snapshot);badChecksum.tables.user_state.sha256='0'.repeat(64);await assert.rejects(validateSnapshot(badChecksum),/TABLE_CHECKSUM/);
  const badRoot=unseal(snapshot);badRoot.summary.learnedCount=99;await assert.rejects(validateSnapshot(badRoot),/SUMMARY_MISMATCH/);
  const missing=raw();delete missing.tables.review_events;await assert.rejects(finalize(missing),/UNEXPECTED_FIELDS/);
  const column=raw();column.tables.word_progress.columns=['owner_id'];await assert.rejects(finalize(column),/TABLE_SCHEMA/);
  const sql=raw();sql.application.migrations[0].sql+='\nDROP TABLE word_progress;';await assert.rejects(finalize(sql),/UNSUPPORTED_MIGRATION/);
  const padded=raw(true);padded.unused='x'.repeat(2*1024*1024);await assert.rejects(finalize(padded),/UNEXPECTED_FIELDS/);
  assert.equal((await compareSnapshots({})).decision,'reject');
});
test('first full snapshot must preserve all fourteen legacy learned IDs, not just their count',async()=>{
  const r=raw();r.tables.word_progress.rows=Array.from({length:14},(_,i)=>progressRow(i));const next=await finalize(r);
  const legacy={format:'vocab-wheel-backup',schemaVersion:3,exportedAt:'2026-10-31T02:00:00.000Z',progress:r.tables.word_progress.rows.map((row:any)=>JSON.parse(row.progress_json)),lexicon:{words:[],scenes:[]},marks:[]};
  assert.equal((await compareSnapshots(next,null,legacy)).decision,'approve');
  const empty=await finalize(raw(true));assert.equal((await compareSnapshots(empty,null,legacy)).decision,'reject');
  assert.equal((await compareSnapshots(empty,empty,legacy)).decision,'reject');
  const swapped=unseal(next);swapped.tables.word_progress.rows[0]=progressRow(20);assert.equal((await compareSnapshots(await finalize(swapped),null,legacy)).decision,'reject');
});
test('frozen plans, reservations, and independent logs have real cross-table relationships',async()=>{
  const r=raw();const scene=seedScenes[0],ids=scene.wordIds;
  const plan={date:'2026-10-31',source:'curated',title:scene.title,rationale:'测试情境',notice:'测试',groups:[{sceneId:scene.id,title:scene.title,task:scene.task,wordIds:ids}],wordIds:ids};
  r.tables.scheduled_days.rows=[{owner_id:owner,day:'2026-10-31',day_index:1,plan_json:JSON.stringify(plan),completed_at:null,created_at:oldTime}];r.tables.reserved_words.rows=ids.map(wordId=>({owner_id:owner,word_id:wordId,day:'2026-10-31'}));
  const previous=await finalize(r);const lost=unseal(previous);lost.tables.reserved_words.rows.pop();
  await assert.rejects(finalize(lost),/PLANNED_NEW_WORD_NOT_RESERVED/);
  const altered=unseal(previous);const p=JSON.parse(altered.tables.scheduled_days.rows[0].plan_json);p.title='替换了旧冻结计划';altered.tables.scheduled_days.rows[0].plan_json=JSON.stringify(p);
  assert.equal((await compareSnapshots(await finalize(altered),previous)).decision,'reject');
});
test('standalone verifier source reports reject for invalid JSON/padding and approve for first valid JSON',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'vocab-verify-test-'));
  try {
    const valid=join(dir,'valid.json'),invalid=join(dir,'invalid.json'),padded=join(dir,'padded.json'),baseline=join(dir,'baseline.json');
    writeFileSync(baseline,JSON.stringify({format:'vocab-wheel-backup',schemaVersion:3,exportedAt:'2026-10-31T01:00:00.000Z',progress:[],lexicon:{words:[],scenes:[]},marks:[]}));
    writeFileSync(valid,JSON.stringify(await finalize(raw(true))));writeFileSync(invalid,'{');writeFileSync(padded,' '.repeat(100000)+'{}');
    for(const [path,exit] of [[valid,0],[invalid,2],[padded,2]] as const) {const run=spawnSync(process.execPath,['scripts/verify-backup-source.mjs','--new',path,'--legacy-baseline',baseline],{cwd:new URL('..',import.meta.url),encoding:'utf8'});assert.equal(run.status,exit,run.stderr);assert.ok(['approve','reject'].includes(JSON.parse(run.stdout).decision));}
  } finally {rmSync(dir,{recursive:true,force:true});}
});
test('canonical hashing is stable across key order and raw SQL hashing uses actual bytes',async()=>{
  assert.equal(canonicalize({b:2,a:1}),'{"a":1,"b":2}');assert.equal(await sha256('abc'),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('same-millisecond marker evidence rejects unreachable floor-zero results and warns on real ambiguity',async()=>{
  const r=raw(),wordId=seedWords[0].id;r.tables.word_marks.rows=[{owner_id:owner,word_id:wordId,hard_count:1,revision:1,updated_at:oldTime}];const previous=await finalize(r);
  const candidate=(deltas:number[],count:number)=>{const next=unseal(previous);Object.assign(next.tables.word_marks.rows[0],{hard_count:count,revision:1+deltas.length,updated_at:newTime});next.tables.mark_operations.rows=deltas.map((delta,index)=>({owner_id:owner,op_id:`same-ms-op-${index}`,word_id:wordId,delta,claim_token:'same-ms-claim',created_at:newTime}));return finalize(next);};
  assert.equal((await compareSnapshots(await candidate([-1,-1,1],2),previous)).decision,'reject');
  assert.equal((await compareSnapshots(await candidate([-1,-1],1),previous)).decision,'reject');
  const reachable=await compareSnapshots(await candidate([-1,-1,1],1),previous);
  assert.equal(reachable.decision,'approve');assert.deepEqual(reachable.warnings,['same_timestamp_order_ambiguous']);
  const legacy={format:'vocab-wheel-backup',schemaVersion:3,exportedAt:'2026-10-31T02:00:00.000Z',progress:[],lexicon:{words:[],scenes:[]},marks:[{wordId,hardCount:1}]};
  assert.equal((await compareSnapshots(await candidate([-1,-1],1),null,legacy)).decision,'reject');
});

test('legacy cutoff equality does not replay reviews or marker taps already represented by the baseline',async()=>{
  const r=raw();review(r);const wordId=seedWords[0].id;
  r.tables.word_marks.rows=[{owner_id:owner,word_id:wordId,hard_count:1,revision:1,updated_at:newTime}];
  r.tables.mark_operations.rows=[{owner_id:owner,op_id:'cutoff-mark-0001',word_id:wordId,delta:1,claim_token:'cutoff-claim',created_at:newTime}];
  const next=await finalize(r);
  const legacy={format:'vocab-wheel-backup',schemaVersion:3,exportedAt,progress:r.tables.word_progress.rows.map((row:any)=>JSON.parse(row.progress_json)),lexicon:{words:[],scenes:[]},marks:[{wordId,hardCount:1}]};
  assert.equal((await compareSnapshots(next,null,legacy)).decision,'approve');
  const later=unseal(next);review(later,0,'forgot','cutoff-review-next');
  const changed=await finalize(later);
  assert.equal((await compareSnapshots(changed,null,legacy)).decision,'approve');
});
test('new marker log cannot consume an op ID while its counter/revision snapshot stays unchanged',async()=>{
  const r=raw(),wordId=seedWords[0].id;r.tables.word_marks.rows=[{owner_id:owner,word_id:wordId,hard_count:4,revision:5,updated_at:oldTime}];const previous=await finalize(r);
  const next=unseal(previous);next.tables.mark_operations.rows.push({owner_id:owner,op_id:'lost-counter-op-1',word_id:wordId,delta:1,claim_token:'lost-counter-claim',created_at:newTime});
  assert.equal((await compareSnapshots(await finalize(next),previous)).decision,'reject');
});

test('fresh marker-only database may lack default user/config rows without permitting baseline-free overwrite',async()=>{
  const r=raw(true),wordId=seedWords[0].id;
  r.tables.word_marks.rows=[{owner_id:owner,word_id:wordId,hard_count:1,revision:1,updated_at:newTime}];
  r.tables.mark_operations.rows=[{owner_id:owner,op_id:'marker-only-op-1',word_id:wordId,delta:1,claim_token:'marker-only-claim',created_at:newTime}];
  const snapshot=await finalize(r);
  assert.equal((await validateSnapshot(snapshot)).valid,true);
  assert.equal(snapshot.tables.user_state.rowCount,0);assert.equal(snapshot.tables.plan_config.rowCount,0);
  assert.deepEqual((await compareSnapshots(snapshot)).reasons,['BASELINE_REQUIRED']);
  const invalid=raw(true);invalid.tables.word_progress.rows=[progressRow()];
  await assert.rejects(finalize(invalid),/USER_STATE_MISSING/);
});
