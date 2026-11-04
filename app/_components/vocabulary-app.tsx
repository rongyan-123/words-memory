"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarCheck2, Check, ChevronDown, ChevronLeft, ChevronRight, Download, Eye, EyeOff, FileUp, LoaderCircle, Menu, RefreshCw, Search, Settings2, ShieldCheck, Volume2, X } from "lucide-react";
import type { Grade, Plan, Progress, Settings, Word, WordMark } from "../../src/core/index";
import { dateKey, isDateKey } from "../../src/core/index";
import { clearPendingBatch, loadPendingBatch, makeBatchPayload, persistPendingBatch, PENDING_BATCH_KEY, type BatchPayload } from "../../src/client/batch";
import { readLegacyDraft } from "../../src/client/legacy";
import { recordHardMark, recordFamiliar } from "../../src/client/actions";
import WordRow from "./word-row";
import { AUTOSAVE_KEY, ackPacket, commitAutosaveState, effectiveGrade, emptyAutosaveState, loadAutosaveState, mergeWordMarks, optimisticMarkCount, queueCompletion, queueGrade, queueMark, stageNextPacket, releaseRejectedCompletion, type AutosaveState } from "../../src/client/autosave";
import { csvScenes, parseLexiconCsv } from "../../src/client/import";
import { pronunciationInfo } from "../../src/data/pronunciations";
import { WHEEL_STUDY_HINT, WHEEL_REVIEW_HINT } from "../../src/client/study-instructions";
import { expansionInfo } from "../../src/data/lexicon-expansion";
import { createSpeechController, type SpeechState } from "../../src/client/speech";

