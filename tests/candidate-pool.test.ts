import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { seedWords, seedScenes } from '../src/data/seed.ts';
import { enrichWordForPlanning } from '../src/data/word-presentation.ts';
import { addDays, validateSemanticSelection, type Scene, type Word } from '../src/core/index.ts';
import { compactSemanticInput, DeepSeekPlanner, type SemanticPlannerInput } from '../src/server/provider.ts';
import { compactCandidateTags } from '../src/server/candidate-pool.ts';

const imported=JSON.parse(readFileSync(new URL('../public/lexicons/final-import.json',import.meta.url),'utf8')) as {words:Word[];scenes:Scene[]};
const fullWords=[...seedWords,...imported.words].map(enrichWordForPlanning);
const fullScenes=[...seedScenes,...imported.scenes];
const full:SemanticPlannerInput={words:fullWords,scenes:fullScenes,availableWordIds:fullWords.map(w=>w.id),selectionKey:'2026-11-04'};
const seedIds=new Set(seedWords.map(w=>w.id));

test('real3966 inventory immediately includes new CET/tech while all oldseedwords remain eligible',()=>{
 const before=JSON.stringify(full);const pool=compactSemanticInput(full);assert.equal(fullWords.length,3966);assert.equal(pool.candidates.size,200);
 const chosen=fullWords.filter(w=>pool.candidates.has(w.id));assert.ok(chosen.filter(w=>!seedIds.has(w.id)).length>=100);
 assert.ok(chosen.filter(w=>w.tags.includes('cet4')&&w.tags.includes('technical-context')).length>=40);
 assert.equal(chosen.filter(w=>!seedIds.has(w.id)&&w.tags.includes('cloud-native')).length,24);
 const historical=chosen.filter(w=>w.tags.includes('cet4')&&w.tags.includes('computing-candidate')&&!w.tags.includes('technical-context')&&!w.tags.includes('cloud-native'));assert.ok(historical.length>0&&historical.length<=16);
 assert.equal(pool.promptScenes.flatMap(s=>s.words).length,pool.candidates.size);assert.ok(pool.promptScenes.length<=24);assert.equal(JSON.stringify(full),before);
 const bytes=new TextEncoder().encode(JSON.stringify(pool.promptScenes)).byteLength;assert.ok(bytes<100*1024,`real prompt ${bytes}B should stay concise`);
});

test('date-key cyclic windows cover the entire giant inventory rather than alphabetical prefixes',()=>{
 const words:Word[]=Array.from({length:3000},(_,i)=>({id:`coverage-${String(i).padStart(4,'0')}`,term:`term${i}`,meaning:'通用词义',tags:['cet4'],sceneIds:['large-source']}));
 const scenes:Scene[]=[{id:'large-source',title:'大型词表',description:'原始来源词表，按语义选择',wordIds:words.map(w=>w.id)}];const input={words,scenes,availableWordIds:words.map(w=>w.id)};
 const first=compactSemanticInput({...input,selectionKey:'2026-11-01'});assert.deepEqual(compactSemanticInput({...input,selectionKey:'2026-11-01'}).promptScenes,first.promptScenes);
 const allSeen=new Set<string>();for(let i=0;i<50;i++){const p=compactSemanticInput({...input,selectionKey:addDays('2026-11-01',i)});assert.equal(p.candidates.size,200);p.candidates.forEach(id=>allSeen.add(id));}
 assert.equal(allSeen.size,3000);assert.ok(allSeen.has('coverage-2999'));
 assert.notDeepEqual([...compactSemanticInput({...input,selectionKey:'2026-11-02'}).candidates],[...first.candidates]);
});

test('learned/reserved exclusions stay authoritative; all groups retain real scene membership without duplicates',()=>{
 const excluded=new Set([...seedWords.slice(0,30),...imported.words.slice(0,300)].map(w=>w.id));
 const input={...full,availableWordIds:[...full.availableWordIds.filter(id=>!excluded.has(id)),'unknown-available-id']};
 const pool=compactSemanticInput(input);assert.ok([...pool.candidates].every(id=>!excluded.has(id)&&fullWords.some(w=>w.id===id)));assert.ok(!pool.candidates.has('unknown-available-id'));
 const source=new Map(fullScenes.map(s=>[s.id,new Set(s.wordIds)]));const seen=new Set<string>();
 for(const group of pool.promptScenes){assert.ok(source.has(group.sceneId));for(const word of group.words){assert.ok(source.get(group.sceneId)!.has(word.wordId));assert.ok(!seen.has(word.wordId));seen.add(word.wordId);}}
 const verified=validateSemanticSelection({title:'验证语义候选',rationale:'只使用程序允许且属于真实场景的词条',groups:pool.promptScenes.map(s=>({sceneId:s.sceneId,title:s.title.slice(0,80),task:s.task,wordIds:s.words.map(w=>w.wordId)}))},{availableWordIds:input.availableWordIds,scenes:fullScenes});assert.equal(verified.wordIds.length,pool.candidates.size);
});

