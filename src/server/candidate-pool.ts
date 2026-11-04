import type { Scene, Word } from '../core/index.ts';

export interface SemanticCandidateInput { words:Word[]; scenes:Scene[]; availableWordIds:string[]; selectionKey?:string }
export interface PromptWord { wordId:string; term:string; meaning:string; tags:string[] }
export interface PromptScene { sceneId:string; title:string; task:string; words:PromptWord[] }
export const SEMANTIC_POOL_LIMIT=200;
const MAX_CONTEXT_SCENES=24;
const NEW_TECH=new Set(['cloud-native','new-cloud-native','new-tech','tech-extra','technical-extra','tech']);
const CONTEXT=new Set(['technical-context','deployment','gpu-cloud','network','programming','server','computing','technical']);
const normalized=(word:Word)=>word.tags.map(t=>t.trim().toLowerCase());
const has=(word:Word,tag:string)=>normalized(word).includes(tag);
const isCet=(word:Word)=>has(word,'cet4');
const isNewTech=(word:Word)=>normalized(word).some(tag=>NEW_TECH.has(tag));
const contextTag=(tag:string)=>CONTEXT.has(tag)||/计算机|云服务|服务器|通用与技术交叉|\bgpu\b/i.test(tag);
const isContext=(word:Word)=>normalized(word).some(contextTag);
const isHistoricalComputing=(word:Word)=>has(word,'computing-candidate');

/** Tags are contextual hints, not newly asserted dictionary/exam provenance. */
export function compactCandidateTags(word:Word):string[]{
 const values=[...new Map(word.tags.map((t,index)=>{const clean=t.trim();return [clean.toLowerCase(),{clean,index}];})).values()].filter(v=>v.clean);
 const priority=(tag:string)=>tag==='cet4'?0:NEW_TECH.has(tag)?1:tag==='technical-context'?2:tag==='computing-candidate'?3:contextTag(tag)?4:5;
 values.sort((a,b)=>priority(a.clean.toLowerCase())-priority(b.clean.toLowerCase())||a.index-b.index);
 return values.slice(0,5).map(v=>v.clean.slice(0,32));
}
export function compactCandidateWord(word:Word):PromptWord {return {wordId:word.id,term:word.term.slice(0,100),meaning:word.meaning.slice(0,160),tags:compactCandidateTags(word)};}
/** Keep the original small curated-library experience byte-for-byte in selection. */
export function needsBalancedCandidatePool(input:SemanticCandidateInput):boolean{return input.words.length>256||input.scenes.some(scene=>scene.wordIds.length>SEMANTIC_POOL_LIMIT);}
function hash(value:string):number{
 let n=2166136261;
 for(let i=0;i<value.length;i++){n^=value.charCodeAt(i);n=Math.imul(n,16777619);}
 n^=n>>>16;n=Math.imul(n,0x7feb352d);n^=n>>>15;n=Math.imul(n,0x846ca68b);return (n^(n>>>16))>>>0;
}
const compareId=(a:string,b:string)=>a<b?-1:a>b?1:0;
function dateOrdinal(key:string):number|null {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
 const value=Date.parse(`${key}T00:00:00Z`);return Number.isFinite(value)&&new Date(value).toISOString().slice(0,10)===key?Math.floor(value/86_400_000):null;
}
/** Hash order removes alphabetical bias; daily cyclic windows cover a whole stable bucket. */
function windowOrder(ids:string[],key:string,salt:string,step:number):string[]{
 if(!ids.length) return [];
 const order=ids.map(id=>({id,rank:hash(`${salt}:${id}`)})).sort((a,b)=>a.rank-b.rank||compareId(a.id,b.id)).map(item=>item.id);
 const day=dateOrdinal(key);const offset=((day===null?hash(`${salt}:${key}`):day*Math.max(1,step)+hash(salt))%order.length+order.length)%order.length;
 return [...order.slice(offset),...order.slice(0,offset)];
}
/**
 * This is an input sampling budget, never a daily learning quota. The program
 * supplies eligible IDs; the model still decides which coherent subset to use.
 * No adapter-specific scene ID, spelling prefix or fixed dictionary source is used.
 */
