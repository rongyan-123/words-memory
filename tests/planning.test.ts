import test from 'node:test';
import assert from 'node:assert/strict';
import { createNodeD1 } from '../src/adapters/node.ts';
import { D1Repository } from '../src/server/repository.ts';
import { VocabularyService } from '../src/server/service.ts';
import { addDays, createProgress, dateKey, defaultSettings, type Plan, type Scene, type SemanticSelection, type Word } from '../src/core/index.ts';
import type { AIPlanner, SemanticPlannerInput } from '../src/server/provider.ts';

const words:Word[]=Array.from({length:240},(_,i)=>({id:`p-word-${i}`,term:`term${i}`,meaning:`原创释义${i}`,tags:['计算机'],sceneIds:['p-scene'],source:'Original CC0 test'}));
const scenes:Scene[]=[{id:'p-scene',title:'完成部署任务',description:'根据真实任务连续推进',task:'准备环境、部署应用、验证服务',wordIds:words.map(w=>w.id)}];
function selection(input:SemanticPlannerInput,count=32):SemanticSelection {
 const ids=input.availableWordIds.slice(0,count);
 return {source:'ai',title:'真实部署任务',rationale:'按任务语义自然形成三十二词',notice:'AI 语义选词',groups:ids.length?[{sceneId:'p-scene',title:'连续任务',task:'依次完成准备部署验证',wordIds:ids}]:[],wordIds:ids};
}
function setup(overrides:Partial<AIPlanner>={}) {
 let time=Date.parse('2026-10-31T01:00:00Z');let calls=0;
 const node=createNodeD1();const repository=new D1Repository(node.db,()=>time);
 const planner:AIPlanner={configured:true,async generate(){throw new Error('new planning must not call legacy ranged generate');},async generateSemantic(input){calls++;return selection(input);},...overrides};
 const service=new VocabularyService(repository,planner,{words,scenes,info:{coverage:'test-only'}},()=>time);
 return {node,repository,service,get calls(){return calls;},get date(){return dateKey(time);},advance(days:number){time+=days*86400000;},tickMs(ms:number){time+=ms;}};
}
async function firstThree(service:VocabularyService,owner='a') {for(let i=0;i<3;i++) await service.planningTick(owner,{});}

test('GET bootstrap/day does not call AI; first three ticks accept32 and reserve96 without learning',async()=>{
 const s=setup();try {
  await s.service.settings('a',{...defaultSettings(s.date),dailyMinutes:5,pageSize:10,horizonDays:10});
  const boot=await s.service.bootstrap('a');assert.equal(s.calls,0);assert.equal(boot.planning.startDate,s.date);assert.deepEqual(boot.planning.currentBatch,[1,3]);
  assert.equal((await s.service.dayList('a',{day:1})).status,'missing');assert.equal(s.calls,0);
  for(let day=1;day<=3;day++){const result=await s.service.planningTick('a',{});assert.equal(result.generatedDay,day);assert.equal(s.calls,day);}
  const days=await s.repository.scheduled('a');assert.deepEqual(days.map(d=>d.plan.wordIds.length),[32,32,32]);
  const reserved=await s.repository.reservations('a');assert.equal(reserved.length,96);assert.equal(new Set(reserved).size,96);
  assert.equal((await s.service.bootstrap('a')).progress.length,0);
  const page=await s.service.dayList('a',{day:1});assert.equal(page.words.length,32);assert.equal(page.pageSize,10);assert.equal(page.isToday,true);
  const done=await s.service.planningTick('a',{});assert.equal(done.hasMore,false);assert.equal(s.calls,3);assert.equal((await s.service.dayList('a',{day:4})).status,'missing');
 } finally{s.node.close();}
});

test('global lease prevents overlapping paid requests and excludes explicit future reservations',async()=>{
 let unblock!:()=>void;let entered!:()=>void;const enteredPromise=new Promise<void>(r=>entered=r);const wait=new Promise<void>(r=>unblock=r);let calls=0;
 const s=setup({async generateSemantic(input){calls++;if(calls===1){entered();await wait;}return selection(input);}});
 try {
  const future=s.service.planningTick('a',{day:5});await enteredPromise;
  const overlapping=await s.service.planningTick('a',{});assert.equal(overlapping.pending,true);assert.equal(calls,1);
  unblock();await future;await s.service.planningTick('a',{});assert.equal(calls,2);
  const d=await s.repository.scheduled('a');assert.equal(new Set(d.flatMap(x=>x.plan.wordIds)).size,64);
  assert.equal((await s.service.dayList('a',{day:5})).canRate,false);
  await assert.rejects(s.service.reviewBatch('a',{batchId:'future-batch-1',day:addDays(s.date,4),ratings:[{wordId:d[0].plan.wordIds[0],grade:'remembered'}],dayCompleted:false}),/未来/);
  assert.equal((await s.service.bootstrap('a')).progress.length,0);
 } finally{s.node.close();}
});