test('small curated224 keeps its original42-word three-scene experience for any key',()=>{
 const input={words:seedWords,scenes:seedScenes,availableWordIds:seedWords.map(w=>w.id)};
 for(const selectionKey of ['2026-11-01','2026-11-20','other-platform-key']){const pool=compactSemanticInput({...input,selectionKey});assert.equal(pool.candidates.size,42);assert.equal(pool.promptScenes.length,3);assert.deepEqual([...pool.candidates],seedScenes.slice(0,3).flatMap(s=>s.wordIds));}
});

test('large unassigned dictionaries only use the reserved imported group, never invented scene IDs',()=>{
 const words:Word[]=Array.from({length:500},(_,i)=>({id:`unassigned-${i}`,term:`term${i}`,meaning:'通用释义',tags:['cet4'],sceneIds:[]}));const pool=compactSemanticInput({words,scenes:[],availableWordIds:words.map(w=>w.id),selectionKey:'2026-11-01'});
 assert.equal(pool.candidates.size,200);assert.deepEqual(pool.promptScenes.map(s=>s.sceneId),['imported']);assert.equal(validateSemanticSelection({title:'自定义语义',rationale:'基于未分组词条释义组成对照',groups:pool.promptScenes.map(s=>({sceneId:s.sceneId,title:s.title,task:s.task,wordIds:s.words.map(w=>w.wordId)}))},{availableWordIds:words.map(w=>w.id),scenes:[]}).wordIds.length,200);
});

test('provider sends concise evidence tags but no pool key/day/quota, and keeps Flashlow output uncapped',async()=>{
 let sent:Record<string,unknown>={};
 const planner=new DeepSeekPlanner('not-a-real-key',async(_url,init)=>{
  sent=JSON.parse(init!.body as string);const payload=JSON.parse((sent.messages as {content:string}[])[1].content);const chosen=payload.scenes.find((s:{words:{wordId:string}[]})=>s.words.some(w=>!seedIds.has(w.wordId)));const ids=chosen.words.slice(0,4).map((w:{wordId:string})=>w.wordId);
  return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({title:'真实关联选词',rationale:'依据词义与使用语境自然组成语义小组',groups:[{sceneId:chosen.sceneId,title:'语义任务',task:'理解这些词的实际关联',wordIds:ids}]})}}],usage:{prompt_tokens:1000,completion_tokens:500,total_tokens:1500}}));
 });
 const selection=await planner.generateSemantic(full);assert.equal(selection.wordIds.length,4);assert.ok(selection.wordIds.some(id=>!seedIds.has(id)));
 const messages=sent.messages as {content:string}[];const payload=JSON.parse(messages[1].content);assert.deepEqual(Object.keys(payload),['scenes']);assert.ok(!messages[1].content.includes(full.selectionKey!));assert.ok(messages[0].content.includes('computing-candidate仅为旧词典[计]候选'));assert.ok(messages[0].content.includes('没有每日数量目标'));
 for(const group of payload.scenes)for(const word of group.words){assert.ok(Array.isArray(word.tags));assert.ok(word.tags.length<=5);assert.ok(word.tags.every((tag:string)=>tag.length<=32));assert.equal('source' in word,false);assert.equal('example' in word,false);assert.ok(word.meaning.length<=160);}
 assert.equal(sent.model,'deepseek-flash');assert.equal(sent.reasoning_effort,'low');assert.equal('max_tokens' in sent,false);assert.equal('max_completion_tokens' in sent,false);
 const tags=compactCandidateTags({id:'tagged',term:'term',meaning:'释义',sceneIds:[],tags:[...Array.from({length:20},(_,i)=>`unrelated-${i}`),'cet4','computing-candidate','technical-context']});assert.ok(tags.includes('cet4'));assert.ok(tags.includes('computing-candidate'));assert.ok(tags.includes('technical-context'));
});
