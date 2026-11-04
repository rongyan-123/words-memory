import test from 'node:test';
import assert from 'node:assert/strict';
import { createNodeD1 } from '../src/adapters/node.ts';
import { D1Repository } from '../src/server/repository.ts';
import { VocabularyService } from '../src/server/service.ts';
import { exportDisasterBackup, DisasterExportError } from '../src/server/disaster-export.ts';
import { DISASTER_TABLES } from '../src/server/disaster-schema.ts';
import { validateSnapshot } from '../src/backup/format.mjs';
import { seedWords, seedScenes, lexiconInfo } from '../src/data/seed.ts';
import { defaultSettings } from '../src/core/index.ts';
const OWNER='site-owner';const now=()=>Date.parse('2026-10-31T01:00:00Z');
const noAI={configured:false,async generate(){throw new Error('NO_REAL_AI_CALLS');}};
async function fixture(review=true){
 const node=createNodeD1();const repository=new D1Repository(node.db,now);const service=new VocabularyService(repository,noAI,{words:seedWords,scenes:seedScenes,info:lexiconInfo},now);
 await service.bootstrap(OWNER);
 await service.import(OWNER,{kind:'lexicon',data:{words:[{id:'my-disaster-word',term:'persistent',meaning:'持久化的',tags:[],sceneIds:[],source:'Original CC0 local test'}]}});
 await service.planningTick(OWNER,{});
 await service.marksBatch(OWNER,{operations:[{opId:'disaster-mark-one',wordId:seedWords[0].id,delta:1}]});
 if(review) await service.reviewBatch(OWNER,{batchId:'disaster-review-one',day:'2026-10-31',ratings:[{wordId:seedWords[0].id,grade:'remembered'}],dayCompleted:false});
 const page=await service.dayList(OWNER,{day:1});
 await repository.claimPlan(OWNER,'2026-10-31','legacy-cas-token',false);await repository.savePlan(OWNER,'2026-10-31','legacy-cas-token',page.plan!);
 return {node,repository,service};
}
function wrap(base:D1Database,batch:(statements:D1PreparedStatement[],run:()=>Promise<D1Result<unknown>[]>)=>Promise<D1Result<unknown>[]>):D1Database{
 return {prepare:base.prepare.bind(base),batch:(statements:D1PreparedStatement[])=>batch(statements,()=>base.batch(statements))} as unknown as D1Database;
}
const sql=(s:D1PreparedStatement)=>(s as unknown as {query:string}).query;
function code(expected:string){return (error:unknown)=>error instanceof DisasterExportError&&error.code===expected;}

test('empty disaster capture is read-only and does not create user/config state',async()=>{
 const node=createNodeD1();try{
  const snapshot=await exportDisasterBackup(node.db,OWNER,{now});assert.equal(snapshot.complete,true);assert.equal(Object.keys(snapshot.tables).length,11);assert.equal(snapshot.summary.wordCount,224);
  for(const table of DISASTER_TABLES){assert.equal(snapshot.tables[table.name].rowCount,0);assert.equal((await node.db.prepare(`SELECT COUNT(*) AS n FROM "${table.name}"`).first<{n:number}>())!.n,0);}
  assert.equal((await validateSnapshot(snapshot)).valid,true);
 }finally{node.close();}
});

test('all eleven raw tables, idempotency logs, exact JSON, CAS tokens and reservations are preserved',async()=>{
 const s=await fixture();try{
  await s.repository.claimPlanning(OWNER,'active-global-cas');
  const snapshot=await exportDisasterBackup(s.node.db,OWNER,{now});assert.equal(snapshot.complete,true);assert.equal(snapshot.application.migrations.length,3);assert.equal(snapshot.application.seed.words.length,224);
  for(const table of DISASTER_TABLES){const captured=snapshot.tables[table.name];assert.ok(captured.rowCount>0,`${table.name} must be captured`);const actual=await s.node.db.prepare(`SELECT ${table.columns.map(c=>`"${c.name}"`).join(',')} FROM "${table.name}" WHERE owner_id=? ORDER BY ${table.primaryKey.map(k=>`"${k}" COLLATE BINARY`).join(',')}`).bind(OWNER).all();assert.deepEqual(captured.rows,actual.results);assert.equal(captured.rowCount,actual.results.length);assert.match(captured.sha256!,/^[a-f0-9]{64}$/);}
  assert.equal(snapshot.tables.plan_config.rows[0].lease_token,'active-global-cas');assert.equal(snapshot.summary.learnedCount,1);assert.equal(snapshot.summary.markOperationCount,1);assert.equal(snapshot.summary.reviewBatchCount,1);assert.equal((await validateSnapshot(snapshot)).valid,true);
 }finally{s.node.close();}
});