test('legacy today plan is adopted without another model call and retains today learned rows',async()=>{
 const s=setup();try {
  await s.repository.load('a',s.date);await s.service.review('a',{eventId:'legacy-learn-1',wordId:words[0].id,grade:'remembered'});
  const token='legacy-token';assert.equal(await s.repository.claimPlan('a',s.date,token,false),true);
  const ids=words.slice(0,5).map(w=>w.id);const plan:Plan={...selection({words,scenes,availableWordIds:ids},5),date:s.date};
  await s.repository.savePlan('a',s.date,token,plan);
  const result=await s.service.planningTick('a',{});assert.equal(result.generatedDay,1);assert.equal(s.calls,0);
  const day=await s.service.dayList('a',{day:1});assert.deepEqual(day.newWordIds,ids);assert.equal((await s.repository.reservations('a')).length,4);assert.equal((await s.service.bootstrap('a')).progress.length,1);
  await s.service.planningTick('a',{day:1});assert.equal(s.calls,0);assert.deepEqual((await s.service.dayList('a',{day:1})).newWordIds,ids);
 }finally{s.node.close();}
});

test('batch is atomic/idempotent and never silently completes unchecked words',async()=>{
 const s=setup();try {
  await s.service.planningTick('a',{});const page=await s.service.dayList('a',{day:1});
  const partial={batchId:'partial-batch-1',day:s.date,ratings:[{wordId:page.wordIds[0],grade:'remembered'}],dayCompleted:true};
  await assert.rejects(s.service.reviewBatch('a',partial),/未标记/);assert.equal((await s.service.bootstrap('a')).progress.length,0);
  const packet={batchId:'complete-batch-1',day:s.date,ratings:page.wordIds.map(wordId=>({wordId,grade:'remembered'})),dayCompleted:true};
  const first=await s.service.reviewBatch('a',packet);assert.equal(first.duplicate,false);assert.equal(first.dayCompleted,true);assert.equal(first.progress.length,32);
  assert.ok(first.progress.every(p=>p.exposuresToday===1&&p.stage===0&&p.nextDueOn===addDays(s.date,1)));
  const replay=await s.service.reviewBatch('a',packet);assert.equal(replay.duplicate,true);assert.ok(replay.progress.every(p=>p.exposuresToday===1));
  await assert.rejects(s.service.reviewBatch('a',{...packet,ratings:[{wordId:page.wordIds[0],grade:'forgot'}]}),/同一批次/);
  assert.equal((await s.service.dayList('a',{day:1})).completed,true);
 }finally{s.node.close();}
});

test('third-day explicit completion unlocks4–6 before midnight; calendar day4 also advances',async()=>{
 const s=setup();try {
  await firstThree(s.service);s.advance(2);const page=await s.service.dayList('a',{day:3});
  const result=await s.service.reviewBatch('a',{batchId:'day-three-done',day:s.date,ratings:page.wordIds.map(wordId=>({wordId,grade:'remembered'})),dayCompleted:true});
  assert.deepEqual(result.planning.currentBatch,[4,6]);const next=await s.service.planningTick('a',{});assert.equal(next.generatedDay,4);
  s.advance(1);assert.deepEqual((await s.service.bootstrap('a')).planning.currentBatch,[4,6]);
  s.advance(7);const end=await s.service.planningTick('a',{});assert.equal(end.hasMore,false);assert.equal(end.planning.horizonComplete,true);
 }finally{s.node.close();}
});

