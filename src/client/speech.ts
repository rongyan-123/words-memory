/** Browser speech only. No browser globals are read at import or by this factory. */
export interface SpeechState {
  phase:'idle'|'starting'|'speaking'|'error';
  wordId?:string;
  term?:string;
  message?:string;
  /** Explicitly selected browser voice language, not a promise about recorded IPA. */
  voiceLang?:string;
}
export interface SpeechControllerOptions {
  synthesis?:SpeechSynthesis|null;
  makeUtterance?:(text:string)=>SpeechSynthesisUtterance;
  onState:(state:SpeechState)=>void;
  setTimer?:(callback:()=>void,delayMs:number)=>unknown;
  clearTimer?:(handle:unknown)=>void;
  startTimeoutMs?:number;
}
export interface SpeechController {speak(word:{id:string;term:string}):void;stop():void;destroy():void}
interface Request {
  generation:number;wordId:string;term:string;utterance:SpeechSynthesisUtterance;
  selectedVoice:SpeechSynthesisVoice|null;started:boolean;queued:boolean;timer:unknown;hasTimer:boolean;
}
const normalizedLang=(lang:string)=>lang.replaceAll('_','-');
function englishVoice(voices:SpeechSynthesisVoice[]):SpeechSynthesisVoice|null {
  return voices.map((voice,index)=>({voice,index,lang:typeof voice.lang==='string'?normalizedLang(voice.lang).toLowerCase():''}))
    .filter(item=>/^en(?:-|$)/.test(item.lang))
    .sort((a,b)=>(a.lang==='en-us'?0:1)-(b.lang==='en-us'?0:1)||(a.voice.localService?0:1)-(b.voice.localService?0:1)||(a.voice.default?0:1)-(b.voice.default?0:1)||a.index-b.index)[0]?.voice??null;
}
function errorMessage(code:string):string {
  switch(code){
    case 'not-allowed':return '浏览器阻止了朗读，请直接点击喇叭重试，并检查浏览器的声音或自动播放设置。';
    case 'audio-busy':return '音频设备被占用，请结束其他播放或通话后重试。';
    case 'audio-hardware':return '没有可用的音频输出，请检查扬声器、耳机和系统音量。';
    case 'network':return '浏览器的语音服务连接失败，请检查网络或安装设备上的英文语音。';
    case 'language-unavailable':case 'voice-unavailable':return '当前英文语音不可用，请在系统中安装或启用英文语音后重试。';
    case 'synthesis-unavailable':return '系统没有可用的语音合成服务，请启用英文语音或换一个浏览器。';
    case 'text-too-long':return '文字超出浏览器朗读长度，请只朗读当前单词。';
    case 'invalid-argument':return '浏览器拒绝了朗读参数，请刷新或换一个浏览器。';
    case 'canceled':case 'interrupted':return '朗读被取消或打断，可再次点击喇叭重试。';
    default:return '浏览器语音合成失败，请重试或换一个支持英文语音的浏览器。';
  }
}
/** The caller injects the browser APIs so importing/rendering on a server is safe. */
export function createSpeechController(options:SpeechControllerOptions):SpeechController {
  const engine=options.synthesis;
  const setTimer=options.setTimer??((callback,delay)=>globalThis.setTimeout(callback,delay));
  const clearTimer=options.clearTimer??(handle=>globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>));
  const timeout=typeof options.startTimeoutMs==='number'&&Number.isFinite(options.startTimeoutMs)&&options.startTimeoutMs>0?options.startTimeoutMs:10_000;
  let destroyed=false;let generation=0;let active:Request|null=null;let ownedQueued=false;
  let voices:SpeechSynthesisVoice[]=[];let listening=false;
  const emit=(state:SpeechState)=>{if(!destroyed)options.onState(state);};
  const current=(request:Request)=>!destroyed&&active===request&&request.generation===generation;
  const clearWatchdog=(request:Request)=>{if(request.hasTimer){request.hasTimer=false;try{clearTimer(request.timer);}catch{/* Late callbacks are also generation-guarded. */}}};
  // cancel() is browser-global; never call it merely because this controller
  // exists. Only cancel after this controller actually submitted an utterance.
  const release=(cancel:boolean):boolean=>{
    const request=active;active=null;
    if(request){
      clearWatchdog(request);
      request.utterance.onstart=null;request.utterance.onend=null;request.utterance.onerror=null;
      if(!cancel)ownedQueued=false; // The current utterance actually ended.
    }
    if(cancel&&ownedQueued){try{engine!.cancel();ownedQueued=false;}catch{return false;}}
    // A failed cancellation deliberately retains ownership even after handlers
    // detach: the next click/stop/destroy must cancel again before new speech.
    return true;
  };
  const fail=(request:Request,message:string)=>{
    if(!current(request))return;
    generation++;release(true);
    emit({phase:'error',wordId:request.wordId,term:request.term,message});
  };
  const readVoices=()=>{
    const available=engine!.getVoices();
    if(!Array.isArray(available))throw new Error('INVALID_VOICE_LIST');
    voices=available;return available;
  };
  const voicesChanged=()=>{
    if(destroyed)return;
    try{readVoices();}catch{return;}
    if(active&&!active.selectedVoice&&voices.length&&!englishVoice(voices))fail(active,'系统语音列表中没有英文语音，请安装或启用英文语音；不会改用中文声音代读。');
    // An already queued lang=en-US attempt may start as voices finish loading.
    // Do not cancel/requeue asynchronously: that could lose user activation.
  };
  if(engine){
    try{readVoices();}catch{/* Surface API failures only after a user clicks. */}
    if(typeof engine.addEventListener==='function'&&typeof engine.removeEventListener==='function'){
      try{engine.addEventListener('voiceschanged',voicesChanged);listening=true;}catch{/* Next click still refreshes voices. */}
    }
  }
  return {
    speak(word){
      if(destroyed)return;
      generation++;
      if(!release(true)){emit({phase:'error',wordId:word.id,term:word.term,message:'无法停止上一次浏览器朗读，请重试或刷新页面。'});return;}
      const term=typeof word.term==='string'?word.term.trim():'';
      if(!term||typeof word.id!=='string'||!word.id){emit({phase:'error',message:'没有可朗读的单词。'});return;}
      if(!engine||typeof engine.speak!=='function'||typeof engine.cancel!=='function'||typeof engine.getVoices!=='function'||!options.makeUtterance){emit({phase:'error',wordId:word.id,term,message:'当前浏览器没有可用的系统朗读功能，请换一个支持语音合成的浏览器。'});return;}
      let selected:SpeechSynthesisVoice|null;
      try{readVoices();selected=englishVoice(voices);}catch{emit({phase:'error',wordId:word.id,term,message:'无法读取浏览器语音列表，请检查系统语音设置或换一个浏览器。'});return;}
      if(voices.length&&!selected){emit({phase:'error',wordId:word.id,term,message:'系统语音列表中没有英文语音，请安装或启用英文语音；不会改用中文声音代读。'});return;}
      let utterance:SpeechSynthesisUtterance;
      try{
        utterance=options.makeUtterance(term);
        utterance.text=term;utterance.lang=selected?normalizedLang(selected.lang):'en-US';utterance.voice=selected;utterance.volume=1;utterance.rate=0.85;utterance.pitch=1;
      }catch{emit({phase:'error',wordId:word.id,term,message:'无法创建浏览器朗读任务，请刷新页面或换一个浏览器。'});return;}
      const request:Request={generation,wordId:word.id,term,utterance,selectedVoice:selected,started:false,queued:false,timer:null,hasTimer:false};
      active=request;
      const state=(phase:'starting'|'speaking'):SpeechState=>({phase,wordId:request.wordId,term,...(selected?{voiceLang:normalizedLang(selected.lang)}:{})});
      utterance.onstart=()=>{if(!current(request))return;request.started=true;clearWatchdog(request);emit(state('speaking'));};
      utterance.onend=()=>{if(!current(request))return;generation++;release(false);emit(request.started?{phase:'idle'}:{phase:'error',wordId:request.wordId,term:request.term,message:'未收到朗读启动确认，请检查设备声音和英文语音设置后重试。'});};
      utterance.onerror=event=>fail(request,errorMessage(event.error));
      try{request.hasTimer=true;request.timer=setTimer(()=>{if(current(request)&&!request.started)fail(request,'浏览器在等待时间内没有启动朗读，请检查设备声音和英文语音设置，再点击喇叭重试。');},timeout);}catch{fail(request,'无法启动浏览器朗读计时，请刷新页面后重试。');return;}
      emit(state('starting'));
      if(!current(request))return;
      try{
        if(engine.paused)engine.resume();
        if(!current(request))return;
        request.queued=true;ownedQueued=true;engine.speak(utterance);
        // speak() returning is not evidence of speech or audible output.
      }catch(error){fail(request,error instanceof Error&&error.name==='NotAllowedError'?errorMessage('not-allowed'):errorMessage('synthesis-failed'));}
    },
    stop(){if(destroyed)return;generation++;const stopped=release(true);emit(stopped?{phase:'idle'}:{phase:'error',message:'无法停止浏览器朗读，请重试或刷新页面。'});},
    destroy(){
      if(destroyed){release(true);return;}destroyed=true;generation++;release(true);
      if(listening){listening=false;try{engine!.removeEventListener('voiceschanged',voicesChanged);}catch{/* No callbacks may update state after destroy. */}}
    },
  };
}