test('unchanged content has the same digest despite a newer exportedAt and owner filtering is exact',async()=>{
 const s=await fixture();try{
  await s.node.db.prepare('INSERT INTO user_state(owner_id,settings_json,lexicon_json,updated_at) VALUES(?,?,?,?)').bind('other-owner',JSON.stringify(defaultSettings('2026-10-31')),'{"words":[],"scenes":[],"note":"excluded-owner-data"}',now()).run();
  const first=await exportDisasterBackup(s.node.db,OWNER,{now});const later=await exportDisasterBackup(s.node.db,OWNER,{now:()=>now()+1000});assert.notEqual(first.exportedAt,later.exportedAt);assert.equal(first.contentSha256,later.contentSha256);assert.deepEqual(first.tables,later.tables);assert.ok(!JSON.stringify(first).includes('excluded-owner-data'));
  await assert.rejects(exportDisasterBackup(s.node.db,'other-owner',{now}),code('DISASTER_SCOPE_MISMATCH'));
 }finally{s.node.close();}
});

test('authoritative metadata, counts and all row selects share one D1 transaction',async()=>{
 const s=await fixture(false);try{
  const batches:string[][]=[];let calls=0;
  const db=wrap(s.node.db,async(statements,run)=>{batches.push(statements.map(sql));calls++;
   if(calls===2) await s.service.reviewBatch(OWNER,{batchId:'after-preflight-batch',day:'2026-10-31',ratings:[{wordId:seedWords[0].id,grade:'remembered'}],dayCompleted:false});
   return run();
  });
  const snapshot=await exportDisasterBackup(db,OWNER,{now});assert.equal(batches.length,2);assert.equal(batches[0].length,1);assert.equal(batches[1].length,24);
  assert.ok(batches[1].some(s=>s.includes('sqlite_master')));assert.equal(batches[1].filter(s=>s.startsWith('PRAGMA table_info')).length,11);assert.equal(batches[1].filter(s=>s.startsWith('WITH disaster_capacity')).length,11);
  assert.equal(snapshot.tables.word_progress.rowCount,1);assert.equal(snapshot.tables.review_events.rowCount,1);assert.equal(snapshot.tables.review_batches.rowCount,1);assert.equal((await validateSnapshot(snapshot)).valid,true);
 }finally{s.node.close();}
});

test('preflight overlimit aborts before row capture, never returning a truncated complete snapshot',async()=>{
 const s=await fixture();try{
  let calls=0;const db=wrap(s.node.db,async(_statements,run)=>{calls++;return run();});
  await assert.rejects(exportDisasterBackup(db,OWNER,{now,maxRowsPerTable:1}),code('DISASTER_LIMIT_EXCEEDED'));assert.equal(calls,1);
  const empty=createNodeD1();try{await assert.rejects(exportDisasterBackup(empty.db,OWNER,{now,maxBytes:1}),code('DISASTER_LIMIT_EXCEEDED'));}finally{empty.close();}
 }finally{s.node.close();}
});

test('growth after preflight is guarded inside the snapshot transaction before returning rows',async()=>{
 const node=createNodeD1();try{
  let calls=0;let rawDataLengths:number[]=[];
  const db=wrap(node.db,async(_statements,run)=>{calls++;if(calls===2)for(let i=0;i<2;i++)await node.db.prepare('INSERT INTO word_marks(owner_id,word_id,hard_count,revision,updated_at) VALUES(?,?,?,?,?)').bind(OWNER,seedWords[i].id,0,1,now()).run();const result=await run();if(calls===2)rawDataLengths=result.slice(13).map(r=>r.results.length);return result;});
  await assert.rejects(exportDisasterBackup(db,OWNER,{now,maxRowsPerTable:1}),code('DISASTER_LIMIT_EXCEEDED'));assert.equal(calls,2);assert.ok(rawDataLengths.every(n=>n===0));
 }finally{node.close();}
});

test('a truncated D1 result or mismatched count fails closed',async()=>{
 const s=await fixture();try{
  let calls=0;const db=wrap(s.node.db,async(_statements,run)=>{calls++;const result=await run();if(calls===2){const index=13+DISASTER_TABLES.findIndex(t=>t.name==='word_progress');result[index]={...result[index],results:[]};}return result;});
  await assert.rejects(exportDisasterBackup(db,OWNER,{now}),code('DISASTER_TRUNCATED'));
 }finally{s.node.close();}
});

test('extra app tables or columns are not silently omitted',async()=>{
 for(const change of ['CREATE TABLE unexpected_app_data(value TEXT)','CREATE TABLE __appgarden_migrations_extra(value TEXT)','CREATE TABLE __appgarden_other(value TEXT)','ALTER TABLE word_progress ADD COLUMN unexpected_column TEXT']){
  const node=createNodeD1();try{await node.db.prepare(change).run();await assert.rejects(exportDisasterBackup(node.db,OWNER,{now}),code('DISASTER_SCHEMA_MISMATCH'));}finally{node.close();}
 }
});

