import test from 'node:test';
import assert from 'node:assert/strict';
import { seedWords, seedScenes } from '../src/data/seed.ts';
import { AIPlanningError, compactPlanningInput, compactSemanticInput, DeepSeekPlanner, safeAIFailure, type PlannerInput } from '../src/server/provider.ts';
const input: PlannerInput = { date:'2026-10-31', words:[{id:'deploy',term:'deploy',meaning:'部署',tags:[],sceneIds:['server']}], scenes:[{id:'server',title:'部署网站',description:'部署任务',wordIds:['deploy']}], availableWordIds:['deploy'], range:{min:1,max:1,target:1,capacity:1,remaining:1,daysLeft:1,reviewMinutes:0,reason:'test'} };
function provider(value: unknown, status = 200) { return new DeepSeekPlanner('not-a-real-key', async () => new Response(typeof value === 'string' ? value : JSON.stringify(value), {status})); }
async function diagnosis(p: DeepSeekPlanner) { try { await p.generate(input); assert.fail('must reject'); } catch(error) { assert.ok(error instanceof AIPlanningError); return error.diagnostics; } }
const valid = {title:'部署任务',rationale:'从真实任务开始',groups:[{sceneId:'server',title:'发布网站',task:'把应用部署到服务器',wordIds:['deploy']}]};
const envelope = (content: string, finish_reason = 'stop') => ({choices:[{finish_reason,message:{content}}],usage:{prompt_tokens:100,completion_tokens:2400,total_tokens:2500}});
test('truncation diagnostics precede JSON parse and expose no output or thinking', async () => {
 const d = await diagnosis(provider(envelope('{"truncated":"private content', 'length')));
 assert.deepEqual(d,{code:'AI_OUTPUT_TRUNCATED',finishReason:'length',contentChars:29,completionTokens:2400});
 assert.ok(!JSON.stringify(d).includes('private content'));
});
test('blank JSON output at natural stop is distinct from envelope and JSON syntax errors', async () => {
 assert.equal((await diagnosis(provider(envelope('   ')))).code,'AI_EMPTY_CONTENT');
 assert.equal((await diagnosis(provider('not-json'))).code,'AI_ENVELOPE_JSON_INVALID');
 assert.equal((await diagnosis(provider(envelope('{broken')))).code,'AI_JSON_INVALID');
});
test('HTTP status and timeout are sanitized without propagating body, error messages or secrets', async () => {
 const d = await diagnosis(provider('{"error":"sensitive upstream echo"}',429)); assert.deepEqual(d,{code:'AI_HTTP_ERROR',httpStatus:429});
 const timeout = new DeepSeekPlanner('not-a-real-key',async () => {throw new DOMException('sensitive text','TimeoutError');});
 assert.deepEqual(await diagnosis(timeout),{code:'AI_TIMEOUT'});
 const network = new DeepSeekPlanner('not-a-real-key',async () => {throw new Error('sensitive transport text');});
 assert.deepEqual(await diagnosis(network),{code:'AI_NETWORK_ERROR'});
 assert.deepEqual(safeAIFailure(new Error('sensitive text')),{code:'AI_UNKNOWN_FAILURE'});
});
test('structural validation distinguishes unknown IDs, membership and quantity without raw values', async () => {
 const unavailable = {...valid,groups:[{...valid.groups[0],wordIds:['hallucinated-private-value']}]};
 assert.equal((await diagnosis(provider(envelope(JSON.stringify(unavailable))))).validationCode,'PLAN_WORD_UNAVAILABLE');
 const wrongScene = {...valid,groups:[{...valid.groups[0],sceneId:'imported'}]};
 assert.equal((await diagnosis(provider(envelope(JSON.stringify(wrongScene))))).validationCode,'PLAN_SCENE_MEMBERSHIP');
 assert.equal((await diagnosis(provider(envelope(JSON.stringify({...valid,groups:[]}))))).validationCode,'PLAN_COUNT_RANGE');
});
test('verified valid JSON keeps real usage and provider metadata rather than a failure label', async () => {
 const plan = await provider(envelope(JSON.stringify(valid))).generate(input);
 assert.equal(plan.source,'ai'); assert.equal(plan.aiUsage?.completionTokens,2400); assert.equal(plan.aiFailure,undefined);
});

test('scenario context stays semantically focused rather than mixing the whole 224-word lexicon', () => {
 const full = {...input,words:seedWords,scenes:seedScenes,availableWordIds:seedWords.map(w=>w.id),range:{...input.range,min:6,max:14}};
 const result = compactPlanningInput(full);
 assert.equal(result.promptScenes.length,3); assert.ok(result.candidates.size>=14 && result.candidates.size<=42);
 const prompt = JSON.stringify(result.promptScenes); assert.ok(prompt.length<7000); assert.ok(!prompt.includes('\"exampleZh\":')); assert.ok(!prompt.includes('\"source\":'));
 assert.equal(result.promptScenes.flatMap(s=>s.words).length,result.candidates.size);
});
test('shortlist expands enough for a larger daily minimum and includes standalone imported words', () => {
 const full = {...input,words:seedWords,scenes:seedScenes,availableWordIds:seedWords.map(w=>w.id),range:{...input.range,min:45,max:60}};
 assert.ok(compactPlanningInput(full).candidates.size>=45);
 const imported = {...input,words:[{...input.words[0],sceneIds:[]}],scenes:[]};
 assert.equal(compactPlanningInput(imported).promptScenes[0].sceneId,'imported');
});

