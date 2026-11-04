import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpeechController, type SpeechController, type SpeechState } from '../src/client/speech.ts';

function voice(lang:string,localService=true,name=lang):SpeechSynthesisVoice {return {lang,localService,name,default:false,voiceURI:name} as SpeechSynthesisVoice;}
function utterance(text:string):SpeechSynthesisUtterance {return {text,lang:'',voice:null,volume:0,rate:1,pitch:1,onstart:null,onend:null,onerror:null} as unknown as SpeechSynthesisUtterance;}
function start(u:SpeechSynthesisUtterance){u.onstart?.call(u,{} as SpeechSynthesisEvent);}
function end(u:SpeechSynthesisUtterance){u.onend?.call(u,{} as SpeechSynthesisEvent);}
function error(u:SpeechSynthesisUtterance,code:string){u.onerror?.call(u,{error:code} as SpeechSynthesisErrorEvent);}
class Timers {
 now=0;next=1;jobs=new Map<number,{at:number;run:()=>void}>();delays:number[]=[];
 set=(run:()=>void,delay:number)=>{const id=this.next++;this.delays.push(delay);this.jobs.set(id,{at:this.now+delay,run});return id;};
 clear=(id:unknown)=>{this.jobs.delete(id as number);};
 advance(ms:number){this.now+=ms;for(let i=0;i<100;i++){const next=[...this.jobs.entries()].filter(([,v])=>v.at<=this.now).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;this.jobs.delete(next[0]);next[1].run();}}
}
class Engine {
 voices:SpeechSynthesisVoice[]=[voice('en-US')];paused=false;spoken:SpeechSynthesisUtterance[]=[];cancelCount=0;resumeCount=0;events:string[]=[];listeners=new Set<()=>void>();removed=0;
 throwVoices=false;throwSpeak=false;throwResume=false;throwCancel=false;onCancel:(()=>void)|null=null;onSpeak:((u:SpeechSynthesisUtterance)=>void)|null=null;
 getVoices(){if(this.throwVoices)throw new Error('voices failed');return this.voices;}
 addEventListener(_type:string,listener:()=>void){this.listeners.add(listener);}
 removeEventListener(_type:string,listener:()=>void){if(this.listeners.delete(listener))this.removed++;}
 changed(){for(const listener of [...this.listeners])listener();}
 cancel(){this.events.push('cancel');this.cancelCount++;this.onCancel?.();if(this.throwCancel)throw new Error('cancel failed');}
 resume(){this.events.push('resume');this.resumeCount++;if(this.throwResume)throw new Error('resume failed');this.paused=false;}
 speak(u:SpeechSynthesisUtterance){this.events.push('speak');this.spoken.push(u);if(this.throwSpeak)throw new Error('speak failed');this.onSpeak?.(u);}
}
const WORD={id:'w-server',term:'server'};
function fixture(engine=new Engine(),overrides:Partial<Parameters<typeof createSpeechController>[0]>={}){
 const states:SpeechState[]=[];const timers=new Timers();const made:SpeechSynthesisUtterance[]=[];
 const controller=createSpeechController({synthesis:engine as unknown as SpeechSynthesis,makeUtterance:text=>{const u=utterance(text);made.push(u);return u;},onState:s=>states.push(s),setTimer:timers.set,clearTimer:timers.clear,...overrides});
 return {engine,states,timers,made,controller,last:()=>states.at(-1)!};
}