test('missing tables and non-finite/unsafe integer cells cannot yield a complete file',async()=>{
 const missing=createNodeD1();try{await missing.db.prepare('DROP TABLE reserved_words').run();await assert.rejects(exportDisasterBackup(missing.db,OWNER,{now}),code('DISASTER_SCHEMA_MISMATCH'));}finally{missing.close();}
 const node=createNodeD1();try{
  await node.db.prepare('INSERT INTO user_state(owner_id,settings_json,lexicon_json,updated_at) VALUES(?,?,?,?)').bind(OWNER,JSON.stringify(defaultSettings('2026-10-31')),'{"words":[],"scenes":[]}',Number.MAX_SAFE_INTEGER+1).run();
  await assert.rejects(exportDisasterBackup(node.db,OWNER,{now}),code('DISASTER_ROW_INVALID'));
 }finally{node.close();}
});

test('serialized byte limits preflight valid large records before capturing them',async()=>{
 const s=await fixture();try{
  const baseline=await exportDisasterBackup(s.node.db,OWNER,{now});const maxBytes=new TextEncoder().encode(JSON.stringify(baseline)).byteLength+64*1024;
  await s.service.import(OWNER,{kind:'lexicon',data:{words:Array.from({length:200},(_,i)=>({id:`my-byte-${String(i).padStart(3,'0')}`,term:'large',meaning:'较大的',example:'x'.repeat(1000),tags:[],sceneIds:[],source:'Original CC0 local test'}))}});
  let calls=0;const db=wrap(s.node.db,async(_statements,run)=>{calls++;return run();});await assert.rejects(exportDisasterBackup(db,OWNER,{now,maxBytes}),code('DISASTER_LIMIT_EXCEEDED'));assert.equal(calls,1);
 }finally{s.node.close();}
});

test('byte growth after preflight skips every data array under the authoritative transaction guard',async()=>{
 const s=await fixture();try{
  const baseline=await exportDisasterBackup(s.node.db,OWNER,{now});const maxBytes=new TextEncoder().encode(JSON.stringify(baseline)).byteLength+64*1024;
  let calls=0;let capturedLengths:number[]=[];
  const db=wrap(s.node.db,async(_statements,run)=>{calls++;if(calls===2)await s.service.import(OWNER,{kind:'lexicon',data:{words:Array.from({length:200},(_,i)=>({id:`my-growth-${String(i).padStart(3,'0')}`,term:'large',meaning:'较大的',example:'x'.repeat(1000),tags:[],sceneIds:[],source:'Original CC0 local test'}))}});const results=await run();if(calls===2)capturedLengths=results.slice(13).map(r=>r.results.length);return results;});
  await assert.rejects(exportDisasterBackup(db,OWNER,{now,maxBytes}),code('DISASTER_LIMIT_EXCEEDED'));assert.equal(calls,2);assert.equal(capturedLengths.length,11);assert.ok(capturedLengths.every(n=>n===0));
 }finally{s.node.close();}
});

test('snapshot completed across Shanghai midnight timestamps the captured next-day data correctly',async()=>{
 const s=await fixture();try{
  let time=Date.parse('2026-10-31T15:59:59Z');let calls=0;
  const nextDayService=new VocabularyService(new D1Repository(s.node.db,()=>time),noAI,{words:seedWords,scenes:seedScenes,info:lexiconInfo},()=>time);
  const db=wrap(s.node.db,async(_statements,run)=>{calls++;if(calls===2){time=Date.parse('2026-10-31T16:00:01Z');await nextDayService.reviewBatch(OWNER,{batchId:'cross-midnight-backup',day:'2026-11-01',ratings:[{wordId:seedWords[1].id,grade:'remembered'}],dayCompleted:false});}return run();});
  const snapshot=await exportDisasterBackup(db,OWNER,{now:()=>time});assert.equal(snapshot.exportedAt,'2026-10-31T16:00:01.000Z');assert.equal(snapshot.summary.learnedCount,2);assert.equal((await validateSnapshot(snapshot)).valid,true);
 }finally{s.node.close();}
});

test('marker-only first use is exported without fabricating default user/config rows',async()=>{
 const node=createNodeD1();try{
  const service=new VocabularyService(new D1Repository(node.db,now),noAI,{words:seedWords,scenes:seedScenes,info:lexiconInfo},now);
  await service.marksBatch(OWNER,{operations:[{opId:'before-bootstrap-marker',wordId:seedWords[0].id,delta:1}]});
  const snapshot=await exportDisasterBackup(node.db,OWNER,{now});assert.equal(snapshot.tables.word_marks.rowCount,1);assert.equal(snapshot.tables.mark_operations.rowCount,1);assert.equal(snapshot.tables.user_state.rowCount,0);assert.equal(snapshot.tables.plan_config.rowCount,0);assert.equal(snapshot.summary.learnedCount,0);assert.equal((await validateSnapshot(snapshot)).valid,true);
  assert.equal((await node.db.prepare('SELECT COUNT(*) AS n FROM user_state').first<{n:number}>())!.n,0);
 }finally{node.close();}
});

