import { MarkSafetyError, prepareMarkOperations, validateMarkOperations, validateMarkSnapshots } from './marks.ts';
import { addDays, daysBetween, isDateKey, applyGrade, buildSemanticFallback, buildFallbackPlan, validateSemanticSelection, rollingBatch, uniqueDayWordIds, calculateNewWordRange, dateKey, dueProgress, validateLexiconImport, validateProgressImport, validateSettings, ValidationError, type Grade, type Plan, type Progress, type Scene, type Word, type PlanGroup, type NewWordRange } from '../core/index.ts';
import { aiFailureNotice, safeAIFailure, type AIPlanner } from './provider.ts';
import type { EventResult, ImportedLexicon, Repository, UserData, PlanningConfig, ScheduledDay, PreparedReview, BatchResult } from './repository.ts';
import { seedWordOverlays } from '../data/lexicon-expansion.ts';
import { wordPresentation, enrichWordForPlanning } from '../data/word-presentation.ts';
export class HTTPError extends Error { status: number; code: string; constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code; } }
export interface SeedData { words: Word[]; scenes: Scene[]; info: unknown }
export class VocabularyService {
  private repository: Repository;
  private planner: AIPlanner;
  private seed: SeedData;
  private now: () => number;
  constructor(repository: Repository, planner: AIPlanner, seed: SeedData, now: () => number = Date.now) { this.repository = repository; this.planner = planner; this.seed = seed; this.now = now; }
  private day() { return dateKey(this.now()); }
  private async context(owner: string) {
    const date = this.day();
    const data = await this.repository.load(owner, date);
    const words = [...this.seed.words, ...data.lexicon.words];
    const scenes = [...this.seed.scenes, ...data.lexicon.scenes];
    const known = new Set(words.map(w => w.id));
    const progress = data.progress.filter(p => known.has(p.wordId));
    const learned = new Set(progress.filter(p => p.firstLearnedOn).map(p => p.wordId));
    const availableWordIds = words.filter(w => !learned.has(w.id)).map(w => w.id);
    const due = dueProgress(progress, date);
    const available = new Set(availableWordIds);
    const groupSizes = scenes.map(s => s.wordIds.filter(id => available.has(id)).length).filter(Boolean);
    const range = calculateNewWordRange({ remaining: availableWordIds.length, dueCount: due.length, settings: data.settings, today: date, groupSizes });
    return { ...data, date, words, scenes, progress, availableWordIds, due, range };
  }
  async bootstrap(owner: string) {
    const c = await this.context(owner);
    const saved = await this.repository.plan(owner, c.date);
    const planning = await this.planningState(owner, c);
    const todayScheduled=(await this.repository.scheduled(owner)).find(d=>d.date===c.date);
    const markKnownIds=new Set(c.words.map(w=>w.id));
    const marks=(await this.repository.marks(owner)).filter(m=>markKnownIds.has(m.wordId));
    const displayedWords=c.words.map(word=>({...word,tags:wordPresentation(word).tags}));
    const reserved=new Set((await this.repository.reservations(owner)).filter(id=>markKnownIds.has(id)));
    return {
      apiVersion: 3, marks, planning, currentDay: planning.currentDay, date: c.date, settings: c.settings, words: displayedWords, wordAnnotations:annotationsFor(c.words), scenes: c.scenes, progress: c.progress,
      plan: todayScheduled?.plan ?? saved.plan, newWordRange: c.range, dueWordIds: c.due.map(p => p.wordId), aiConfigured: this.planner.configured,
      lexiconInfo: this.seed.info,
      lexiconCounts: { total: c.words.length, seed: this.seed.words.length, imported: c.lexicon.words.length, scenes: c.scenes.length },
      lexiconCoverage:{cet4:displayedWords.filter(w=>w.tags.includes('cet4')).length,technical:displayedWords.filter(w=>w.tags.some(t=>['technical-context','cloud-native'].includes(t))).length,overlap:displayedWords.filter(w=>w.tags.includes('cet4')&&w.tags.some(t=>['technical-context','cloud-native'].includes(t))).length,computingCandidates:displayedWords.filter(w=>w.tags.includes('computing-candidate')).length},
      inventory:{reserved:reserved.size,unassigned:c.availableWordIds.filter(id=>!reserved.has(id)).length,remainingUnlearned:c.availableWordIds.length,notice:'计划天数不是全词库完成承诺；已生成日期保持不变，未排新词后续按语义分组，实际数量随复习负载与任务组变化。'},
      stats: { total: c.words.length, learned: c.progress.filter(p => p.firstLearnedOn).length, solid: c.progress.filter(p => p.stage === 3).length, due: c.due.length, remaining: c.availableWordIds.length, todayLearned: c.progress.filter(p => p.firstLearnedOn === c.date).length, todayReviewed: c.progress.filter(p => p.lastReviewedOn === c.date && p.firstLearnedOn !== c.date).length },
    };
  }
  /** Compatibility endpoint: v2 plans are frozen; legacy counters never charge this path. */
  async plan(owner: string, regenerate = false): Promise<Plan> {
    const c=await this.context(owner);const planning=await this.planningState(owner,c);
    if(planning.actualDay>planning.horizonDays) return reviewOnlyPlan(c.date);
    if(planning.actualDay<1) throw new HTTPError(409,'PLAN_NOT_STARTED','计划尚未开始。');
    const saved=(await this.repository.scheduled(owner)).find(d=>d.date===c.date);
    const legacy=await this.repository.plan(owner,c.date);
    if(regenerate && (saved||legacy.plan)) throw new HTTPError(409,'PLAN_FROZEN','当天计划已冻结，不会重新生成或重复收费。');
    if(saved) return saved.plan;
    await this.planningTick(owner,{day:planning.currentDay});
    const created=(await this.repository.scheduled(owner)).find(d=>d.date===c.date);
    if(!created) throw new HTTPError(429,'PLAN_BUSY','计划正在生成或等待安全重试，请稍后继续。');
    return created.plan;
  }
  private async planningState(owner: string, supplied?: Awaited<ReturnType<VocabularyService['context']>>) {
    const c=supplied ?? await this.context(owner);
    const config=await this.repository.planning(owner,c.date,c.settings.horizonDays ?? 10,c.settings.pageSize ?? 0);
    const scheduled=await this.repository.scheduled(owner);
    const actualDay=daysBetween(config.startDate,c.date)+1;
    const currentDay=Math.max(1,actualDay);
    const nextDueDay=Math.max(0,...c.progress.filter(p=>p.nextDueOn).map(p=>daysBetween(config.startDate,p.nextDueOn!)+1));
    const calendarDays=Math.max(config.horizonDays,currentDay,...scheduled.map(d=>d.dayIndex),Math.min(nextDueDay,Math.max(config.horizonDays,currentDay)+366));
    const currentBatch=rollingBatch(c.date,config.startDate,config.horizonDays,scheduled.filter(d=>d.completedAt!==null).map(d=>d.dayIndex));
    const batchDays=Array.from({length:currentBatch[1]-currentBatch[0]+1},(_,i)=>currentBatch[0]+i);
    const byDay=new Map(scheduled.map(d=>[d.dayIndex,d]));
    const days=Array.from({length:calendarDays},(_,i)=>{
      const day=i+1;const date=addDays(config.startDate,i);const saved=byDay.get(day);const reviewOnly=day>config.horizonDays && !saved?.plan.wordIds.length;
      return {day,dayNumber:day,date,status:(saved||reviewOnly?'ready':config.leaseUntil && config.leaseUntil>this.now() && batchDays.includes(day)?'planning':'missing') as 'ready'|'planning'|'missing',reviewOnly,newCount:reviewOnly?0:saved?.plan.wordIds.length ?? 0,reviewCount:dayReviewIds(c.progress,date).length,completed:saved?.completedAt!=null,source:saved?.plan.source ?? null};
    });
    return {startDate:config.startDate,horizonDays:config.horizonDays,calendarDays,pageSize:config.pageSize,currentDay,actualDay,currentBatch,batchDays,days,pending:Boolean(config.leaseUntil && config.leaseUntil>this.now()),retryAfter:config.retryAfter,horizonComplete:actualDay>config.horizonDays};
  }
  async planningStatus(owner: string) { return this.planningState(owner); }
  async dayList(owner: string, selector: {day?:number|string;date?:string}={}) {
    const c=await this.context(owner);const planning=await this.planningState(owner,c);
    let day=selector.date!==undefined ? (isDateKey(selector.date)?daysBetween(planning.startDate,selector.date)+1:NaN) : selector.day===undefined?planning.currentDay:Number(selector.day);
    if(!Number.isInteger(day)||day<1||day>planning.calendarDays) throw new ValidationError('日期不在当前学习与复习日历内');
    const date=addDays(planning.startDate,day-1);
    const saved=(await this.repository.scheduled(owner)).find(d=>d.date===date);
    const known=new Map(c.words.map(w=>[w.id,w]));
    const reviewOnly=day>planning.horizonDays && !saved?.plan.wordIds.length;
    const progressById=new Map(c.progress.map(p=>[p.wordId,p]));
    const plannedIds=(saved?.plan.wordIds ?? []).filter(id=>known.has(id));
    const newWordIds=reviewOnly?[]:plannedIds.filter(id=>!progressById.get(id)?.firstLearnedOn || progressById.get(id)!.firstLearnedOn!>=date);
    const reviewWordIds=[...new Set([...dayReviewIds(c.progress,date),...plannedIds.filter(id=>!newWordIds.includes(id))])].filter(id=>known.has(id));
    const wordIds=uniqueDayWordIds(newWordIds,reviewWordIds);
    const marks=[...(await this.repository.marksMany(owner,wordIds)).values()];
    const dayWords=wordIds.map(id=>known.get(id)!);
    return {marks,day,dayNumber:day,date,isToday:date===c.date,isFuture:date>c.date,status:(saved||reviewOnly?'ready':planning.pending?'planning':'missing') as 'ready'|'planning'|'missing',completed:saved?.completedAt!=null,reviewOnly,plan:saved?.plan ?? (reviewOnly?reviewOnlyPlan(date):null),newWordIds,reviewWordIds,wordIds,words:dayWords.map(word=>({...word,tags:wordPresentation(word).tags})),wordAnnotations:annotationsFor(dayWords),progress:c.progress.filter(p=>wordIds.includes(p.wordId)),pendingReviewWordIds:dueProgress(c.progress,date).map(p=>p.wordId),reviewPreview:date>c.date,reviewNotice:date>c.date?'未来复习仅根据已经真实学习的进度预览，实际学习后自动更新。':null,canRate:date<=c.date && Boolean(saved||reviewOnly),pageSize:planning.pageSize};
  }
  async planningTick(owner: string, value: unknown={}) {
    const x=object(value);let c=await this.context(owner);let planning=await this.planningState(owner,c);
    const requested=x.day===undefined?null:Number(x.day);
    if(requested!==null && (!Number.isInteger(requested)||requested<1||requested>planning.calendarDays)) throw new ValidationError('生成日期不在当前学习与复习日历内');
    if((requested!==null&&requested>planning.horizonDays)||(requested===null&&planning.horizonComplete)) return {generatedDay:null,hasMore:false,missingDays:[],pending:false,currentBatch:planning.currentBatch,planning,reason:'review_only'};
    const targetDays=requested===null?(planning.horizonComplete?[]:planning.batchDays):[requested];
    const missing=()=>targetDays.filter(day=>planning.days.find(d=>d.day===day)?.status!=='ready');
    const next=missing()[0];
    if(next===undefined) return {generatedDay:null,hasMore:false,missingDays:[],pending:false,currentBatch:planning.currentBatch,planning};
    const token=crypto.randomUUID();
    if(!await this.repository.claimPlanning(owner,token)) { planning=await this.planningState(owner); return {generatedDay:null,hasMore:true,missingDays:missing(),pending:planning.pending,retryAfter:planning.retryAfter,currentBatch:planning.currentBatch,planning}; }
    try {
      // Read inventory AFTER acquiring the global lease, never from a stale GET.
      c=await this.context(owner);
      const reserved=new Set(await this.repository.reservations(owner));
      let availableWordIds=c.availableWordIds.filter(id=>!reserved.has(id));
      // A legacy today's list is a soft reservation until atomically adopted.
      if(addDays(planning.startDate,next-1)!==c.date) { const oldToday=await this.repository.plan(owner,c.date); const legacyTodayIds=new Set(oldToday.plan?.wordIds ?? []); availableWordIds=availableWordIds.filter(id=>!legacyTodayIds.has(id)); }
      const date=addDays(planning.startDate,next-1);
      const legacy=await this.repository.plan(owner,date);
      let plan:Plan;
      if(legacy.plan) {
        const allowed=new Set(c.words.map(w=>w.id));const seen=new Set<string>();
        const groups=legacy.plan.groups.map(g=>({...g,wordIds:g.wordIds.filter(id=>allowed.has(id)&&!seen.has(id)&&(seen.add(id),true))})).filter(g=>g.wordIds.length);
        plan={...legacy.plan,date,groups,wordIds:groups.flatMap(g=>g.wordIds),notice:[legacy.plan.notice,'已保留原有整日列表；已学进度不变，仅未学且未预留词占用新词库存。'].filter(Boolean).join(' ')};
      } else {
        const input={words:c.words.map(enrichWordForPlanning),scenes:c.scenes,availableWordIds,selectionKey:date};
        let semantic;
        if(availableWordIds.length && this.planner.configured && this.planner.generateSemantic) {
          try {
            semantic=await this.planner.generateSemantic(input);
            // Validate again at the domain boundary; an adapter never controls memory/date.
            const validated=validateSemanticSelection(semantic,{availableWordIds,scenes:c.scenes});
            semantic={...semantic,...validated};
          } catch(error) {
            const failure=safeAIFailure(error);console.warn('[vocab-wheel] semantic fallback',JSON.stringify(failure));
            const fallback=runtimeFallback(input,c.range,date);
            semantic={...fallback.selection,aiFailure:failure,notice:`${aiFailureNotice(failure,fallback.kind)} ${fallback.selection.notice}`};
          }
        } else {
          semantic=runtimeFallback(input,c.range,date).selection;
          if(!this.planner.configured) semantic.notice=`未配置 DeepSeek 密钥 · ${semantic.notice}`;
          if(!availableWordIds.length && c.availableWordIds.length) { semantic.title='本日暂无待分配新词'; semantic.notice='其余新词已预留在其他日期；预取不代表已学，本日保留实际到期复习。'; }
        }
        plan={...semantic,date};
      }
      const committed=await this.repository.commitScheduled(owner,token,{date,dayIndex:next,plan,completedAt:null},plan.wordIds.filter(id=>availableWordIds.includes(id)));
      if(!committed) {
        await this.repository.releasePlanning(owner,token,true);
        planning=await this.planningState(owner);
        return {generatedDay:null,hasMore:true,missingDays:missing(),pending:false,retryAfter:this.now()+90_000,currentBatch:planning.currentBatch,planning,reason:'inventory_changed'};
      }
      planning=await this.planningState(owner);
      const missingDays=targetDays.filter(day=>planning.days.find(d=>d.day===day)?.status!=='ready');
      return {generatedDay:next,source:plan.source,hasMore:missingDays.length>0,missingDays,pending:false,currentBatch:planning.currentBatch,planning};
    } catch(error) {await this.repository.releasePlanning(owner,token,true);throw error;}
  }
  /** Difficulty operations are a separate durable stream, never learning grades. */
  async marksBatch(owner: string, value: unknown) {
    try {
      const operations=validateMarkOperations(value);
      const opIds=operations.map(op=>op.opId);const wordIds=[...new Set(operations.map(op=>op.wordId))];
      for(let attempt=0;attempt<8;attempt++) {
        const records=await this.repository.markRecords(owner,opIds);
        for(const op of operations) {
          const old=records.get(op.opId);
          if(old&&(old.wordId!==op.wordId||old.delta!==op.delta)) throw new HTTPError(409,'MARK_OPERATION_CONFLICT','同一标记操作 ID 不能用于不同单词或变化');
        }
        const pending=operations.filter(op=>!records.has(op.opId));
        const seedIds=new Set(this.seed.words.map(w=>w.id));
        const customNeeded=[...new Set(pending.filter(op=>!seedIds.has(op.wordId)).map(op=>op.wordId))];
        const customKnown=await this.repository.customWordIds(owner,customNeeded);
        if(customNeeded.some(id=>!customKnown.has(id))) throw new ValidationError('词库中没有标记操作里的单词');
        const current=await this.repository.marksMany(owner,wordIds);
        const prepared=prepareMarkOperations(current,pending,this.now());
        if(!pending.length||await this.repository.commitMarks(owner,pending,prepared)) {
          // Return newest versions, not an old operation's original snapshot.
          const latest=await this.repository.marksMany(owner,wordIds);
          return {marks:[...latest.values()],acknowledgedOpIds:opIds,appliedOpIds:pending.map(op=>op.opId),duplicateOpIds:operations.filter(op=>records.has(op.opId)).map(op=>op.opId)};
        }
      }
      throw new HTTPError(409,'MARKS_BUSY','另一个页面正在保存标记；请保留原操作 ID 重试，不要重新创建操作。');
    } catch(error) {
      if(error instanceof MarkSafetyError) throw new HTTPError(409,error.code,error.message);
      throw error;
    }
  }
  async reviewBatch(owner: string, value: unknown) {
    const x=object(value);
    if(typeof x.batchId!=='string'||!/^[A-Za-z0-9_-]{8,64}$/.test(x.batchId)) throw new ValidationError('批次 ID 无效');
    if(!isDateKey(x.day)) throw new ValidationError('批次学习日期无效');
    if(x.dayCompleted!==undefined && typeof x.dayCompleted!=='boolean') throw new ValidationError('完成标记应为布尔值');
    if(!Array.isArray(x.ratings)||x.ratings.length>200||(!x.ratings.length&&!x.dayCompleted)) throw new ValidationError('每批提交 1–200 个单词；空批次仅可确认整天完成');
    const seen=new Set<string>();
    const ratings=x.ratings.map((raw,index)=>{
      const r=object(raw);
      if(typeof r.wordId!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$/.test(r.wordId)||seen.has(r.wordId)) throw new ValidationError('单词 ID 无效或同批重复');
      if(!['remembered','fuzzy','forgot'].includes(r.grade as string)) throw new ValidationError('记忆评分无效');
      seen.add(r.wordId);
      const eventId=r.eventId ?? `b_${x.batchId}_${index}`;
      if(typeof eventId!=='string'||!/^[A-Za-z0-9_-]{8,100}$/.test(eventId)) throw new ValidationError('评分事件 ID 无效');
      return {wordId:r.wordId,grade:r.grade as Grade,eventId};
    });
    if(new Set(ratings.map(r=>r.eventId)).size!==ratings.length) throw new ValidationError('批次事件 ID 重复');
    const normalized={day:x.day,ratings,dayCompleted:x.dayCompleted===true};
    const payloadHash=await hashJSON(normalized);
    const existing=await this.repository.batchRecord(owner,x.batchId);
    if(existing) {
      if(existing.payloadHash!==payloadHash) throw new HTTPError(409,'BATCH_CONFLICT','同一批次 ID 不能用于不同评分');
      const latest=await this.repository.progressMany(owner,ratings.map(r=>r.wordId));
      return {...existing.result,progress:[...latest.values()].map(v=>v.progress),duplicate:true,completionIgnored:false,planning:await this.planningState(owner)};
    }
    const c=await this.context(owner);const actualDate=this.day();
    if(x.day>actualDate) throw new HTTPError(409,'FUTURE_DAY','未来计划仅可预览，不能提前写入未来日期的学习记录');
    const known=new Set(c.words.map(w=>w.id));
    if(ratings.some(r=>!known.has(r.wordId))) throw new ValidationError('词库中没有批次里的单词');
    const scheduled=(await this.repository.scheduled(owner)).find(d=>d.date===x.day);
    const completing=x.dayCompleted===true && x.day===actualDate;
    const planning=await this.planningState(owner,c);
    const reviewOnly=daysBetween(planning.startDate,x.day)+1>planning.horizonDays;
    if(completing&&!scheduled&&!reviewOnly) throw new HTTPError(409,'DAY_NOT_READY','请先生成今天的计划，再确认完成');
    for(let attempt=0;attempt<4;attempt++) {
      const replay=await this.repository.batchRecord(owner,x.batchId);
      if(replay) {
        if(replay.payloadHash!==payloadHash) throw new HTTPError(409,'BATCH_CONFLICT','同一批次 ID 不能用于不同评分');
        const latest=await this.repository.progressMany(owner,ratings.map(r=>r.wordId));
        return {...replay.result,progress:[...latest.values()].map(v=>v.progress),duplicate:true,completionIgnored:x.dayCompleted===true&&!completing,planning:await this.planningState(owner)};
      }
      const current=await this.repository.progressMany(owner,ratings.map(r=>r.wordId));
      const reviews:PreparedReview[]=ratings.map(r=>{const old=current.get(r.wordId)!;return {eventId:r.eventId,revision:old.revision,result:{wordId:r.wordId,grade:r.grade,...applyGrade(old.progress,r.grade,actualDate)}};});
      if(completing) {
        const fresh=await this.context(owner);const combined=new Map(fresh.progress.map(p=>[p.wordId,p]));
        reviews.forEach(r=>combined.set(r.result.wordId,r.result.progress));
        const required=uniqueDayWordIds(scheduled?.plan.wordIds ?? [],dueProgress(fresh.progress,actualDate).map(p=>p.wordId));
        if(required.some(id=>combined.get(id)?.lastExposureOn!==actualDate)) throw new HTTPError(409,'DAY_INCOMPLETE','还有未标记的单词，本次不会替你默认完成');
      }
      const result:BatchResult={date:actualDate,day:x.day,results:reviews.map(r=>r.result),progress:reviews.map(r=>r.result.progress),dayCompleted:completing};
      if(await this.repository.commitBatch(owner,x.batchId,payloadHash,reviews,result,completing?actualDate:undefined)) return {...result,duplicate:false,completionIgnored:x.dayCompleted===true&&!completing,planning:await this.planningState(owner)};
    }
    throw new HTTPError(409,'CONCURRENT_BATCH','另一个页面正在保存进度，批次尚未计入，请用原批次重试。');
  }
  async review(owner: string, value: unknown) {
    const x = object(value);
    if (typeof x.eventId !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(x.eventId)) throw new ValidationError('评分事件 ID 无效');
    if (typeof x.wordId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$/.test(x.wordId)) throw new ValidationError('单词 ID 无效');
    if (!['remembered','fuzzy','forgot'].includes(x.grade as string)) throw new ValidationError('记忆评分无效');
    const eventId = x.eventId; const wordId = x.wordId; const grade = x.grade as Grade;
    const c = await this.context(owner);
    if (!c.words.some(w => w.id === wordId)) throw new ValidationError('词库中没有这个单词');
    for (let attempt = 0; attempt < 4; attempt++) {
      const existing = await this.repository.event(owner, eventId);
      if (existing) {
        if (existing.wordId !== wordId || existing.grade !== grade) throw new HTTPError(409, 'EVENT_CONFLICT', '同一事件 ID 不能用于不同评分');
        const latest = await this.repository.progress(owner, wordId);
        return { ...existing, progress: latest.progress, duplicate: true, date: this.day() };
      }
      const current = await this.repository.progress(owner, wordId);
      const reviewDate = this.day();
      const transition = applyGrade(current.progress, grade, reviewDate);
      const result: EventResult = { wordId, grade, ...transition };
      if (await this.repository.commitReview(owner, eventId, current.revision, result)) return { ...result, duplicate: false, date: reviewDate };
    }
    throw new HTTPError(409, 'CONCURRENT_REVIEW', '另一个页面正在更新进度，请刷新后继续。');
  }
  async settings(owner: string, value: unknown) {
    await this.repository.load(owner, this.day());
    const settings = validateSettings(value);
    await this.repository.settings(owner, settings);
    await this.repository.planning(owner, this.day(), settings.horizonDays ?? 10, settings.pageSize ?? 0);
    await this.repository.configurePlanning(owner, settings.horizonDays ?? 10, settings.pageSize ?? 0);
    return { settings, planning: await this.planningState(owner) };
  }
  async export(owner: string) {
    const c = await this.context(owner);
    const saved = await this.repository.plan(owner, c.date);
    const planning=await this.planningState(owner,c);
    const reservationCount=(await this.repository.reservations(owner)).length;
    const todayScheduled=(await this.repository.scheduled(owner)).find(d=>d.date===c.date);
    const planningSummary={startDate:planning.startDate,horizonDays:planning.horizonDays,pageSize:planning.pageSize,days:planning.days,reservationCount};
    const marks=(await this.repository.marks(owner)).map(({wordId,hardCount})=>({wordId,hardCount}));
    const backup = { marks, planning: planningSummary, plan: todayScheduled?.plan ?? saved.plan, format: 'vocab-wheel-backup', schemaVersion: 3, exportedAt: new Date(this.now()).toISOString(), timezone: 'Asia/Shanghai', settings: c.settings, lexicon: c.lexicon, progress: c.progress, seed: { info: this.seed.info, wordCount: this.seed.words.length }, note: '备份包含用户导入词库、所有学习进度、手动难度计数与设置。计数快照合并恢复，不重放点击；版本与操作去重记录归服务器本地管理。plan、计划摘要与预留数量仅供参考；导入不覆盖当前冻结计划，未来页会按实际进度重新生成。内置词库随应用提供，无需重复导入。' };
    if (new TextEncoder().encode(JSON.stringify(backup)).byteLength > 8 * 1024 * 1024) throw new HTTPError(413, 'BACKUP_TOO_LARGE', '备份超过 8 MiB 上限，请先精简词库中的过长内容再导出。');
    return backup;
  }
  async import(owner: string, value: unknown) {
    const x = object(value); const c = await this.context(owner);
    if (x.kind === 'lexicon') {
      if (new TextEncoder().encode(JSON.stringify(x.data)).byteLength > 5 * 1024 * 1024) throw new HTTPError(413, 'PAYLOAD_TOO_LARGE', '单次词库导入不能超过 5 MiB');
      const input = object(x.data);
      const parsed = validateLexiconImport(input.lexicon ?? input,c.words.map(w=>w.id));
      const merged = this.mergeLexicon(c, parsed);
      await this.repository.mergeLexicon(owner, merged);
      return { imported: parsed.words.length, kind: 'lexicon', total: this.seed.words.length + merged.words.length };
    }
    if (x.kind === 'progress') {
      const raw = Array.isArray(x.data) ? x.data : object(x.data).progress;
      const progress = validateProgressImport(raw, c.words.map(w => w.id));
      this.assertNotFuture(progress, c.date);
      await this.repository.mergeProgress(owner, progress);
      return { imported: progress.length, kind: 'progress' };
    }
    if (x.kind === 'backup') {
      const data = object(x.data);
      if (data.format !== 'vocab-wheel-backup' || ![1,2,3].includes(data.schemaVersion as number)) throw new ValidationError('备份版本不受支持');
      const rawLexicon = object(data.lexicon);
      const parsed = Array.isArray(rawLexicon.words) && rawLexicon.words.length === 0 ? { words: [], scenes: [] } : validateLexiconImport(rawLexicon,c.words.map(w=>w.id));
      const merged = this.mergeLexicon(c, parsed);
      const progress = validateProgressImport(data.progress, [...this.seed.words, ...merged.words].map(w => w.id));
      const settings = validateSettings(data.settings);
      const marks=data.schemaVersion===3?validateMarkSnapshots(data.marks,[...this.seed.words,...merged.words].map(w=>w.id)):undefined;
      if(marks) { const current=await this.repository.marksMany(owner,marks.map(m=>m.wordId)); if([...current.values()].some(m=>m.revision>=Number.MAX_SAFE_INTEGER)) throw new HTTPError(409,'MARK_REVISION_OVERFLOW','标记版本已达到安全整数边界，本次备份未写入'); }
      this.assertNotFuture(progress, c.date);
      // Validate the entire packet before any write; all operations merge rather than delete.
      await this.repository.restore(owner, merged, progress, settings, marks);
      await this.repository.planning(owner,c.date,settings.horizonDays ?? 10,settings.pageSize ?? 0);
      await this.repository.configurePlanning(owner,settings.horizonDays ?? 10,settings.pageSize ?? 0);
      return { imported: progress.length, words: parsed.words.length, kind: 'backup' };
    }
    throw new ValidationError('请选择词库、进度或整包备份导入');
  }
  private assertNotFuture(progress: Progress[], day: string) {
    if (progress.some(p => [p.firstLearnedOn,p.lastExposureOn,p.lastReviewedOn].some(d => d && d > day))) throw new ValidationError('学习记录不能来自未来日期');
    if(progress.some(p=>p.nextDueOn && p.nextDueOn>addDays(day,366))) throw new ValidationError('下次复习时间不能超过一年；本应用按 1/3/7 天安排复习。');
  }
  private mergeLexicon(c: UserData, parsed: ImportedLexicon): ImportedLexicon {
    const seedWords = new Set(this.seed.words.map(w => w.id)); const seedScenes = new Set(this.seed.scenes.map(s => s.id));
    if (parsed.words.some(w => seedWords.has(w.id)) || parsed.scenes.some(s => seedScenes.has(s.id))) throw new ValidationError('导入 ID 与内置词库冲突，请为自定义词条/情境使用独立 ID（如 my- 前缀）');
    const words = new Map(c.lexicon.words.map(w => [w.id,w]));
    const scenes = new Map(c.lexicon.scenes.map(s => [s.id,s]));
    parsed.words.forEach(w => words.set(w.id, { ...w, source: w.source?.trim() || '用户导入 · 未提供原始来源/许可，请自行确认使用权' }));
    parsed.scenes.forEach(s => scenes.set(s.id,s));
    if (words.size > 10_000 || scenes.size > 1_000) throw new ValidationError('自定义词库最多 10000 个词条、1000 个情境');
    const merged = { words: [...words.values()], scenes: [...scenes.values()] };
    if (new TextEncoder().encode(JSON.stringify(merged)).byteLength > 3 * 1024 * 1024) throw new ValidationError('自定义词库总内容最多 3 MiB，请精简过长例句或来源字段');
    return merged;
  }
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ValidationError('请求应为 JSON 对象');
  return value as Record<string, unknown>;
}