test('provider accepts long upstream reasoning envelopes without imposing an output-token budget', async () => {
 let requestBody: Record<string,unknown> = {};
 const p = new DeepSeekPlanner('not-a-real-key', async (_url,init) => {
  requestBody=JSON.parse(init!.body as string);
  return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(valid),reasoning_content:'x'.repeat(300_000)}}],usage:{prompt_tokens:1000,completion_tokens:40_000,total_tokens:41_000}}));
 });
 const plan=await p.generate(input); assert.equal(plan.source,'ai'); assert.equal(plan.aiUsage?.completionTokens,40_000);
 assert.equal('max_tokens' in requestBody,false); assert.equal('max_completion_tokens' in requestBody,false);
 assert.ok(!JSON.stringify(plan).includes('reasoning_content'));
});

const semanticInput = {words:seedWords,scenes:seedScenes,availableWordIds:seedWords.map(w=>w.id)};
function semanticRaw(count: number) {
 let remaining=count;
 return {title:'云服务器上线语义组',rationale:'由实例选择、远程访问到网络开放，是一个连贯部署任务。',groups:seedScenes.slice(0,3).map(scene => {const ids=scene.wordIds.slice(0,remaining); remaining-=ids.length; return {sceneId:scene.id,title:scene.title,task:scene.task || scene.description,wordIds:ids};}).filter(group=>group.wordIds.length)};
}
test('semantic selection accepts 32 related words without a legacy day range or calendar authority', async () => {
 let sent: Record<string,unknown> = {};
 const p = new DeepSeekPlanner('not-a-real-key', async (_url,init) => {sent=JSON.parse(init!.body as string); return new Response(JSON.stringify(envelope(JSON.stringify({...semanticRaw(32),date:'2099-01-01',stage:3}))));});
 const selection=await p.generateSemantic(semanticInput);
 assert.equal(selection.wordIds.length,32); assert.equal(selection.source,'ai'); assert.equal('date' in selection,false); assert.equal('stage' in selection,false);
 const messages=sent.messages as {role:string;content:string}[];
 const payload=JSON.parse(messages[1].content); assert.deepEqual(Object.keys(payload),['scenes']); assert.equal(payload.scenes.flatMap((scene:{words:unknown[]})=>scene.words).length,42);
 assert.equal('max_tokens' in sent,false); assert.equal('max_completion_tokens' in sent,false); assert.equal(sent.reasoning_effort,'low');
 assert.ok(messages[0].content.includes('不负责学习排期或记忆状态')); assert.ok(messages[0].content.includes('{"title"')); assert.ok(!messages[0].content.includes('{\\"title'));
});
test('semantic context keeps all 42 related source words, rather than an artificial 6–14 quota', async () => {
 const context=compactSemanticInput(semanticInput); assert.equal(context.candidates.size,42); assert.equal(context.promptScenes.length,3);
 const p=provider(envelope(JSON.stringify(semanticRaw(42)))); assert.equal((await p.generateSemantic(semanticInput)).wordIds.length,42);
});
test('semantic selection only sees program-eligible IDs, rejects duplicates and mismatched scenes', async () => {
 const available=seedScenes[0].wordIds.slice(0,4);
 const unknown=provider(envelope(JSON.stringify(semanticRaw(14))));
 await assert.rejects(unknown.generateSemantic({...semanticInput,availableWordIds:available}), error => error instanceof AIPlanningError && error.diagnostics.validationCode==='PLAN_WORD_UNAVAILABLE');
 const duplicate=semanticRaw(4); duplicate.groups[0].wordIds.push(duplicate.groups[0].wordIds[0]);
 await assert.rejects(provider(envelope(JSON.stringify(duplicate))).generateSemantic(semanticInput),error => error instanceof AIPlanningError && error.diagnostics.validationCode==='PLAN_WORD_DUPLICATE');
 const mismatch=semanticRaw(4); mismatch.groups[0].sceneId=seedScenes[1].id;
 await assert.rejects(provider(envelope(JSON.stringify(mismatch))).generateSemantic(semanticInput),error => error instanceof AIPlanningError && error.diagnostics.validationCode==='PLAN_SCENE_MEMBERSHIP');
});
test('semantic validator supports a 200-word coherent inventory group as a payload bound, not a daily quota', async () => {
 const words=Array.from({length:200},(_,index)=>({id:`coherent-${index}`,term:`term${index}`,meaning:'相同任务语境',tags:[],sceneIds:['coherent']}));
 const scenes=[{id:'coherent',title:'连贯主题',description:'完整主题语义组',wordIds:words.map(word=>word.id)}];
 const raw={title:'完整主题',rationale:'全部词条属于同一个主题',groups:[{sceneId:'coherent',title:'主题词',task:'理解完整语义关联',wordIds:words.map(word=>word.id)}]};
 const selection=await provider(envelope(JSON.stringify(raw))).generateSemantic({words,scenes,availableWordIds:words.map(word=>word.id)});
 assert.equal(selection.wordIds.length,200);
});