test('D1 five-term compound SELECT limit never requires splitting the authoritative transaction',async()=>{
 const s=await fixture();try{
  const batches:string[][]=[];const db=wrap(s.node.db,async(statements,run)=>{const queries=statements.map(sql);batches.push(queries);for(const query of queries){assert.ok(!/\bUNION\b/i.test(query),'workerd caps compound SELECT at five terms');assert.ok(Buffer.byteLength(query)<100_000);assert.ok((query.match(/\?/g)??[]).length<=100);}return run();});
  const snapshot=await exportDisasterBackup(db,OWNER,{now});assert.equal(snapshot.summary.progressCount,1);assert.equal(batches[0].length,1);assert.equal(batches[1].length,24);assert.match(batches[0][0],/FROM json_each\(json_array\(/);assert.equal(snapshot.tables.review_events.rowCount,1);
 }finally{s.node.close();}
});

test('D1 nested causes expose only fixed diagnostic categories and no SQL or bound content',async()=>{
 const node=createNodeD1();const logs:unknown[][]=[];const original=console.error;console.error=(...values:unknown[])=>{logs.push(values);};
 try{
  const secret='PRIVATE_BOUND_VALUE_DO_NOT_LOG';const db=wrap(node.db,async()=>{throw new Error(`D1_ERROR:${secret}`,{cause:new Error(`SQLITE_ERROR: too many terms in compound SELECT ${secret}`)});});
  await assert.rejects(exportDisasterBackup(db,OWNER,{now}),code('DISASTER_CAPTURE_FAILED'));
  assert.deepEqual(JSON.parse(logs[0][1] as string),{stage:'preflight',reason:'compound_select_limit',sqliteCodes:['D1_ERROR','SQLITE_ERROR']});assert.ok(!JSON.stringify(logs).includes(secret));
  logs.length=0;let calls=0;const denied=wrap(node.db,async(_statements,run)=>{calls++;if(calls===2)throw new Error('D1_ERROR',{cause:new Error(`SQLITE_AUTH not authorized ${secret}`)});return run();});
  await assert.rejects(exportDisasterBackup(denied,OWNER,{now}),code('DISASTER_CAPTURE_FAILED'));assert.equal(JSON.parse(logs[0][1] as string).stage,'capture');assert.equal(JSON.parse(logs[0][1] as string).reason,'sql_authorization');assert.ok(!JSON.stringify(logs).includes(secret));
 }finally{console.error=original;node.close();}
});

test('unknown schema objects are rejected and diagnostics contain identifiers only, never SQL or rows',async()=>{
 const node=createNodeD1();const logs:unknown[][]=[];const original=console.error;console.error=(...values:unknown[])=>{logs.push(values);};
 try{
  await node.db.prepare('CREATE TABLE platform_diagnostic_candidate(private_payload TEXT)').run();await node.db.prepare('INSERT INTO platform_diagnostic_candidate VALUES (?)').bind('DO_NOT_LOG_PRIVATE_ROW').run();
  await assert.rejects(exportDisasterBackup(node.db,OWNER,{now}),code('DISASTER_SCHEMA_MISMATCH'));
  assert.deepEqual(JSON.parse(logs[0][1] as string),{reason:'unexpected_schema_object',name:'platform_diagnostic_candidate',type:'table',table:'platform_diagnostic_candidate'});const output=JSON.stringify(logs);assert.ok(!output.includes('private_payload'));assert.ok(!output.includes('DO_NOT_LOG_PRIVATE_ROW'));assert.ok(!output.includes('CREATE TABLE'));
 }finally{console.error=original;node.close();}
});

test('observed Sites migration infrastructure table is precisely excluded without exporting its data',async()=>{
 const node=createNodeD1();try{
  await node.db.prepare('CREATE TABLE __appgarden_migrations(id INTEGER PRIMARY KEY,name TEXT,applied_at INTEGER)').run();await node.db.prepare('INSERT INTO __appgarden_migrations(name,applied_at) VALUES(?,?)').bind('PLATFORM_MIGRATION_RECORD_NOT_APP_DATA',now()).run();
  const snapshot=await exportDisasterBackup(node.db,OWNER,{now});assert.equal(Object.keys(snapshot.tables).length,11);assert.equal(snapshot.complete,true);assert.ok(!JSON.stringify(snapshot).includes('PLATFORM_MIGRATION_RECORD_NOT_APP_DATA'));assert.equal((await validateSnapshot(snapshot)).valid,true);
 }finally{node.close();}
});