test('server-safe import and missing APIs give useful feedback only after a click',()=>{
 for(const mode of ['engine','constructor'] as const){const s=fixture(new Engine(),mode==='engine'?{synthesis:null}:{makeUtterance:undefined});assert.deepEqual(s.states,[]);s.controller.speak(WORD);assert.equal(s.last().phase,'error');assert.match(s.last().message!,/浏览器|朗读/);assert.equal(s.engine.spoken.length,0);assert.equal(s.timers.jobs.size,0);s.controller.destroy();}
});
test('plain word text and explicit English voice are used, with no success before onstart',()=>{
 const e=new Engine();e.voices=[voice('zh-CN'),voice('en-GB'),voice('en-US',false,'remote-us'),voice('en-US',true,'local-us')];const s=fixture(e);
 s.controller.speak({id:'w-cloud',term:'  cloud-native  '});const u=e.spoken[0];assert.equal(u.text,'cloud-native');assert.equal(u.voice!.name,'local-us');assert.equal(u.lang,'en-US');assert.equal(u.volume,1);assert.equal(u.rate,0.85);assert.equal(s.last().phase,'starting');assert.equal(s.last().voiceLang,'en-US');assert.equal(s.timers.jobs.size,1);
 start(u);assert.equal(s.last().phase,'speaking');assert.equal(s.timers.jobs.size,0);s.timers.advance(20_000);assert.equal(s.last().phase,'speaking');end(u);assert.equal(s.last().phase,'idle');assert.equal(u.onstart,null);assert.equal(u.onend,null);assert.equal(u.onerror,null);s.controller.destroy();assert.equal(e.cancelCount,0);
});
test('US preference precedes other English voices; other English works and Chinese-only never speaks',()=>{
 const e=new Engine();e.voices=[voice('zh-CN'),voice('en-GB'),voice('en_US',false)];const s=fixture(e);s.controller.speak(WORD);assert.equal(e.spoken[0].voice!.lang,'en_US');assert.equal(e.spoken[0].lang,'en-US');s.controller.stop();e.voices=[voice('zh-CN'),voice('en-GB')];s.controller.speak(WORD);assert.equal(e.spoken.at(-1)!.voice!.lang,'en-GB');s.controller.stop();e.voices=[voice('zh-CN')];const count=e.spoken.length;s.controller.speak(WORD);assert.equal(e.spoken.length,count);assert.equal(s.last().phase,'error');assert.match(s.last().message!,/没有英文语音/);s.controller.destroy();
});
test('initially empty voices are not declared unavailable, and late English voices work on retry',()=>{
 const e=new Engine();e.voices=[];const s=fixture(e);s.controller.speak(WORD);assert.equal(s.last().phase,'starting');assert.equal(e.spoken[0].voice,null);assert.equal(e.spoken[0].lang,'en-US');
 e.voices=[voice('en-US')];e.changed();assert.equal(s.last().phase,'starting');assert.equal(e.spoken.length,1,'voiceschanged must not asynchronously replay or lose user activation');s.controller.speak(WORD);assert.equal(e.spoken.length,2);assert.equal(e.spoken[1].voice!.lang,'en-US');s.controller.destroy();
});
test('late nonempty Chinese-only voices cancel an unknown pending voice instead of substituting Chinese',()=>{
 const e=new Engine();e.voices=[];const s=fixture(e);s.controller.speak(WORD);e.voices=[voice('zh-CN')];e.changed();assert.equal(s.last().phase,'error');assert.match(s.last().message!,/不会改用中文/);assert.equal(e.cancelCount,1);assert.equal(s.timers.jobs.size,0);s.controller.destroy();
});
test('a silent engine triggers the start watchdog, never a false speaking/success state',()=>{
 const s=fixture();s.controller.speak(WORD);assert.deepEqual(s.states.map(v=>v.phase),['starting']);assert.equal(s.timers.delays[0],10_000);s.timers.advance(9999);assert.equal(s.last().phase,'starting');s.timers.advance(1);assert.equal(s.last().phase,'error');assert.match(s.last().message!,/没有启动朗读/);assert.equal(s.engine.cancelCount,1);assert.equal(s.timers.jobs.size,0);s.controller.destroy();
});
test('onend without an onstart report is an honest error, not silent success',()=>{
 const s=fixture();s.controller.speak(WORD);end(s.engine.spoken[0]);assert.equal(s.last().phase,'error');assert.match(s.last().message!,/未收到朗读启动确认/);assert.equal(s.timers.jobs.size,0);const length=s.states.length;s.timers.advance(20_000);assert.equal(s.states.length,length);s.controller.destroy();
});
test('rapid repeated clicks cancel old speech before queuing new, and late old callbacks cannot overwrite state',()=>{
 const s=fixture();s.controller.speak(WORD);const old=s.engine.spoken[0];const stale={start:old.onstart!,end:old.onend!,error:old.onerror!};s.engine.onCancel=()=>stale.error.call(old,{error:'interrupted'} as SpeechSynthesisErrorEvent);
 s.controller.speak({id:'w-gpu',term:'GPU'});assert.deepEqual(s.engine.events,['speak','cancel','speak']);assert.equal(s.last().wordId,'w-gpu');const length=s.states.length;stale.start.call(old,{} as SpeechSynthesisEvent);stale.end.call(old,{} as SpeechSynthesisEvent);stale.error.call(old,{error:'canceled'} as SpeechSynthesisErrorEvent);assert.equal(s.states.length,length);assert.equal(s.last().phase,'starting');
 start(s.engine.spoken[1]);assert.equal(s.last().phase,'speaking');assert.equal(s.last().wordId,'w-gpu');s.controller.speak({id:'w-gpu',term:'GPU'});assert.equal(s.engine.spoken.length,3);assert.equal(s.last().phase,'starting');s.controller.destroy();
});
test('a paused engine is resumed before the new utterance is submitted',()=>{
 const e=new Engine();e.paused=true;const s=fixture(e);s.controller.speak(WORD);assert.deepEqual(e.events,['resume','speak']);assert.equal(e.paused,false);assert.equal(s.last().phase,'starting');s.controller.destroy();
});
test('constructor, voice-list, speak and resume exceptions become feedback and release watchdogs',()=>{
 const constructor=fixture(new Engine(),{makeUtterance:()=>{throw new Error('constructor');}});assert.deepEqual(constructor.states,[]);constructor.controller.speak(WORD);assert.match(constructor.last().message!,/创建/);assert.equal(constructor.engine.spoken.length,0);constructor.controller.destroy();
 const e=new Engine();e.throwVoices=true;const unavailable=fixture(e);assert.deepEqual(unavailable.states,[]);unavailable.controller.speak(WORD);assert.match(unavailable.last().message!,/语音列表/);unavailable.controller.destroy();
 for(const kind of ['speak','resume'] as const){const engine=new Engine();engine.throwSpeak=kind==='speak';engine.paused=kind==='resume';engine.throwResume=kind==='resume';const s=fixture(engine);s.controller.speak(WORD);assert.equal(s.last().phase,'error');assert.equal(s.timers.jobs.size,0);assert.equal(engine.cancelCount,kind==='speak'?1:0);s.controller.destroy();}
});
test('engine error codes are useful Chinese feedback, not thrown or copied opaque messages',()=>{
 for(const [code,pattern] of [['not-allowed',/阻止/],['audio-busy',/占用/],['audio-hardware',/音频输出/],['network',/连接失败/],['synthesis-unavailable',/语音合成服务/],['language-unavailable',/英文语音/],['voice-unavailable',/英文语音/],['canceled',/取消/],['interrupted',/打断/],['text-too-long',/长度/],['invalid-argument',/参数/],['synthesis-failed',/合成失败/],['future-code',/合成失败/]] as const){const s=fixture();s.controller.speak(WORD);error(s.engine.spoken[0],code);assert.equal(s.last().phase,'error');assert.match(s.last().message!,pattern);assert.equal(s.timers.jobs.size,0);s.controller.destroy();}
});
test('stop cancels only this controller active submission and clears callbacks and timers',()=>{
 const s=fixture();s.controller.stop();assert.equal(s.engine.cancelCount,0);s.controller.speak(WORD);const old=s.engine.spoken[0],stale=old.onstart!;s.controller.stop();assert.equal(s.engine.cancelCount,1);assert.equal(s.last().phase,'idle');assert.equal(s.timers.jobs.size,0);assert.equal(old.onstart,null);assert.equal(old.onerror,null);const length=s.states.length;stale.call(old,{} as SpeechSynthesisEvent);s.timers.advance(20_000);assert.equal(s.states.length,length);s.controller.stop();assert.equal(s.engine.cancelCount,1);s.controller.destroy();
});
test('destroy removes listeners, cancels active speech and never calls state after unmount',()=>{
 const s=fixture();assert.equal(s.engine.listeners.size,1);s.controller.speak(WORD);const u=s.engine.spoken[0];const stale=[u.onstart!,u.onend!,u.onerror!] as const;const oldListener=[...s.engine.listeners][0];const length=s.states.length;s.controller.destroy();assert.equal(s.engine.cancelCount,1);assert.equal(s.engine.listeners.size,0);assert.equal(s.engine.removed,1);assert.equal(s.timers.jobs.size,0);stale[0].call(u,{} as SpeechSynthesisEvent);stale[1].call(u,{} as SpeechSynthesisEvent);stale[2].call(u,{error:'audio-hardware'} as SpeechSynthesisErrorEvent);oldListener();s.timers.advance(20_000);s.controller.speak(WORD);s.controller.stop();s.controller.destroy();assert.equal(s.states.length,length);assert.equal(s.engine.spoken.length,1);
 const idle=fixture();idle.controller.destroy();assert.equal(idle.engine.cancelCount,0);assert.deepEqual(idle.states,[]);
});
test('stop/replacement cancellation failures are handled and no new utterance overlaps the old one',()=>{
 const e=new Engine();const s=fixture(e);s.controller.speak(WORD);e.throwCancel=true;s.controller.speak({id:'other-word',term:'other'});assert.equal(s.last().phase,'error');assert.match(s.last().message!,/停止上一次/);assert.equal(e.spoken.length,1);assert.equal(s.timers.jobs.size,0);s.controller.destroy();
});
test('stop triggered by starting-state observer prevents submission rather than queuing after cancellation',()=>{
 const engine=new Engine(),timers=new Timers();const states:SpeechState[]=[];let controller!:SpeechController;
 controller=createSpeechController({synthesis:engine as unknown as SpeechSynthesis,makeUtterance:utterance,setTimer:timers.set,clearTimer:timers.clear,onState:s=>{states.push(s);if(s.phase==='starting')controller.stop();}});
 controller.speak(WORD);assert.deepEqual(states.map(s=>s.phase),['starting','idle']);assert.equal(engine.spoken.length,0);assert.equal(engine.cancelCount,0);assert.equal(timers.jobs.size,0);controller.destroy();
});