async function hashJSON(value: unknown): Promise<string> { const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))); return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join(''); }
function annotationsFor(words:Word[]){return Object.fromEntries(words.filter(word=>Object.hasOwn(seedWordOverlays,word.id)).map(word=>[word.id,wordPresentation(word)]));}
/** A giant source wordlist is not a curated semantic task. Never call its first
 * 200 words an AI group or overwhelm the day when the provider is unavailable. */
function runtimeFallback(input:{words:Word[];scenes:Scene[];availableWordIds:string[]},range:NewWordRange,date:string){
 const selection=buildSemanticFallback(input);
 const ungrouped=selection.groups.some(group=>group.sceneId==='imported'||(input.scenes.find(scene=>scene.id===group.sceneId)?.wordIds.length??0)>200);
 if(!ungrouped)return{selection,kind:'curated' as const};
 const fallback=buildFallbackPlan({...input,range,date});
 return{kind:'inventory' as const,selection:{...fallback,title:fallback.wordIds.length?'词库练习片段':'当前优先复习',rationale:'按已有库存与当前时间参考区间顺序推进；这些词未经过 AI 语义分组。',notice:'当前为非 AI 语义分组的词库练习片段，不是 AI 生成任务。按时间参考区间分段，未选词保留库存。',groups:fallback.groups.map(group=>({...group,task:`非 AI 语义分组；${group.task}`}))}};
}

function dayReviewIds(progress: Progress[], date: string): string[] { const due=dueProgress(progress,date).map(p=>p.wordId); return [...new Set([...due,...progress.filter(p=>p.firstLearnedOn && p.firstLearnedOn<date && p.lastReviewedOn===date).map(p=>p.wordId)])]; }

function reviewOnlyPlan(date: string): Plan { return {date,source:'curated',title:'复习日',rationale:'新词计划期结束后，仍继续按首次实际学习日期的 1/3/7 天复习。',notice:'程序计算的复习日，非 AI 新词计划。',groups:[],wordIds:[]}; }