test('stale uncommitted outbox grades actualtoday, ignores past completion; replay counts once',async()=>{
 const s=setup();try {
  await s.service.planningTick('a',{});const page=await s.service.dayList('a',{day:1});const oldDate=s.date;s.advance(1);
  const packet={batchId:'stale-batch-001',day:oldDate,ratings:[{wordId:page.wordIds[0],grade:'remembered'}],dayCompleted:true};
  const r=await s.service.reviewBatch('a',packet);assert.equal(r.completionIgnored,true);assert.equal(r.dayCompleted,false);assert.equal(r.progress[0].firstLearnedOn,s.date);assert.equal(r.progress[0].nextDueOn,addDays(s.date,1));
  assert.equal((await s.service.dayList('a',{day:1})).completed,false);s.advance(1);
  const replay=await s.service.reviewBatch('a',packet);assert.equal(replay.duplicate,true);assert.equal(replay.progress[0].exposuresToday,1);
 }finally{s.node.close();}
});

test('new/due overlap is displayed once and completed reviews stay visible today',async()=>{
 const s=setup();try {
  await s.service.planningTick('a',{});const p={...createProgress(words[0].id),firstLearnedOn:addDays(s.date,-1),nextDueOn:s.date,lastReviewedOn:addDays(s.date,-1),lastExposureOn:addDays(s.date,-1),exposuresToday:1,lastGrade:'remembered'};
  await s.service.import('a',{kind:'progress',data:[p]});let page=await s.service.dayList('a',{day:1});assert.equal(page.wordIds.length,32);assert.equal(page.reviewWordIds.length,1);
  await s.service.reviewBatch('a',{batchId:'overlap-batch-1',day:s.date,ratings:[{wordId:words[0].id,grade:'remembered'}],dayCompleted:false});
  page=await s.service.dayList('a',{day:1});assert.equal(page.wordIds.length,32);assert.equal(page.reviewWordIds.length,1);assert.equal(page.pendingReviewWordIds.length,0);assert.equal(page.progress[0].stage,1);
 }finally{s.node.close();}
});

test('SQLite transaction rolls back every rating and batch token if one word write fails',async()=>{
 const s=setup();try {
  await s.service.planningTick('a',{});
  await s.node.db.prepare(`CREATE TRIGGER reject_second BEFORE INSERT ON word_progress WHEN NEW.word_id='p-word-1' BEGIN SELECT RAISE(ABORT,'test rollback'); END`).run();
  const packet={batchId:'rollback-batch-1',day:s.date,ratings:[{wordId:'p-word-0',grade:'remembered'},{wordId:'p-word-1',grade:'remembered'}],dayCompleted:false};
  await assert.rejects(s.service.reviewBatch('a',packet),/test rollback/);
  assert.equal((await s.service.bootstrap('a')).progress.length,0);assert.equal(await s.repository.batchRecord('a',packet.batchId),null);
  assert.equal(await s.repository.event('a','b_rollback-batch-1_0'),null);
 }finally{s.node.close();}
});

test('inventory changed during AI produces no conflicting reservations and bounded retry backoff',async()=>{
 let unblock!:()=>void;let entered!:()=>void;const ready=new Promise<void>(r=>entered=r);const gate=new Promise<void>(r=>unblock=r);
 const s=setup({async generateSemantic(input){entered();await gate;return selection(input);}});
 try {
  const tick=s.service.planningTick('a',{});await ready;
  await s.service.review('a',{eventId:'during-generation-1',wordId:'p-word-0',grade:'remembered'});unblock();
  const result=await tick;assert.equal(result.generatedDay,null);assert.equal(result.reason,'inventory_changed');assert.equal((await s.repository.reservations('a')).length,0);
  const retry=await s.service.planningTick('a',{});assert.ok(retry.retryAfter!>Date.parse('2026-10-31T01:00:00Z'));
 }finally{s.node.close();}
});

test('v3 backup preserves all real progress/settings while frozen planning remains reference-only',async()=>{
 const s=setup();try {
  await s.service.settings('a',{...defaultSettings(s.date),horizonDays:10,pageSize:20});await s.service.planningTick('a',{});
  await s.service.reviewBatch('a',{batchId:'backup-v2-batch',day:s.date,ratings:[{wordId:'p-word-0',grade:'fuzzy'}],dayCompleted:false});
  const backup=await s.service.export('a');assert.equal(backup.schemaVersion,3);assert.equal(backup.planning.reservationCount,32);
  await s.service.import('b',{kind:'backup',data:backup});const b=await s.service.bootstrap('b');assert.equal(b.progress.length,1);assert.equal(b.settings.pageSize,20);assert.equal((await s.repository.scheduled('b')).length,0);
 }finally{s.node.close();}
});