export function buildBalancedCandidatePool(input:SemanticCandidateInput):{candidates:Set<string>;promptScenes:PromptScene[]}{
 const key=input.selectionKey??'default';const allowed=new Set(input.availableWordIds);
 const all=new Map(input.words.map(w=>[w.id,w]));
 const eligible=new Map(input.words.filter(w=>allowed.has(w.id)).map(w=>[w.id,w]));
 const membership=new Map<string,Scene[]>();
 for(const scene of input.scenes)for(const id of new Set(scene.wordIds))if(eligible.has(id)){const list=membership.get(id)??[];list.push(scene);membership.set(id,list);}
 for(const list of membership.values())list.sort((a,b)=>a.wordIds.length-b.wordIds.length||compareId(a.id,b.id));
 const groups=new Map<string,{scene:Scene|null;ids:string[]}>();const candidates=new Set<string>();
 const add=(id:string,preferred?:Scene):boolean=>{
  if(candidates.has(id)||!eligible.has(id)||candidates.size>=SEMANTIC_POOL_LIMIT) return false;
  const scene=preferred??membership.get(id)?.[0]??null;const sceneId=scene?.id??'imported';
  let group=groups.get(sceneId);
  if(!group){if(groups.size>=MAX_CONTEXT_SCENES)return false;group={scene,ids:[]};groups.set(sceneId,group);}
  group.ids.push(id);candidates.add(id);return true;
 };
 const pick=(ids:string[],amount:number,salt:string)=>{
  let count=0;for(const id of windowOrder(ids,key,salt,amount)){if(count>=amount||candidates.size>=SEMANTIC_POOL_LIMIT)break;if(add(id))count++;}return count;
 };
 // Preserve complete available parts of a couple of real small task scenes.
 // A giant imported CET scene is not mistaken for a coherent 3,847-word task.
 const anchors=input.scenes.filter(scene=>scene.wordIds.length<=40&&scene.wordIds.length>0).filter(scene=>{
  const source=scene.wordIds.map(id=>all.get(id)).filter((w):w is Word=>Boolean(w));
  return source.length>0&&source.filter(w=>isContext(w)&&!isNewTech(w)).length/source.length>=0.5;
 }).map(scene=>({scene,ids:[...new Set(scene.wordIds)].filter(id=>eligible.has(id)&&isContext(eligible.get(id)!)&&!isNewTech(eligible.get(id)!))})).filter(a=>a.ids.length);
 const anchorById=new Map(anchors.map(a=>[a.scene.id,a]));let anchorWords=0;let anchorScenes=0;
 for(const id of windowOrder(anchors.map(a=>a.scene.id),key,'task-anchors',2)){
  const anchor=anchorById.get(id)!;if(anchorScenes>=2||anchorWords>=32)break;
  if(anchorWords+anchor.ids.length>32&&!(anchorScenes===0&&anchor.ids.length<=40))continue;
  for(const wordId of anchor.ids)if(add(wordId,anchor.scene))anchorWords++;
  anchorScenes++;
 }
 const values=[...eligible.values()];
 const cross=values.filter(w=>isCet(w)&&isContext(w)).map(w=>w.id);
 const newTech=values.filter(isNewTech).map(w=>w.id);
 const historical=values.filter(w=>isCet(w)&&isHistoricalComputing(w)&&!isContext(w)&&!isNewTech(w)).map(w=>w.id);
 const generalCet=values.filter(w=>isCet(w)&&!isContext(w)&&!isHistoricalComputing(w)&&!isNewTech(w)).map(w=>w.id);
 const other=values.filter(w=>!isCet(w)&&!isContext(w)&&!isNewTech(w)).map(w=>w.id);
 pick(cross,40,'cet-technical-context');
 pick(newTech,32,'new-technical-context');
 pick(historical,16,'historical-computing-candidates');
 pick(generalCet,64,'general-cet-coverage');
 pick(other,20,'other-custom-coverage');
 for(const [ids,salt] of [[generalCet,'general-cet-fill'],[cross,'cross-fill'],[newTech,'tech-fill'],[historical,'historical-fill'],[other,'other-fill'],[[...eligible.keys()],'remaining-coverage']] as [string[],string][]){if(candidates.size>=SEMANTIC_POOL_LIMIT)break;pick(ids,SEMANTIC_POOL_LIMIT-candidates.size,salt);}
 const promptScenes=[...groups.entries()].map(([sceneId,{scene,ids}])=>({sceneId,title:(scene?.title??'自定义词库').slice(0,100),task:(scene?.task||scene?.description||'依据释义按语义关联或真实任务筛选，不指定数量。').slice(0,250),words:ids.map(id=>compactCandidateWord(eligible.get(id)!))}));
 return {candidates,promptScenes};
}