type DaySummary = { day: number; date: string; status: string; completed?: boolean; newCount: number; source?: string };
type PlanningState = { startDate: string; horizonDays: number; calendarDays?: number; pageSize: number | null; currentDay: number; currentBatch: number[]; batchDays?: number[]; retryAfter?: number; horizonComplete?: boolean; days: DaySummary[]; pending: boolean };
type Bootstrap = { marks: WordMark[]; date: string; settings: Settings; planning: PlanningState; words: Word[]; progress: Progress[]; aiConfigured: boolean; lexiconCounts: {total:number;seed:number;imported:number;scenes:number}; lexiconCoverage?:{cet4:number;technical:number;overlap:number;computingCandidates:number}; inventory?:{reserved:number;unassigned:number;remainingUnlearned:number;notice:string};newWordRange?:{min:number;max:number;reason:string} };
type DayList = { marks: WordMark[]; day: number; date: string; isToday: boolean; isFuture: boolean; status: string; completed: boolean; plan: Plan | null; newWordIds: string[]; reviewWordIds: string[]; wordIds: string[]; words: Word[]; progress: Progress[]; reviewPreview: boolean; canRate: boolean; pageSize: number | null };
type TickResult = { generatedDay: number | null; hasMore: boolean; missingDays: number[]; pending: boolean; currentBatch: number[]; planning: PlanningState };
type ImportPacket = { kind: "lexicon" | "progress" | "backup"; data: unknown; count: number; words: number; name: string };
const gradeLabels = { remembered:"记住", fuzzy:"模糊", forgot:"忘记" };
const DRAFT_KEY = "vocab-wheel-batch-draft-v2";
class APIError extends Error {constructor(message:string,readonly status:number,readonly code:string){super(message);this.name='APIError';}}
async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/v1/${path}`, {...options,headers:{"Content-Type":"application/json",...options.headers}});
  const result: unknown = await response.json().catch(()=>({}));
  if (!response.ok) { const error=result&&typeof result==="object"&&"error"in result?(result as {error:unknown}).error:null; const code=result&&typeof result==="object"&&"code"in result&&typeof result.code==="string"?result.code:"REQUEST_FAILED";throw new APIError(typeof error==="string"?error:`请求失败（${response.status}）`,response.status,code); }
  return result as T;
}
function dateLabel(date: string) { return new Date(`${date}T12:00:00+08:00`).toLocaleDateString("zh-CN",{month:"numeric",day:"numeric",weekday:"short",timeZone:"Asia/Shanghai"}); }
function storage() { try { return window.localStorage; } catch { return null; } }
function dayForDate(date: string, startDate: string) { return Math.floor((Date.parse(`${date}T00:00:00Z`)-Date.parse(`${startDate}T00:00:00Z`))/86400000)+1; }

export default function VocabularyApp() {
  const [boot,setBoot]=useState<Bootstrap|null>(null);
  const [list,setList]=useState<DayList|null>(null);
  const [selectedDay,setSelectedDay]=useState(1);
  const [page,setPage]=useState(0);
  const [revealed,setRevealed]=useState<Set<string>>(new Set());
  const [grades,setGrades]=useState<Record<string,Grade>>({});
  const [autoState,setAutoState]=useState<AutosaveState>(emptyAutosaveState);
  const autoRef=useRef<AutosaveState>(emptyAutosaveState());
  const [marks,setMarks]=useState<WordMark[]>([]);const marksRef=useRef<WordMark[]>([]);
  const [canEdit,setCanEdit]=useState(false), [lockSupported,setLockSupported]=useState(true);
  const editOwner=useRef(false), releaseEditor=useRef<(()=>void)|null>(null);
  const [syncStatus,setSyncStatus]=useState<'saved'|'queued'|'saving'|'offline'>('saved');
  const [openRow,setOpenRow]=useState<{id:string;side:'left'|'right'}|null>(null);
  const syncError=useRef("");
  const syncPromise=useRef<Promise<boolean>|null>(null), syncTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const syncCallback=useRef<(background?:boolean)=>Promise<boolean>>(async()=>true), corruptKey=useRef(AUTOSAVE_KEY);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [toast,setToast]=useState("");
  const [speechState,setSpeechState]=useState<SpeechState>({phase:'idle'});
  const speakerRef=useRef<ReturnType<typeof createSpeechController>|null>(null);
  const [saving,setSaving]=useState(false);
  const [pending,setPending]=useState<BatchPayload|null>(null);
  const [journalError,setJournalError]=useState(false);const journalBlocked=useRef(false);
  const [planning,setPlanning]=useState(false);
  const [planningDay,setPlanningDay]=useState<number|null>(null);
  const [showSettings,setShowSettings]=useState(false);
  const [showDays,setShowDays]=useState(false);
  const [showSearch,setShowSearch]=useState(false);
  const [query,setQuery]=useState("");
  const [settings,setSettings]=useState<Settings|null>(null);
  const [settingsSaving,setSettingsSaving]=useState(false);
  const [newDay,setNewDay]=useState<number|null>(null);
  const [importPacket,setImportPacket]=useState<ImportPacket|null>(null);
  const [importing,setImporting]=useState(false);
  const [source,setSource]=useState("");
  const inputFile=useRef<HTMLInputElement>(null);
  const importKind=useRef<"lexicon"|"progress">("lexicon");
  const legacyActionDate=useRef<string|null>(null);
  const dayRef=useRef(1), listRef=useRef<DayList|null>(null), gradesRef=useRef<Record<string,Grade>>({}), pendingRef=useRef<BatchPayload|null>(null), pumpRef=useRef(false), savingRef=useRef(false), mounted=useRef(true);
  const requestRef=useRef(0), navigationRef=useRef(false), settingsOpenRef=useRef(false), settingsDirtyRef=useRef(false), interactionRef=useRef(0);
  const pollTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const pumpCallback=useRef<(day?:number)=>Promise<void>>(async()=>{});
  const explicitPlanningRef=useRef<number|null>(null), initializeRef=useRef<()=>Promise<void>>(async()=>{}), initializingRef=useRef(false);
  const ensureSpeaker=useCallback(()=>{
    if(!speakerRef.current){
      let synthesis:SpeechSynthesis|undefined;
      let makeUtterance:((text:string)=>SpeechSynthesisUtterance)|undefined;
      try{ synthesis=window.speechSynthesis;if(typeof window.SpeechSynthesisUtterance==='function')makeUtterance=text=>new window.SpeechSynthesisUtterance(text); }catch{/* Report unsupported speech on a deliberate click, never on page entry. */}
      speakerRef.current=createSpeechController({synthesis,makeUtterance,onState:state=>{if(!mounted.current)return;setSpeechState(state);if(state.phase==='error')setToast(state.message||'合成朗读未能启动，请检查浏览器与设备语音设置。');}});
    }
    return speakerRef.current;
  },[]);
  useEffect(()=>{
    const speaker=ensureSpeaker();
    const stop=()=>speaker.stop();const hidden=()=>{if(document.hidden)stop();};
    document.addEventListener('visibilitychange',hidden);window.addEventListener('pagehide',stop);
    return()=>{document.removeEventListener('visibilitychange',hidden);window.removeEventListener('pagehide',stop);speaker.destroy();if(speakerRef.current===speaker)speakerRef.current=null;};
  },[ensureSpeaker]);
  useEffect(()=>{dayRef.current=selectedDay;document.getElementById(`day-tab-${selectedDay}`)?.scrollIntoView({block:"nearest",inline:"center",behavior:"smooth"});},[selectedDay]);
  useEffect(()=>{settingsOpenRef.current=showSettings;},[showSettings]);
  useEffect(()=>{listRef.current=list;},[list]);
  useEffect(()=>{gradesRef.current=grades;},[grades]);
  useEffect(()=>{pendingRef.current=pending;},[pending]);
  useEffect(()=>{if(!toast)return;const timer=setTimeout(()=>setToast(""),4000);return()=>clearTimeout(timer);},[toast]);

  const applyPlanning=useCallback((state: PlanningState)=>{setBoot(old=>old?{...old,planning:state}:old);},[]);
  const getDay=useCallback(async(day: number,quiet=false)=>{
    if(quiet&&navigationRef.current)return false;
    if(day!==dayRef.current)speakerRef.current?.stop();
    const request=++requestRef.current;
    if(!quiet){navigationRef.current=true;setLoading(true);}
    try{const next=await api<DayList>(`day?day=${day}`);if(request===requestRef.current&&mounted.current){setList(next);listRef.current=next;const snapshots=mergeWordMarks(marksRef.current,next.marks||[]);marksRef.current=snapshots;setMarks(snapshots);setSelectedDay(day);dayRef.current=day;setError("");return true;}return false;}
    catch(e){if(request===requestRef.current)setError((e as Error).message);return false;}
    finally{if(request===requestRef.current){setLoading(false);navigationRef.current=false;}}
  },[]);
  const refresh=useCallback(async(quiet=true,replaceSettings=false)=>{
    const next=await api<Bootstrap>("bootstrap");setBoot(next);const snapshots=mergeWordMarks(marksRef.current,next.marks||[]);marksRef.current=snapshots;setMarks(snapshots);setSettings(current=>!current||replaceSettings||(!settingsOpenRef.current&&!settingsDirtyRef.current)?{...next.settings,horizonDays:next.planning.horizonDays,pageSize:next.planning.pageSize||0}:current);
    if(!quiet)await getDay(Math.min(Math.max(1,next.planning.currentDay),next.planning.calendarDays||Math.max(next.planning.horizonDays,next.planning.currentDay)));
    return next;
  },[getDay]);
  const schedulePlanningRead=useCallback((delay=5000)=>{
    if(pollTimer.current)clearTimeout(pollTimer.current);
    const read=async()=>{
      if(!mounted.current)return;
      try{
        const state=await api<PlanningState>("planning/status");applyPlanning(state);
        const selected=state.days.find(d=>d.day===dayRef.current);
        if(selected?.status==="ready"&&listRef.current?.status!=="ready"&&!Object.keys(gradesRef.current).length&&!pendingRef.current&&!autoRef.current.operations.length&&!navigationRef.current)await getDay(dayRef.current,true);
        const batch=state.batchDays||Array.from({length:Math.max(0,(state.currentBatch[1]||0)-(state.currentBatch[0]||1)+1)},(_,i)=>state.currentBatch[0]+i);
        const missing=batch.some(day=>state.days.find(d=>d.day===day)?.status!=="ready");
        if(state.pending||(state.retryAfter||0)>Date.now())pollTimer.current=setTimeout(read,Math.max(3000,Math.min(15000,(state.retryAfter||0)-Date.now())));
        else if(explicitPlanningRef.current!==null){
          const target=explicitPlanningRef.current;
          if(state.days.find(d=>d.day===target)?.status==="ready"){explicitPlanningRef.current=null;if(missing&&!state.horizonComplete)void pumpCallback.current();}
          else void pumpCallback.current(target);
        }else if(missing&&!state.horizonComplete)void pumpCallback.current();
      }catch{pollTimer.current=setTimeout(read,10000);}
    };
    pollTimer.current=setTimeout(read,delay);
  },[applyPlanning,getDay]);
  const pump=useCallback(async(explicitDay?:number)=>{
    if(explicitDay)explicitPlanningRef.current=explicitDay;
    if(pumpRef.current)return;
    pumpRef.current=true;setPlanning(true);setPlanningDay(explicitDay||null);
    try{
      // One HTTP request plans at most one day. Leases/cache prevent duplicate model calls.
      for(let generated=0;generated<(explicitDay?1:3);generated++){
        const result=await api<TickResult>("planning/tick",{method:"POST",body:JSON.stringify(explicitDay?{day:explicitDay}:{})});
        if(!mounted.current)break;
        applyPlanning(result.planning);
        if(result.generatedDay===dayRef.current&&!Object.keys(gradesRef.current).length&&!pendingRef.current&&!autoRef.current.operations.length)await getDay(dayRef.current,true);
        if(result.pending||(result.generatedDay===null&&result.hasMore)){schedulePlanningRead();break;}
        if(!result.hasMore||explicitDay){if(explicitDay&&!result.pending)explicitPlanningRef.current=null;if(explicitDay)schedulePlanningRead(100);break;}
      }
    }catch(e){if(mounted.current)setError((e as Error).message);}
    finally{pumpRef.current=false;if(mounted.current){setPlanning(false);setPlanningDay(null);}}
  },[applyPlanning,getDay,schedulePlanningRead]);
  pumpCallback.current=pump;
  const sendLegacyBatch=useCallback(async(payload:BatchPayload):Promise<boolean>=>{
    if(!editOwner.current||savingRef.current)return false;
    savingRef.current=true;setSaving(true);setError("");
    try{
      const result=await api<{progress:Progress[];planning?:PlanningState;duplicate?:boolean;dayCompleted?:boolean;day?:string}>("reviews/batch",{method:"POST",body:JSON.stringify(payload),keepalive:true,signal:AbortSignal.timeout(20000)});
      if(!editOwner.current)return false;
      const store=storage();if(store)clearPendingBatch(store,payload.batchId);
      setPending(null);pendingRef.current=null;
      const acknowledged=new Set(payload.ratings.map(r=>r.wordId));const remaining={...gradesRef.current};for(const id of acknowledged)delete remaining[id];setGrades(remaining);gradesRef.current=remaining;
      if(store){if(Object.keys(remaining).length)store.setItem(DRAFT_KEY,JSON.stringify({day:dayRef.current,date:dateKey(),ratings:remaining}));else store.removeItem(DRAFT_KEY);}
      setBoot(old=>old?{...old,progress:[...old.progress.filter(p=>!result.progress.some(n=>n.wordId===p.wordId)),...result.progress],...(result.planning?{planning:result.planning}:{})}:old);
      if(listRef.current){const updated={...listRef.current,...(result.dayCompleted&&result.day===listRef.current.date?{completed:true}:{}),progress:[...listRef.current.progress.filter(p=>!result.progress.some(n=>n.wordId===p.wordId)),...result.progress]};setList(updated);listRef.current=updated;}
      if(payload.dayCompleted)void pump();
      return true;
    }catch(e){setError(`${(e as Error).message}。这组评分已暂存，重试不会重复计数。`);return false;}
    finally{savingRef.current=false;setSaving(false);}
  },[pump]);
  const flushLegacy=useCallback(async(allVisible?:Word[],complete=false)=>{
    if(pendingRef.current&&!await sendLegacyBatch(pendingRef.current))return false;
    if(!allVisible&&!complete&&!Object.keys(gradesRef.current).length)return true;
    const current=listRef.current;if(!current||current.date>dateKey())return false;
    const rated={...gradesRef.current};
    if(allVisible)for(const w of allVisible){const p=current.progress.find(p=>p.wordId===w.id);if(!(p&&p.lastExposureOn===dateKey()&&p.exposuresToday>=3)&&!rated[w.id])rated[w.id]="remembered";}
    const ratings=Object.entries(rated).map(([wordId,grade])=>({wordId,grade}));
    if(!ratings.length&&!complete)return true;
    setGrades(rated);gradesRef.current=rated;
    const packets=Math.max(1,Math.ceil(ratings.length/200));
    for(let i=0;i<packets;i++){
      const payload=makeBatchPayload(current.date,ratings.slice(i*200,(i+1)*200),complete&&i===packets-1);
      try{const store=storage();if(!store)throw new Error("浏览器无法保存待同步队列，请允许本地存储后再保存");store.setItem(DRAFT_KEY,JSON.stringify({day:current.day,date:dateKey(),ratings:gradesRef.current}));persistPendingBatch(store,payload);}
      catch(e){setError((e as Error).message);return false;}
      setPending(payload);pendingRef.current=payload;
      if(!await sendLegacyBatch(payload))return false;
    }
    return true;
  },[sendLegacyBatch]);
  const acceptProgress=useCallback((result:{progress?:Progress[];planning?:PlanningState;dayCompleted?:boolean;day?:string})=>{
    const progress=result.progress||[];
    setBoot(old=>old?{...old,progress:[...old.progress.filter(p=>!progress.some(n=>n.wordId===p.wordId)),...progress],...(result.planning?{planning:result.planning}:{})}:old);
    if(listRef.current){const current={...listRef.current,...(result.dayCompleted&&result.day===listRef.current.date?{completed:true}:{}),progress:[...listRef.current.progress.filter(p=>!progress.some(n=>n.wordId===p.wordId)),...progress]};listRef.current=current;setList(current);}
  },[]);
  const syncNow=useCallback((background=false):Promise<boolean>=>{
    if(!editOwner.current||initializingRef.current)return Promise.resolve(false);
    if(journalBlocked.current){setSyncStatus('offline');return Promise.resolve(false);}
    if(syncPromise.current)return syncPromise.current;
    const work=(async()=>{
      try{
        if(!await flushLegacy()){setSyncStatus('offline');return false;}
        let sent=0;
        while(autoRef.current.operations.length){
          const store=storage();if(!store)throw new Error("浏览器无法持久保存待同步队列");
          const staged=stageNextPacket(autoRef.current);const current=commitAutosaveState(store,staged);autoRef.current=current;setAutoState(current);
          const packet=current.pending;if(!packet)break;
          setSyncStatus('saving');
          const result=await api<{marks?:WordMark[];acknowledgedOpIds?:string[];progress?:Progress[];planning?:PlanningState;dayCompleted?:boolean;day?:string}>(packet.path.replace('/api/v1/',''),{method:'POST',body:packet.body,keepalive:true,signal:AbortSignal.timeout(20000)});
          if(!editOwner.current)return false;
          const incoming=result.marks||[];
          const snapshots=mergeWordMarks(marksRef.current,incoming);marksRef.current=snapshots;setMarks(snapshots);
          const acknowledged=ackPacket(autoRef.current,packet.id,packet.kind==='marks'?result.acknowledgedOpIds:undefined,packet.kind==='marks'?snapshots:[]);
          const committed=commitAutosaveState(store,acknowledged);autoRef.current=committed;setAutoState(committed);acceptProgress(result);
          if(result.dayCompleted)void pump();
          sent++;if(background&&sent>=1)break;
        }
        setSyncStatus(autoRef.current.operations.length?'queued':'saved');if(!autoRef.current.operations.length&&syncError.current){const previous=syncError.current;syncError.current='';setError(current=>current===previous?'':current);}return autoRef.current.operations.length===0;
      }catch(e){
        if(e instanceof APIError&&e.code==='DAY_INCOMPLETE'&&editOwner.current){
          try{const store=storage();const pending=autoRef.current.pending;if(store&&pending){const next=commitAutosaveState(store,releaseRejectedCompletion(autoRef.current,pending.id));autoRef.current=next;setAutoState(next);setSyncStatus(next.operations.length?'queued':'saved');setError('当天复习列表有更新，尚未确认完成。原评分已保留，请补齐后再点完成今天。');void getDay(dayRef.current,true);if(next.operations.length)syncTimer.current=setTimeout(()=>void syncCallback.current(),900);return false;}}catch{/* preserve the original immutable packet if local storage fails */}
        }
        setSyncStatus('offline');syncError.current=`${(e as Error).message}。操作已留在本机队列，将自动重试；无需重新点标记。`;setError(syncError.current);return false;
      }
    })();
    syncPromise.current=work;void work.finally(()=>{syncPromise.current=null;});return work;
  },[flushLegacy,acceptProgress,pump,getDay]);
  syncCallback.current=syncNow;
  const stageAction=useCallback((update:(state:AutosaveState)=>AutosaveState)=>{
    if(!editOwner.current||journalError)return false;
    try{const store=storage();if(!store)throw new Error("本机存储不可用");const next=commitAutosaveState(store,update(autoRef.current));autoRef.current=next;setAutoState(next);setSyncStatus(navigator.onLine?'queued':'offline');
      if(syncTimer.current)clearTimeout(syncTimer.current);syncTimer.current=setTimeout(()=>void syncCallback.current(),900);return true;
    }catch(e){setError(`无法暂存这次操作，尚未记录：${(e as Error).message}`);return false;}
  },[journalError]);
  const flush=useCallback(async()=>syncNow(),[syncNow]);
  useEffect(()=>{
    if(!navigator.locks){setLockSupported(false);return;}
    const controller=new AbortController();
    void navigator.locks.request('vocab-wheel-edit-v5',{mode:'exclusive',signal:controller.signal},async()=>{
      editOwner.current=true;setCanEdit(false);void initializeRef.current();
      await new Promise<void>(resolve=>{releaseEditor.current=resolve;});
      editOwner.current=false;setCanEdit(false);
    }).catch(()=>{if(!controller.signal.aborted){setLockSupported(false);setCanEdit(false);}});
    const mirror=(event:StorageEvent)=>{if(editOwner.current||event.key!==AUTOSAVE_KEY)return;try{const store=storage();if(store){const state=loadAutosaveState(store);autoRef.current=state;setAutoState(state);}}catch{/* primary editor reports journal problems */}};
    window.addEventListener('storage',mirror);
    return()=>{editOwner.current=false;releaseEditor.current?.();releaseEditor.current=null;controller.abort();window.removeEventListener('storage',mirror);};
  },[]);
  useEffect(()=>{
    mounted.current=true;
    async function start(){
      if(initializingRef.current)return;initializingRef.current=true;setLoading(true);
      try{
        const next=await refresh();if(!mounted.current)return;
        let current=Math.min(Math.max(1,next.planning.currentDay),next.planning.calendarDays||Math.max(next.planning.horizonDays,next.planning.currentDay));
        const store=storage();
        try{const state=store?loadAutosaveState(store):emptyAutosaveState();autoRef.current=state;setAutoState(state);setSyncStatus(state.operations.length?'queued':'saved');}catch{corruptKey.current=AUTOSAVE_KEY;journalBlocked.current=true;setJournalError(true);setError("自动同步队列损坏，已保存的服务端数据不受影响；请先检查或重置本机队列。");}
        // Ownership can move between tabs: replace stale V4 caches even when keys disappeared.
        gradesRef.current={};setGrades({});pendingRef.current=null;setPending(null);legacyActionDate.current=null;
        let recovered:ReturnType<typeof loadPendingBatch>=null;
        try{recovered=store?loadPendingBatch(store):null;}catch{corruptKey.current=PENDING_BATCH_KEY;journalBlocked.current=true;setJournalError(true);setError("本地待同步队列损坏。服务端进度不受影响，请确认重置后继续。");}
        const draft=readLegacyDraft(store?.getItem(DRAFT_KEY)||null,next.words.map(w=>w.id),next.planning.calendarDays||Math.max(next.planning.horizonDays,next.planning.currentDay));
        gradesRef.current=draft.grades;setGrades(draft.grades);legacyActionDate.current=draft.actionDate;
        if(draft.day!==null){current=draft.day;if(current!==next.planning.currentDay)setNewDay(next.planning.currentDay);}
        dayRef.current=current;setSelectedDay(current);
        if(recovered){setPending(recovered.payload);pendingRef.current=recovered.payload;if(editOwner.current)await sendLegacyBatch(recovered.payload);}
        await getDay(current);
        if(mounted.current)void pump();
      }catch(e){setError((e as Error).message);setLoading(false);}
      finally{initializingRef.current=false;if(editOwner.current&&mounted.current){setCanEdit(true);syncTimer.current=setTimeout(()=>void syncCallback.current(),0);}}
    }
    initializeRef.current=start;
    void start();return()=>{mounted.current=false;if(pollTimer.current)clearTimeout(pollTimer.current);if(syncTimer.current)clearTimeout(syncTimer.current);};
  // Initialization deliberately runs once; all writes are idempotent journaled batches.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  useEffect(()=>{
    if(!boot)return;
    const check=async()=>{
      const today=dateKey();if(today===boot.date)return;
      try{const next=await refresh();const day=Math.min(Math.max(1,next.planning.currentDay),next.planning.calendarDays||Math.max(next.planning.horizonDays,next.planning.currentDay));if(Object.keys(gradesRef.current).length||pendingRef.current||autoRef.current.operations.length||savingRef.current||settingsOpenRef.current||showDays||showSearch||query||revealed.size||Date.now()-interactionRef.current<60000){setNewDay(day);return;}setRevealed(new Set());setPage(0);await getDay(day);void pump();}catch{/* keep current list during an interrupted rollover */}
    };
    const timer=setInterval(()=>void check(),60000);const visible=()=>{if(document.visibilityState==="visible")void check();};document.addEventListener("visibilitychange",visible);
    return()=>{clearInterval(timer);document.removeEventListener("visibilitychange",visible);};
  },[boot,getDay,refresh,pump,showSettings,showDays,showSearch,query,revealed]);
  useEffect(()=>{
    const before=(event:BeforeUnloadEvent)=>{if(Object.keys(gradesRef.current).length||pendingRef.current||autoRef.current.operations.length){void syncCallback.current(true);}};
    window.addEventListener("beforeunload",before);return()=>window.removeEventListener("beforeunload",before);
  },[]);
  useEffect(()=>{
    const retry=()=>void syncCallback.current();
    const visible=()=>void syncCallback.current(document.visibilityState==='hidden');
    const blur=()=>void syncCallback.current(true);
    const interval=setInterval(retry,60000);window.addEventListener('online',retry);window.addEventListener('blur',blur);window.addEventListener('pagehide',blur);document.addEventListener('visibilitychange',visible);
    return()=>{clearInterval(interval);window.removeEventListener('online',retry);window.removeEventListener('blur',blur);window.removeEventListener('pagehide',blur);document.removeEventListener('visibilitychange',visible);};
  },[]);
  const markMap=useMemo(()=>new Map(marks.map(mark=>[mark.wordId,mark])),[marks]);
  const progressMap=useMemo(()=>new Map((list?.progress||[]).map(p=>[p.wordId,p])),[list?.progress]);
  const words=list?.words||[];
  const filtered=useMemo(()=>query?words.filter(w=>`${w.term} ${w.meaning}`.toLowerCase().includes(query.toLowerCase())):words,[words,query]);
  const pageSize=boot?.planning.pageSize||0;
  const pages=pageSize?Math.max(1,Math.ceil(filtered.length/pageSize)):1;
  const safePage=Math.min(page,pages-1);
  const shown=pageSize?filtered.slice(safePage*pageSize,(safePage+1)*pageSize):filtered;
  const dirtyCount=Object.keys(grades).length;
  const completedToday=words.filter(w=>progressMap.get(w.id)?.lastExposureOn===dateKey()).length;
  const allToday=words.every(w=>progressMap.get(w.id)?.lastExposureOn===dateKey()||(legacyActionDate.current===dateKey()&&grades[w.id])||autoState.operations.some(op=>op.kind==='grade'&&op.wordId===w.id&&op.date===dateKey()));
  async function navigate(day:number){if(navigationRef.current||savingRef.current||!boot||day<1||day>(boot.planning.calendarDays||Math.max(boot.planning.horizonDays,boot.planning.currentDay)))return false;if(day===selectedDay){setShowDays(false);return true;}speakerRef.current?.stop();if(!await flush())return false;setShowDays(false);setRevealed(new Set());setGrades({});setQuery("");setPage(0);const ok=await getDay(day);window.scrollTo({top:0});return ok;}
  async function changePage(next:number){if(navigationRef.current||next<0||next>=pages)return;speakerRef.current?.stop();if(!await flush())return;setRevealed(new Set());setPage(next);window.scrollTo({top:0});}
  function mark(word:Word,delta:1|-1=1){
    if(!editOwner.current||navigationRef.current||journalError)return;
    const current=listRef.current;if(!current)return;const actualDate=dateKey();
    const base=marksRef.current.find(m=>m.wordId===word.id)||{wordId:word.id,hardCount:0,revision:0,updatedAt:0};
    const progress=current.progress.find(p=>p.wordId===word.id);const saved=progress?.lastExposureOn===actualDate?progress.lastGrade:null;
    const context={date:actualDate,canRate:current.date<=actualDate&&current.status==='ready',serverGrade:(legacyActionDate.current===actualDate?gradesRef.current[word.id]:null)||saved,exposuresToday:progress?.lastExposureOn===actualDate?progress.exposuresToday:0,base};
    stageAction(state=>recordHardMark(state,word.id,delta,context));
  }
  function familiar(word:Word){
    const current=listRef.current;if(!editOwner.current||!current||journalError||navigationRef.current)return;const actualDate=dateKey();
    const progress=current.progress.find(p=>p.wordId===word.id);const saved=progress?.lastExposureOn===actualDate?progress.lastGrade:null;
    const base=marksRef.current.find(m=>m.wordId===word.id)||{wordId:word.id,hardCount:0,revision:0,updatedAt:0};
    stageAction(state=>recordFamiliar(state,word.id,{date:actualDate,canRate:current.date<=actualDate&&current.status==='ready',serverGrade:(legacyActionDate.current===actualDate?gradesRef.current[word.id]:null)||saved,exposuresToday:progress?.lastExposureOn===actualDate?progress.exposuresToday:0,base}));
  }
  async function rememberPage(){const current=listRef.current;const actualDate=dateKey();if(!current||current.date>actualDate)return;const ok=stageAction(state=>{let next=state;for(const word of shown){const p=current.progress.find(p=>p.wordId===word.id);if(p&&p.lastExposureOn===actualDate&&p.exposuresToday>=3)continue;const saved=p?.lastExposureOn===actualDate?p.lastGrade:null;if(effectiveGrade(next,word.id,actualDate,(legacyActionDate.current===actualDate?gradesRef.current[word.id]:null)||saved)!=='remembered')next=queueGrade(next,word.id,'remembered',actualDate);}return next;});if(ok){setShowSettings(false);void syncNow();}}
  function completeDay(){const current=listRef.current;const actualDate=dateKey();if(!current||current.date!==actualDate)return;const ok=stageAction(state=>queueCompletion(state,actualDate));if(ok)void syncNow();}
  function reveal(id:string){setRevealed(old=>{const next=new Set(old);if(next.has(id))next.delete(id);else next.add(id);return next;});}
  function speak(word:Word){ensureSpeaker().speak({id:word.id,term:word.term});}
  async function saveSettings(event:React.FormEvent){
    event.preventDefault();if(!settings||settingsSaving)return;setSettingsSaving(true);
    try{
      if(!await flush())return;
      await api("settings",{method:"PUT",body:JSON.stringify(settings)});settingsDirtyRef.current=false;
      const next=await refresh(true,true);const end=next.planning.calendarDays||Math.max(next.planning.horizonDays,next.planning.currentDay);
      const day=Math.min(Math.max(1,dayRef.current),end);speakerRef.current?.stop();setPage(0);await getDay(day);setToast("设置已保存；已生成日期与记忆不会被删除。");void pump();
    }catch(e){setError((e as Error).message);}finally{setSettingsSaving(false);}
  }
  async function download(){try{const data=await api("export");const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:"application/json"}));const a=document.createElement("a");a.href=url;a.download=`词轮备份-${boot?.date}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){setError((e as Error).message);}}
  function chooseImport(kind:"lexicon"|"progress"){importKind.current=kind;inputFile.current?.click();}
  async function readImport(file?:File){if(!file)return;try{if(file.size>8*1024*1024)throw new Error("完整备份最多 8 MB");const text=(await file.text()).replace(/^\uFEFF/,"");let data:unknown;if(file.name.toLowerCase().endsWith(".csv")){if(importKind.current!=="lexicon")throw new Error("进度请导入 JSON 备份");const words=parseLexiconCsv(text);data={words,scenes:csvScenes(words)};}else data=JSON.parse(text);if(importKind.current==="lexicon"&&Array.isArray(data))data={words:data,scenes:[]};let p=data as {format?:string;words?:unknown[];progress?:unknown[];lexicon?:{words?:unknown[]}};const full=importKind.current==="progress"&&p.format==="vocab-wheel-backup";if(importKind.current==="lexicon"&&p.lexicon){data=p.lexicon;p=data as typeof p;}const count=importKind.current==="lexicon"?p.words?.length||0:p.progress?.length||0;if(!count&&!full)throw new Error("文件没有可导入的记录");setSource("");setImportPacket({kind:full?"backup":importKind.current,data,count,words:full?p.lexicon?.words?.length||0:0,name:file.name});}catch(e){setError((e as Error).message);}if(inputFile.current)inputFile.current.value="";}
  async function commitImport(){if(!importPacket)return;setImporting(true);try{if(!await flush())return;let data=importPacket.data;if(importPacket.kind==="lexicon"&&source.trim()){const p=data as {words:Word[]};data={...p,words:p.words.map(w=>({...w,source:w.source||source.trim()}))};}await api("import",{method:"POST",body:JSON.stringify({kind:importPacket.kind,data})});setImportPacket(null);const next=await refresh(true,true);await getDay(Math.min(dayRef.current,next.planning.calendarDays||Math.max(next.planning.horizonDays,next.planning.currentDay)),true);setToast("已合并导入；现有记忆与冻结日期计划不会被清空。");void pump();}catch(e){setError((e as Error).message);}finally{setImporting(false);}}
  const canSave=Boolean(canEdit&&list&&list.date<=dateKey()&&!journalError&&!loading);

  return <main className="word-app" onPointerDownCapture={()=>{interactionRef.current=Date.now();}} onKeyDownCapture={()=>{interactionRef.current=Date.now();}}>
    <header className="list-header"><button className="header-icon menu-button" aria-label="设置" onClick={()=>setShowSettings(true)}><Menu strokeWidth={2.1}/>{pending&&<i/>}</button>{showSearch?<div className="header-search"><Search size={19}/><input autoFocus value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}} placeholder="搜索本日单词" aria-label="搜索本日单词"/><button aria-label="关闭搜索" onClick={()=>{setShowSearch(false);setQuery("");}}><X size={19}/></button></div>:<><button className="header-icon day-arrow" aria-label="前一天" disabled={!boot||selectedDay<=1||saving||loading} onClick={()=>void navigate(selectedDay-1)}><ChevronLeft/></button><button className="day-title" onClick={()=>setShowDays(true)} aria-label="选择学习天数">Day {selectedDay}<ChevronDown size={19}/></button><button className="header-icon day-arrow" aria-label="后一天" disabled={!boot||selectedDay>=(boot.planning.calendarDays||Math.max(boot.planning.horizonDays,boot.planning.currentDay))||saving||loading} onClick={()=>void navigate(selectedDay+1)}><ChevronRight/></button><button className="header-icon" aria-label="搜索" onClick={()=>setShowSearch(true)}><Search/></button></>}</header>
    <div className="day-caption"><span className={`sync-indicator ${syncStatus}`} role="status">{syncStatus==='saving'?'同步中':syncStatus==='queued'?'已暂存':syncStatus==='offline'?'离线待同步':'已保存'}</span><span className="day-date">{list?dateLabel(list.date):""}</span><p className="wheel-tutorial">{WHEEL_STUDY_HINT} <span>{WHEEL_REVIEW_HINT}</span></p>{list?.status==="ready"||list?.status==="completed"?<span className="day-counts">{list.newWordIds.length} 新词{list.reviewWordIds.length?` · ${list.reviewWordIds.length} 复习`:""}{list.date>dateKey()?" · 预览，不计学习":""}</span>:<span className="day-counts"/>}<button onClick={()=>setRevealed(revealed.size?new Set():new Set(shown.map(w=>w.id)))} disabled={!shown.length} aria-label={revealed.size?"遮住本页中文":"显示本页中文"}>{revealed.size?<EyeOff size={15}/>:<Eye size={15}/>}</button></div>
    {boot&&!canEdit&&<div className="inline-message readonly-message" role="status"><span>{lockSupported?"另一个页面正在编辑，此页暂为只读；关闭原页面后会自动接续。":"此浏览器不支持安全编辑锁，当前仅可浏览。"}</span></div>}
    {error&&<div className="inline-message error" role="alert"><span>{error}</span><button aria-label="关闭提示" onClick={()=>setError("")}><X size={15}/></button></div>}
    {journalError&&<div className="inline-message error"><span>待同步队列不可读，已保存的服务端记录仍在。</span><button disabled={!canEdit} onClick={()=>{if(window.confirm("只清除本机损坏的待同步请求，不会删除服务端学习进度。是否继续？")){storage()?.removeItem(corruptKey.current);if(corruptKey.current===AUTOSAVE_KEY){const empty=emptyAutosaveState();autoRef.current=empty;setAutoState(empty);}journalBlocked.current=false;setJournalError(false);setError("");void initializeRef.current();}}}>重置待同步队列</button></div>}
    {pending&&<div className="inline-message pending" role="status"><span>{saving?"正在同步这一组…":"有一组评分待同步，确认前不能改变这组评分。"}</span><button onClick={()=>void sendLegacyBatch(pending)} disabled={saving}>{saving?<LoaderCircle size={14} className="spin"/>:<RefreshCw size={14}/>}重试</button></div>}
    {newDay&&<div className="inline-message"><span>新的一天到了，当前内容和选择已保留。</span><button onClick={()=>void(async()=>{if(await navigate(newDay))setNewDay(null);})()}>前往 Day {newDay}</button></div>}
    <section className="word-list" aria-label={`Day ${selectedDay} 单词列表`}>
      {loading?<div className="list-empty"><LoaderCircle className="spin" size={24}/><p>正在取回单词…</p></div>:!list?<div className="list-empty"><p>暂时没有连接到词库</p><button className="plain-button" onClick={()=>void initializeRef.current()}>重新连接</button><a href="/signin-with-chatgpt?return_to=%2F" target="_top">验证私人访问</a></div>:list.status==="missing"||list.status==="planning"||list.status==="error"?<div className="list-empty"><span className="empty-day">Day {selectedDay}</span><p>{planning||list.status==="planning"?"后台正在准备语义词组…":"这一天还未生成"}</p><small>{planning?"可以先学其他已生成的日期，无需停在这里。":"生成后会固定保存，不会与其他日期重复安排新词。"}</small><button className="plain-button" disabled={planning} onClick={()=>void pump(selectedDay)}>{planning?<LoaderCircle className="spin" size={17}/>:<RefreshCw size={17}/>} {planning?"请稍等":"生成这一天"}</button>{planningDay&&planningDay!==selectedDay&&<small>后台正在准备 Day {planningDay}</small>}</div>:!shown.length?<div className="list-empty"><p>{query?"没有找到这个单词":list.isFuture?"这一天暂无新词，复习会随真实学习记录加入。":"今天暂无待学单词"}</p><small>{query?"换个关键词试试。":"已学与已排单词由程序去重；预取不会提前标为学过。"}</small></div>:shown.map((word,index)=>{
        const p=progressMap.get(word.id);const saved=p&&p.lastExposureOn===dateKey()?p.lastGrade:null;
        const grade=effectiveGrade(autoState,word.id,dateKey(),(legacyActionDate.current===dateKey()?grades[word.id]:null)||saved);
        const hardCount=optimisticMarkCount(autoState,word.id,markMap.get(word.id)?.hardCount||0);
        return <WordRow key={word.id} word={word} index={safePage*(pageSize||filtered.length)+index+1} hardCount={hardCount} grade={grade} revealed={revealed.has(word.id)} openSide={openRow?.id===word.id?openRow.side:null} disabled={!canEdit||journalError||loading} canRemember={list.date<=dateKey()} speechPhase={speechState.wordId===word.id&&(speechState.phase==='starting'||speechState.phase==='speaking')?speechState.phase:null} onOpen={side=>setOpenRow(side?{id:word.id,side}:null)} onIncrement={()=>mark(word,1)} onDecrement={()=>mark(word,-1)} onFamiliar={()=>familiar(word)} onReveal={()=>reveal(word.id)} onSpeak={()=>speak(word)}/>;
      })}
    </section>
    {!loading&&list&&(list.status==="ready"||list.status==="completed")&&(pages>1||(list.date===dateKey()&&allToday&&!list.completed))&&<div className="group-controls compact-controls">
      {pages>1&&<div className="page-controls"><button aria-label="上一组" disabled={safePage===0} onClick={()=>void changePage(safePage-1)}><ChevronLeft size={15}/></button><span>{safePage+1} / {pages} 组</span><button aria-label="下一组" disabled={safePage+1>=pages} onClick={()=>void changePage(safePage+1)}><ChevronRight size={15}/></button></div>}
      {list.date===dateKey()&&allToday&&!list.completed&&<button className="finish-day" onClick={completeDay} disabled={journalError}>完成今天</button>}
    </div>}
    <footer className="day-footer"><div className="day-tabs" aria-label="学习日列表">{Array.from({length:boot?(boot.planning.calendarDays||Math.max(boot.planning.horizonDays,boot.planning.currentDay)):10},(_,i)=>i+1).map(day=>{const summary=boot?.planning.days.find(d=>d.day===day);return <button id={`day-tab-${day}`} key={day} className={day===selectedDay?"active":""} onClick={()=>void navigate(day)} aria-current={day===selectedDay?"page":undefined}>List{day}{summary?.status==="ready"?<i className={summary.completed?"done":""}/>:null}</button>;})}</div><button className="calendar-button" aria-label="打开日历" onClick={()=>setShowDays(true)}><CalendarCheck2/></button></footer>
    {toast&&<div className="toast" role="status">{toast}</div>}
    {showDays&&<div className="modal-shade" onClick={()=>setShowDays(false)}><section className="day-picker" role="dialog" aria-modal="true" aria-labelledby="choose-day" onClick={e=>e.stopPropagation()}><div className="sheet-title"><h2 id="choose-day">选择日期</h2><button onClick={()=>setShowDays(false)} aria-label="关闭日历"><X size={20}/></button></div><label className="calendar-input">日历<input type="date" value={list?.date||boot?.date||""} onChange={e=>{if(boot){const day=dayForDate(e.target.value,boot.planning.startDate);if(day>=1&&day<=(boot.planning.calendarDays||Math.max(boot.planning.horizonDays,boot.planning.currentDay)))void navigate(day);else setToast("这个日期不在当前计划内，可在设置中调整天数。");}}}/></label><div className="day-grid">{Array.from({length:boot?(boot.planning.calendarDays||Math.max(boot.planning.horizonDays,boot.planning.currentDay)):10},(_,i)=>i+1).map(day=>{const summary=boot?.planning.days.find(s=>s.day===day);return <button key={day} className={day===selectedDay?"active":""} onClick={()=>void navigate(day)}><b>Day {day}</b><small>{summary?.date?.slice(5).replace("-","/")||""}</small><span>{summary?.completed?"已完成":summary?.status==="ready"?`${summary.newCount} 新词`:"未生成"}</span></button>;})}</div><p>按北京时间每天进入对应的一页。只提前准备当前 3 天，不会一次生成全部计划。</p></section></div>}
    {showSettings&&<div className="drawer-shade" onClick={()=>setShowSettings(false)}><aside className="settings-drawer" role="dialog" aria-modal="true" aria-labelledby="settings-title" onClick={e=>e.stopPropagation()}><div className="sheet-title"><h2 id="settings-title"><Settings2 size={19}/>设置</h2><button onClick={()=>setShowSettings(false)} aria-label="关闭设置"><X size={22}/></button></div><form onSubmit={saveSettings} className="settings-form"><label>新词计划天数<input type="number" min="1" max="365" required disabled={settingsSaving} value={settings?.horizonDays??10} onChange={e=>{settingsDirtyRef.current=true;setSettings(old=>old?{...old,horizonDays:Number(e.target.value)}:old);}}/></label><label>每页数量<input type="number" min="0" max="200" step="1" required disabled={settingsSaving} value={settings?.pageSize??0} onChange={e=>{settingsDirtyRef.current=true;setSettings(old=>old?{...old,pageSize:Number(e.target.value)}:old);}}/></label><p>0 = 一天全部；1–200 可自由设置。每页数量只改变显示，不改变 AI 选择的词数。已经生成的日期固定保存，不因设置变化重排；新词计划结束后仍会进入当天的复习页。</p><button className="plain-button" disabled={settingsSaving}>{settingsSaving?<LoaderCircle className="spin" size={15}/>:<Check size={15}/>}保存设置</button></form><div className="settings-section"><h3>这一页</h3><button onClick={()=>void rememberPage()} disabled={!canSave}><Check size={17}/>本页都已记住</button><button onClick={()=>void syncNow()}><RefreshCw size={17}/>立即同步</button><button onClick={()=>{setRevealed(new Set(shown.map(w=>w.id)));setShowSettings(false);}}><Eye size={17}/>显示本页中文</button><button onClick={()=>{setRevealed(new Set());setShowSettings(false);}}><EyeOff size={17}/>遮住全部中文</button><p>点编号：难词 +1，颜色逐次加深；可学习页面同时记录一次“忘记”，连续点只累计难度。右滑减一次，左滑“熟知”记录记住但不清除难度历史。操作立即暂存，短延时合并同步，每分钟兜底重试；仅揭晓/滚动不改变评分。</p></div><div className="settings-section"><h3>词库与备份</h3><span className="lexicon-count">当前 {boot?.lexiconCounts.total||0} 词 · 内置 {boot?.lexiconCounts.seed||0} · 导入 {boot?.lexiconCounts.imported||0}</span>{boot?.lexiconCoverage&&<p className="lexicon-count-detail">CET4 标签 {boot.lexiconCoverage.cet4} · 技术场景 {boot.lexiconCoverage.technical} · 交集 {boot.lexiconCoverage.overlap}。词典 [计] 义候选 {boot.lexiconCoverage.computingCandidates}（不是已核实的现代云计算分类）。</p>}{boot?.inventory&&<p>当前 {boot.planning.horizonDays} 天是排期长度，不代表把 {boot.lexiconCounts.total} 词全背完；已预留 {boot.inventory.reserved} 词（不等于已学），尚未分配 {boot.inventory.unassigned} 词。已生成页面不因扩库重排。{boot.newWordRange&&<>按当前时间与复习负载，新词参考 {boot.newWordRange.min}–{boot.newWordRange.max} 个；实际在语义组边界浮动。{boot.newWordRange.reason}</>}</p>}<button onClick={()=>chooseImport("lexicon")}><FileUp size={17}/>导入 JSON / CSV 词库</button><button onClick={()=>chooseImport("progress")}><RefreshCw size={17}/>恢复进度 / 完整备份</button><button onClick={()=>void download()}><Download size={17}/>导出备份</button><details><summary>词库格式与来源</summary><p>内置为 224 个原创英汉词条、16 个真实场景，CC0；不是完整或官方四级词表。可导入自有授权词库。</p><p>扩展包含 {expansionInfo.cet4Words} 个去重后的 ECDICT CET4 学习词（原始来源成员 {expansionInfo.rawCet4Members}），与原词交集 {expansionInfo.seedCet4Overlap}；另有 CNCF 术语选词和原创技术简释。四级标记是来源词库的第三方标签，不冒称官方完整考纲。AI 在每天准备新页面时按语义选 ID，并非已为全库完成语义分类。</p><p>ECDICT 仓库声明 MIT，但混合上游数据权利未完整核验，本项目供个人试用；CNCF 只取术语名和链接，中文简释原创。原有技术例句义与新增通用义分开显示，不用技术义替代四级日常含义。</p><div className="lexicon-source-links"><a href={expansionInfo.sourceUrl} target="_blank" rel="noreferrer">ECDICT 固定来源</a><a href={expansionInfo.licenseUrl} target="_blank" rel="noreferrer">许可与来源边界</a><a href={expansionInfo.cncfSourceUrl} target="_blank" rel="noreferrer">CNCF 术语</a><a href="/lexicons/import-manifest.json" target="_blank" rel="noreferrer">导入清单</a></div><p>CSV 至少 term,meaning；可选 id,phonetic,example,exampleZh,tags,sceneIds,source。标签/场景用 | 分隔。JSON 使用 words 与 scenes 数组。请保留来源并确认使用权。</p><p className="pronunciation-source">音标为独立展示补充：{pronunciationInfo.coveredCount}/{pronunciationInfo.seedWordCount} 个内置词有可追溯美式 IPA，来自 <a href={pronunciationInfo.sourceUrl} target="_blank" rel="noreferrer">ipa-dict / CMUdict</a>（<a href={pronunciationInfo.licenseUrl} target="_blank" rel="noreferrer">许可与归属</a>），不是原创 CC0 释义的一部分。导入词库自己的音标优先。点单词、音标或小喇叭使用浏览器合成朗读；+N 只查看其他词典读法，不播放、不切换声音。合成声线由设备决定，不保证把每个音标变体逐项读出（如名词/动词异读）。语音 API 报错或播放未启动时会提示；系统静音或音量太低无法自动检测，请同时检查设备音量、播放权限和英语语音包。尚缺：{pronunciationInfo.missingTerms.join("、")}，不猜音标。点击单词使用浏览器合成朗读，不是词典录音。</p><p>自定义词库累计 3MB / 10000 词；完整备份最多 8MB。恢复会合并词库、进度和设置，不删除未列出的记录；相同 ID 进度与难词次数采用备份值。已生成日期计划保留，不冒认备份里的 AI 来源。浏览器仅留未同步队列，进度保存在服务端 D1（SQLite）。</p></details></div><details className="settings-section plan-details"><summary>计划与记忆规则</summary><p>AI 只挑选语义相关词，程序负责库存、已排预留与日期。后台先准备 1–3 天，第 3 天完成后再准备 4–6 天。预取不会提前算学过。</p><p>复习按真实初学后的第 1 / 3 / 7 天加入并去重。每词每天最多 3 次，逾期不在一天跳完多个阶段。旧词排在当天新词后，默认同一页；分页只改变显示，整天的新词与到期复习全部明确评分后才可确认完成。</p><p>{list?.plan?.notice||""}</p><p>DeepSeek Flash · low · 不设人为输出 token 预算。{boot?.aiConfigured?"服务端已配置。":"未配置密钥时用明确标记的精选场景。"}</p><button onClick={()=>void pump()} disabled={planning}>{planning?<LoaderCircle className="spin" size={15}/>:<RefreshCw size={15}/>}补齐当前 3 天</button></details><div className="settings-private"><ShieldCheck size={13}/>Cloudflare D1（SQLite）服务端持久保存</div></aside></div>}
    {importPacket&&<div className="modal-shade"><section className="import-dialog" role="dialog" aria-modal="true" aria-labelledby="import-title"><div className="sheet-title"><h2 id="import-title">确认导入</h2><button disabled={importing} onClick={()=>setImportPacket(null)} aria-label="取消导入"><X size={20}/></button></div><p>{importPacket.name}</p><p>{importPacket.count} 条{importPacket.kind==="lexicon"?"词条":"学习记录"}{importPacket.kind==="backup"?`，另有 ${importPacket.words} 个自定义词。会恢复备份设置，相同 ID 采用备份进度；现有冻结计划保留。`:"，将合并至当前词库。"}</p>{importPacket.kind==="lexicon"&&<label>补全来源 / 授权说明<input value={source} onChange={e=>setSource(e.target.value)} maxLength={500}/></label>}<p className="fine-print">请确认有权使用这些内容。建议先导出当前备份。</p><div className="dialog-actions"><button className="plain-button" disabled={importing} onClick={()=>setImportPacket(null)}>取消</button><button className="plain-button dark" disabled={importing} onClick={()=>void commitImport()}>{importing?<LoaderCircle size={15} className="spin"/>:<Check size={15}/>}确认导入</button></div></section></div>}
    <input type="file" ref={inputFile} accept=".json,.csv,application/json,text/csv" className="sr-only" aria-label="选择词库或备份文件" onChange={e=>void readImport(e.target.files?.[0])}/>
  </main>;
}