test('zero-rating completion works only after every row was explicitly marked today',async()=>{
 const s=setup();try {
  await s.service.planningTick('a',{});const page=await s.service.dayList('a',{day:1});
  await s.service.reviewBatch('a',{batchId:'save-all-no-done',day:s.date,ratings:page.wordIds.map(wordId=>({wordId,grade:'fuzzy'})),dayCompleted:false});
  const result=await s.service.reviewBatch('a',{batchId:'confirm-zero-done',day:s.date,ratings:[],dayCompleted:true});assert.equal(result.dayCompleted,true);assert.equal(result.progress.length,0);
  const replay=await s.service.reviewBatch('a',{batchId:'confirm-zero-done',day:s.date,ratings:[],dayCompleted:true});assert.equal(replay.duplicate,true);
 }finally{s.node.close();}
});

test('concurrent duplicate batches are counted once and different batches retain all updates',async()=>{
 const s=setup();try {
  await s.service.planningTick('a',{});const packet={batchId:'same-concurrent-batch',day:s.date,ratings:[{wordId:'p-word-0',grade:'forgot'}],dayCompleted:false};
  const same=await Promise.all(Array.from({length:8},()=>s.service.reviewBatch('a',packet)));assert.equal(same.filter(r=>!r.duplicate).length,1);
  await Promise.all([s.service.reviewBatch('a',{...packet,batchId:'distinct-batch-one',ratings:[{wordId:'p-word-0',grade:'fuzzy'}]}),s.service.reviewBatch('a',{...packet,batchId:'distinct-batch-two',ratings:[{wordId:'p-word-0',grade:'remembered'}]})]);
  const p=(await s.repository.progress('a','p-word-0')).progress;assert.equal(p.exposuresToday,3);assert.equal(p.stage,0);
  const late=await s.service.reviewBatch('a',packet);assert.equal(late.progress[0].exposuresToday,3);
 }finally{s.node.close();}
});

test('global lease expiration permits recovery but a stale holder cannot commit or release new lease',async()=>{
 const s=setup();try {
  await s.service.bootstrap('a');assert.equal(await s.repository.claimPlanning('a','old-lease'),true);s.tickMs(105_001);assert.equal(await s.repository.claimPlanning('a','new-lease'),true);
  const plan:Plan={...selection({words,scenes,availableWordIds:words.map(w=>w.id)}),date:s.date};
  assert.equal(await s.repository.commitScheduled('a','old-lease',{date:s.date,dayIndex:1,plan,completedAt:null}),false);
  await s.repository.releasePlanning('a','old-lease',true);assert.equal((await s.service.planningStatus('a')).pending,true);
  assert.equal(await s.repository.commitScheduled('a','new-lease',{date:s.date,dayIndex:1,plan,completedAt:null}),true);
  assert.equal((await s.repository.reservations('a')).length,32);
 }finally{s.node.close();}
});

test('new-word horizon ending never truncates actual 1/3/7-day reviews or clamps the calendar',async()=>{
 const s=setup();try {
  await s.service.settings('a',{...defaultSettings(s.date),horizonDays:1});await s.service.planningTick('a',{});
  let page=await s.service.dayList('a',{day:1});
  await s.service.reviewBatch('a',{batchId:'horizon-learn-d1',day:s.date,ratings:page.wordIds.map(wordId=>({wordId,grade:'remembered'})),dayCompleted:true});
  s.advance(1);
  let status=await s.service.planningStatus('a');assert.equal(status.currentDay,2);assert.equal(status.calendarDays,2);
  page=await s.service.dayList('a',{day:2});assert.equal(page.reviewOnly,true);assert.equal(page.status,'ready');assert.equal(page.canRate,true);assert.equal(page.newWordIds.length,0);assert.equal(page.reviewWordIds.length,32);
  const tick=await s.service.planningTick('a',{});assert.equal(tick.reason,'review_only');assert.equal(s.calls,1);
  await s.service.reviewBatch('a',{batchId:'horizon-review-d2',day:s.date,ratings:page.wordIds.map(wordId=>({wordId,grade:'remembered'})),dayCompleted:true});
  assert.equal((await s.service.dayList('a',{day:2})).completed,true);status=await s.service.planningStatus('a');assert.equal(status.calendarDays,4);
  s.advance(2);page=await s.service.dayList('a',{day:4});assert.equal(page.reviewWordIds.length,32);
  await s.service.reviewBatch('a',{batchId:'horizon-review-d4',day:s.date,ratings:page.wordIds.map(wordId=>({wordId,grade:'remembered'})),dayCompleted:true});
  status=await s.service.planningStatus('a');assert.equal(status.currentDay,4);assert.equal(status.calendarDays,8);
  s.advance(4);page=await s.service.dayList('a',{day:8});assert.equal(page.reviewWordIds.length,32);
  const final=await s.service.reviewBatch('a',{batchId:'horizon-review-d8',day:s.date,ratings:page.wordIds.map(wordId=>({wordId,grade:'remembered'})),dayCompleted:true});assert.ok(final.progress.every(p=>p.stage===3&&p.nextDueOn===null));assert.equal(s.calls,1);
 }finally{s.node.close();}
});