test('a one-time cancellation failure must be retried successfully before the next utterance',()=>{
 const s=fixture();s.controller.speak(WORD);const old=s.engine.spoken[0],oldEnd=old.onend!;s.engine.throwCancel=true;s.controller.speak({id:'second-word',term:'second'});assert.equal(s.engine.cancelCount,1);assert.equal(s.engine.spoken.length,1);assert.equal(s.last().phase,'error');
 oldEnd.call(old,{} as SpeechSynthesisEvent);s.engine.throwCancel=false;s.controller.speak({id:'second-word',term:'second'});assert.deepEqual(s.engine.events,['speak','cancel','cancel','speak']);assert.equal(s.engine.spoken.length,2);assert.equal(s.last().wordId,'second-word');assert.equal(s.last().phase,'starting');s.controller.destroy();
});
test('persistent cancellation failure blocks repeated clicks and destroy retries only the owned queue',()=>{
 const s=fixture();s.controller.speak(WORD);s.engine.throwCancel=true;
 for(let i=0;i<3;i++){s.controller.speak({id:`new-word-${i}`,term:'new'});assert.equal(s.last().phase,'error');assert.equal(s.engine.spoken.length,1);}
 assert.equal(s.engine.cancelCount,3);const stateCount=s.states.length;s.controller.destroy();assert.equal(s.engine.cancelCount,4);assert.equal(s.engine.listeners.size,0);assert.equal(s.states.length,stateCount);s.engine.throwCancel=false;s.controller.destroy();assert.equal(s.engine.cancelCount,5);s.controller.destroy();assert.equal(s.engine.cancelCount,5);
});
test('stop failure retains ownership for a later stop, then new speech can start safely',()=>{
 const s=fixture();s.controller.speak(WORD);s.engine.throwCancel=true;s.controller.stop();assert.equal(s.last().phase,'error');assert.equal(s.engine.cancelCount,1);assert.equal(s.timers.jobs.size,0);
 s.engine.throwCancel=false;s.controller.stop();assert.equal(s.last().phase,'idle');assert.equal(s.engine.cancelCount,2);s.controller.speak(WORD);assert.equal(s.engine.cancelCount,2);assert.equal(s.engine.spoken.length,2);s.controller.destroy();
});
