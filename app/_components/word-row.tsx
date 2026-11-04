"use client";
import { useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { Check, LoaderCircle, Minus, Volume2 } from "lucide-react";
import type { Grade, Word } from "../../src/core/index";
import { classifySwipe } from "../../src/client/swipe";
import { pronunciationFor } from "../../src/client/pronunciation";
import { wordPresentation } from "../../src/data/word-presentation";

type Side = "left" | "right" | null;
interface Props {
  word: Word; index: number; hardCount: number; revealed: boolean; grade: Grade | null;
  openSide: Side; canRemember: boolean; disabled?: boolean; speechPhase?: 'starting' | 'speaking' | null;
  onOpen(side: Side): void; onIncrement(): void; onDecrement(): void; onFamiliar(): void;
  onReveal(): void; onSpeak(): void;
}
export default function WordRow({word,index,hardCount,revealed,grade,openSide,canRemember,disabled=false,speechPhase=null,onOpen,onIncrement,onDecrement,onFamiliar,onReveal,onSpeak}: Props) {
  const pronunciation=pronunciationFor(word);
  const presentation=wordPresentation(word);
  const rowBadges=[...(presentation.tags.includes('cet4')?['CET4']:[]),...(presentation.tags.includes('technical-context')?['技术场景']:[]),...(presentation.tags.includes('cloud-native')?['云原生']:[]),...(presentation.tags.includes('computing-candidate')?['[计]候选']:[])];
  const [showPronunciationVariants,setShowPronunciationVariants]=useState(false);
  const extraPronunciations=Math.max(0,(pronunciation?.variants.length||0)-1);
  const speechTitle='浏览器合成朗读单词，不是词典录音；不保证与每个音标变体逐项对应';
  const speak=()=>{onOpen(null);onSpeak();};
  const [drag,setDrag]=useState<number|null>(null);
  const gesture=useRef<{id:number;x:number;y:number;base:number;horizontal:boolean;vertical:boolean}|null>(null);
  const suppressClick=useRef(0);
  const actionWidth=72;
  const lightness=94-Math.min(8,hardCount)*3.6;
  const markerStyle: CSSProperties=hardCount?{backgroundColor:`hsl(349 59% ${lightness}%)`,color:hardCount>=3?"#fff":"#c18d99"}:{};
  function down(event: PointerEvent<HTMLElement>){
    if(event.button!==0||disabled)return;
    if((event.target as HTMLElement).closest('.swipe-action')){suppressClick.current=0;return;}
    if(!openSide)onOpen(null);
    gesture.current={id:event.pointerId,x:event.clientX,y:event.clientY,base:openSide==='left'?actionWidth:openSide==='right'?-actionWidth:0,horizontal:false,vertical:false};
  }
  function move(event: PointerEvent<HTMLElement>){
    const g=gesture.current;if(!g||g.id!==event.pointerId||g.vertical)return;
    const dx=event.clientX-g.x,dy=event.clientY-g.y;
    if(!g.horizontal){if(Math.abs(dy)>10&&Math.abs(dy)>Math.abs(dx)){g.vertical=true;suppressClick.current=Date.now()+400;return;}if(Math.abs(dx)<12||Math.abs(dx)<Math.abs(dy)*1.3)return;g.horizontal=true;event.currentTarget.setPointerCapture(event.pointerId);}
    if(event.cancelable)event.preventDefault();setDrag(Math.max(-actionWidth,Math.min(actionWidth,g.base+dx)));
  }
  function up(event: PointerEvent<HTMLElement>){
    const g=gesture.current;gesture.current=null;if(!g||!g.horizontal||g.vertical){if(g?.vertical)suppressClick.current=Date.now()+400;setDrag(null);return;}
    if(event.cancelable)event.preventDefault();suppressClick.current=Date.now()+400;
    const dx=event.clientX-g.x,dy=event.clientY-g.y;
    const direction=classifySwipe({dx,dy});
    const end=Math.max(-actionWidth,Math.min(actionWidth,g.base+dx));
    onOpen(direction?(end>=42?'left':end<=-42?'right':null):null);setDrag(null);
  }
  const translated=drag??(openSide==='left'?actionWidth:openSide==='right'?-actionWidth:0);
  return <article className={`swipe-row ${openSide?'open':''}`} role="group" tabIndex={0} aria-label={`${word.term}，难词标记 ${hardCount} 次。左右方向键打开操作，Esc关闭。`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={()=>{gesture.current=null;setDrag(null);}} onKeyDown={e=>{if(e.altKey||e.ctrlKey||e.metaKey)return;if(e.key==='ArrowRight'){e.preventDefault();onOpen('left');}else if(e.key==='ArrowLeft'){e.preventDefault();onOpen('right');}else if(e.key==='Escape'){e.preventDefault();onOpen(null);}}} onClickCapture={e=>{if(e.detail>0&&Date.now()<suppressClick.current){e.preventDefault();e.stopPropagation();return;}if(openSide&&!(e.target as HTMLElement).closest('.swipe-action')&&!(e.target as HTMLElement).closest('.row-number')){onOpen(null);if(!(e.target as HTMLElement).closest('.speech-control,.pronunciation-toggle')){e.preventDefault();e.stopPropagation();}}}}>
    <button className="swipe-action decrease" aria-hidden={openSide!=='left'} tabIndex={openSide==='left'?0:-1} disabled={disabled||hardCount===0} onClick={()=>{onDecrement();onOpen(null);}} aria-label={`${word.term} 难词标记减一，当前${hardCount}次`}><Minus size={22}/><span>标记 −1</span></button>
    <button className="swipe-action familiar" aria-hidden={openSide!=='right'} tabIndex={openSide==='right'?0:-1} disabled={disabled||!canRemember} onClick={()=>{onFamiliar();onOpen(null);}} aria-label={`我已记住 ${word.term}，保留难词历史`}><Check size={23}/><span>熟知</span></button>
    <div className={`word-row ${grade==='remembered'?'known':''}`} style={{transform:`translateX(${translated}px)`,transition:drag===null?undefined:'none'}}>
      <button className="row-number" style={markerStyle} disabled={disabled} onClick={()=>{onIncrement();onOpen(null);}} aria-label={`${word.term} 难词标记加一，当前${hardCount}次`} title={`难词标记 ${hardCount} 次；点击 +1`}><span>{index}</span>{hardCount>0&&<small>{hardCount>99?'99+':hardCount}</small>}</button>
      <div className="word-english">
        <button type="button" className="word-term speech-control" onClick={speak} aria-label={`合成朗读 ${word.term}`} title={speechTitle}>{word.term}</button>
        <div className="pronunciation-controls">
          {pronunciation?<button type="button" className={`word-phonetic speech-control ${speechPhase?'speech-active':''}`} onClick={speak} aria-busy={speechPhase==='starting'} aria-label={`合成朗读 ${word.term}；${pronunciation.label==='音标'?'音标':`${pronunciation.label}式音标`} ${pronunciation.ipa}；合成声线不保证区分各读法`} title={`${pronunciation.source}；${speechTitle}`}><small className="pronunciation-label">{pronunciation.label}</small><span className="pronunciation-ipa" id={`pronunciation-${word.id}`}>{showPronunciationVariants?pronunciation.ipa:pronunciation.variants[0]}</span>{speechPhase==='starting'?<LoaderCircle size={12} className="speech-icon spin" aria-hidden="true"/>:<Volume2 size={12} className="speech-icon" aria-hidden="true"/>}{grade==='remembered'&&<Check size={10} className="known-check"/>}</button>:<><span className="word-phonetic missing-phonetic" title="词库尚无可靠音标"><span>待补音标</span>{grade==='remembered'&&<Check size={10} className="known-check"/>}</span><button type="button" className={`word-play speech-control ${speechPhase?'speech-active':''}`} onClick={speak} aria-busy={speechPhase==='starting'} aria-label={`合成朗读 ${word.term}，暂无词典音标`} title={speechTitle}>{speechPhase==='starting'?<LoaderCircle size={12} className="speech-icon spin" aria-hidden="true"/>:<Volume2 size={12} className="speech-icon" aria-hidden="true"/>}</button></>}
          {extraPronunciations>0&&<button type="button" className="pronunciation-more pronunciation-toggle" onClick={e=>{e.stopPropagation();onOpen(null);setShowPronunciationVariants(open=>!open);}} aria-expanded={showPronunciationVariants} aria-controls={`pronunciation-${word.id}`} aria-label={`${showPronunciationVariants?'收起':'展开'} ${word.term} 的其他 ${extraPronunciations} 种词典读法，仅查看、不切换声音`} title="仅展开/收起词典读法，不播放、不切换合成声音">{showPronunciationVariants?'−':`+${extraPronunciations}`}</button>}
        </div>
      </div>
      <button className={`word-chinese ${revealed?'revealed':'concealed'}`} onClick={onReveal} aria-label={`${revealed?'隐藏':'显示'} ${word.term} 的中文`} aria-expanded={revealed} title={revealed?presentation.sources.map(source=>`${source.label}：${source.url}`).join('；'):undefined}>{revealed?<span className="word-meaning-content">{rowBadges.length>0&&<span className="word-badges" aria-label={presentation.badges.join('；')}>{rowBadges.map(badge=><small key={badge}>{badge}</small>)}</span>}{presentation.meanings.map((section,index)=><span className="meaning-section" key={`${section.label}-${index}`}><small>{section.label}</small><span>{section.text}</span></span>)}</span>:<span>点击显示</span>}</button>
    </div>
  </article>;
}