test('adopting known older legacy rows keeps them visible as practice without new reservation',async()=>{
 const s=setup();try {
  const p={...createProgress('p-word-0'),firstLearnedOn:addDays(s.date,-2),nextDueOn:addDays(s.date,1),stage:1,lastReviewedOn:addDays(s.date,-1),lastExposureOn:addDays(s.date,-1),exposuresToday:1,lastGrade:'remembered'};
  await s.service.import('a',{kind:'progress',data:[p]});const token='legacy-prior-token';await s.repository.claimPlan('a',s.date,token,false);
  const plan:Plan={...selection({words,scenes,availableWordIds:words.slice(0,5).map(w=>w.id)},5),date:s.date};await s.repository.savePlan('a',s.date,token,plan);
  await s.service.planningTick('a',{});const page=await s.service.dayList('a',{day:1});assert.equal(page.wordIds.length,5);assert.equal(page.newWordIds.length,4);assert.ok(page.reviewWordIds.includes('p-word-0'));assert.equal((await s.repository.reservations('a')).length,4);assert.equal(s.calls,0);
 }finally{s.node.close();}
});

test('day10 real learning retains reviews on day11/13/17 without any new AI request',async()=>{
 const s=setup();try {
  await s.service.bootstrap('a');s.advance(9);await s.service.planningTick('a',{day:10});let page=await s.service.dayList('a',{day:10});
  await s.service.reviewBatch('a',{batchId:'late-learn-day10',day:s.date,ratings:page.wordIds.map(wordId=>({wordId,grade:'remembered'})),dayCompleted:true});
  for(const [advance,day,stage] of [[1,11,1],[2,13,2],[4,17,3]]) {
   s.advance(advance);const state=await s.service.planningStatus('a');assert.equal(state.currentDay,day);assert.ok(state.calendarDays>=day);
   page=await s.service.dayList('a',{day});assert.equal(page.reviewOnly,true);assert.equal(page.reviewWordIds.length,32);
   const result=await s.service.reviewBatch('a',{batchId:`late-review-day${day}`,day:s.date,ratings:page.wordIds.map(wordId=>({wordId,grade:'remembered'})),dayCompleted:true});assert.ok(result.progress.every(p=>p.stage===stage));
   assert.equal((await s.service.planningTick('a',{})).reason,'review_only');assert.equal(s.calls,1);
  }
 }finally{s.node.close();}
});

test('reducing horizon preserves already frozen future new-word lists',async()=>{
 const s=setup();try {
  await firstThree(s.service);const before=await s.service.dayList('a',{day:3});await s.service.settings('a',{...defaultSettings(s.date),horizonDays:1});
  const after=await s.service.dayList('a',{day:3});assert.deepEqual(after.newWordIds,before.newWordIds);assert.equal(after.reviewOnly,false);assert.equal(after.status,'ready');assert.equal(s.calls,3);
 }finally{s.node.close();}
});

test('inventory fully reserved is not presented as learned and consumes no extra AI',async()=>{
 let calls=0;const s=setup({async generateSemantic(input){calls++;return selection(input,200);}});
 try {
  await firstThree(s.service);assert.equal(calls,2);const third=await s.service.dayList('a',{day:3});assert.equal(third.wordIds.length,0);assert.match(third.plan!.notice,/预取不代表已学/);assert.equal((await s.service.bootstrap('a')).stats.learned,0);
 }finally{s.node.close();}
});
