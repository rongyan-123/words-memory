import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {build} from 'esbuild';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {pronunciationFor} from '../src/client/pronunciation.ts';
import {pronunciationEntries,pronunciationInfo} from '../src/data/pronunciations.ts';
import {seedWords,seedScenes,lexiconInfo} from '../src/data/seed.ts';
import type {Word} from '../src/core/index.ts';
import {canonicalize,EXPECTED_SEED_SHA256} from '../src/backup/format.mjs';
import {WHEEL_STUDY_HINT,WHEEL_REVIEW_HINT} from '../src/client/study-instructions.ts';

const missing=['resolver','hostname','runtime','namespace','gpu','checksum'];
test('sourced IPA subset has exact declared coverage, dialect and preserved source values',()=>{
 const subset=JSON.parse(readFileSync('src/data/pronunciations-subset.json','utf8'));
 assert.equal(Object.keys(pronunciationEntries).length,218);assert.equal(pronunciationInfo.coveredCount,218);assert.equal(pronunciationInfo.seedWordCount,224);assert.deepEqual(pronunciationInfo.missingTerms,missing);assert.equal(pronunciationInfo.sourceSha256,subset.sourceSha256);
 const known=new Set(seedWords.map(w=>w.term.toLowerCase()));
 for(const [term,entry]of Object.entries(pronunciationEntries)){assert.ok(known.has(term));assert.equal(entry.ipa,subset.entries[term]);assert.equal(entry.dialect,'en-US');assert.ok(entry.source.includes('ipa-dict'));assert.ok(entry.ipa.startsWith('/'));}
 for(const term of missing)assert.equal(pronunciationFor({term}),null);
});

test('explicit imported phonetic wins without guessing dialect, mutating words or accepting prototype names',()=>{
 const word=Object.freeze({term:'instance',phonetic:'  /my supplied IPA/  ',source:'My licensed dictionary'});const result=pronunciationFor(word)!;
 assert.equal(result.ipa,'/my supplied IPA/');assert.equal(result.from,'lexicon');assert.equal(result.label,'音标');assert.equal(result.dialect,null);assert.equal(word.phonetic,'  /my supplied IPA/  ');
 assert.equal(pronunciationFor({term:' INSTANCE ',phonetic:'  '})!.from,'reference');assert.equal(pronunciationFor({term:'__proto__'}),null);assert.equal(pronunciationFor({term:'constructor'}),null);assert.equal(pronunciationFor({term:'a new unlisted word'}),null);
});

test('dictionary variants remain source-derived and available without constructing new IPA',()=>{
 const result=pronunciationFor({term:'average'})!;assert.equal(result.variants.length,3);assert.equal(result.variants.join(', '),result.ipa);assert.equal(result.label,'美');assert.equal(result.dialect,'en-US');
 const imported=pronunciationFor({term:'average',phonetic:'UK /a/; US /b/'})!;assert.deepEqual(imported.variants,['UK /a/; US /b/']);
});

test('persistent wheel guidance explains three masked rounds and timed review without absolute promises',()=>{
 assert.equal(WHEEL_STUDY_HINT,'建议连续快速刷 3 遍，每遍从头开始、遮住中文回忆；没记住的做标记再刷，直到这轮能顺畅回忆，别只过一遍。');assert.equal(WHEEL_REVIEW_HINT,'之后按第 1、3、7 天复习');assert.ok(!/绝不|永不|永远不|绝对/.test(WHEEL_STUDY_HINT));
 const app=readFileSync('app/_components/vocabulary-app.tsx','utf8');assert.ok(app.includes('<p className="wheel-tutorial">{WHEEL_STUDY_HINT} <span>{WHEEL_REVIEW_HINT}</span></p>'));
});

test('presentation overlay preserves the exact original seed and disaster verifier pin',()=>{
 assert.equal(seedWords.filter(w=>w.phonetic).length,0);assert.equal(seedWords.length,224);
 const hash=createHash('sha256').update(canonicalize({words:seedWords,scenes:seedScenes,info:lexiconInfo})).digest('hex');assert.equal(hash,EXPECTED_SEED_SHA256);assert.equal(hash,'8b6af3402a70e4b69d324593e92546d72dfe8de5aa3964568bfc56d69728b31e');
 assert.equal(createHash('sha256').update(readFileSync('src/data/seed.ts')).digest('hex'),'bd5263b6c2b058d03bbeb7862df51f70694f0b8a98bf2b2bdb24be004e4f86d9');
 const notices=readFileSync('public/licenses/pronunciation-data.txt','utf8');for(const copyright of ['Copyright (c) 2016 dohliam','Copyright (c) 2016 Lingliang Zhang','Kyle Gorman','Carnegie Mellon University'])assert.ok(notices.includes(copyright));
});

// Server-render the real TSX component using the installed build tool, with the
// same React module as the renderer. No browser, network or paid model is used.
const compiled=await build({entryPoints:['app/_components/word-row.tsx'],bundle:true,platform:'node',format:'cjs',write:false,external:['react','react/jsx-runtime','lucide-react'],logLevel:'silent'});
const componentModule:{exports:any}={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(resolve('app/_components/word-row.tsx')),componentModule,componentModule.exports);
const WordRow=componentModule.exports.default;
function row(term:string,phonetic?:string,options:{word?:Word;revealed?:boolean}={}){const calls:string[]=[];const callback=(name:string)=>()=>{calls.push(name);};const html=renderToStaticMarkup(createElement(WordRow,{word:options.word??{id:`test-${term}`,term,meaning:'测试',tags:[],sceneIds:[],...(phonetic?{phonetic}:{})},index:1,hardCount:0,revealed:options.revealed??false,grade:null,openSide:null,canRemember:true,onOpen:callback('open'),onIncrement:callback('hard'),onDecrement:callback('decrement'),onFamiliar:callback('familiar'),onReveal:callback('reveal'),onSpeak:callback('speak')}));assert.deepEqual(calls,[]);return html;}

test('real row shows sourced US IPA, separate playback/disclosure and a truthful missing state',()=>{
 const html=row('instance');assert.match(html,/class="pronunciation-label">美<\/small>/);assert.match(html,/class="pronunciation-ipa"[^>]*>\/[^<]+\/<\/span>/);assert.ok(html.includes('不是词典录音'));assert.ok(html.includes('不保证与每个音标变体逐项对应'));assert.ok(html.includes('lucide-volume'));assert.ok(!html.includes('待补音标'));
 const variants=row('average');assert.match(variants,/class="pronunciation-more pronunciation-toggle"[^>]*aria-expanded="false"/);assert.match(variants,/class="pronunciation-more pronunciation-toggle"[^>]*>\+2<\/button>/);assert.equal(variants.match(/class="pronunciation-ipa"[^>]*>([^<]+)<\/span>/)![1],pronunciationFor({term:'average'})!.variants[0]);assert.ok(variants.includes('不播放、不切换合成声音'));
 const absent=row('GPU');assert.ok(absent.includes('待补音标'));assert.ok(!absent.includes('pronunciation-label'));assert.ok(absent.includes('暂无词典音标'));assert.ok(absent.includes('lucide-volume'));
 const imported=row('instance','/own <IPA>/');assert.ok(imported.includes('音标</small>'));assert.ok(imported.includes('/own &lt;IPA&gt;/'));assert.ok(!imported.includes('美式音标'));
});

/** A small hook harness invokes the real compiled component's actual handlers.
 * This tests event separation, not audible browser/device output. */
function interactiveRow(openSide:'left'|'right'|null=null){
 const calls:string[]=[];const states:any[]=[];const refs:any[]=[];let stateIndex=0,refIndex=0;
 const hooks={useState(initial:any){const index=stateIndex++;if(!(index in states))states[index]=typeof initial==='function'?initial():initial;return[states[index],(next:any)=>{states[index]=typeof next==='function'?next(states[index]):next;}];},useRef(initial:any){const index=refIndex++;return refs[index]??(refs[index]={current:initial});}};
 const require=createRequire(resolve('app/_components/word-row.tsx'));const module:{exports:any}={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)((id:string)=>id==='react'?hooks:require(id),module,module.exports);
 const callback=(name:string)=>()=>{calls.push(name);};
 const props={word:{id:'test-record',term:'record',meaning:'记录',tags:[],sceneIds:[]},index:1,hardCount:0,revealed:false,grade:null,openSide,canRemember:true,onOpen:callback('close'),onIncrement:callback('mark'),onDecrement:callback('decrement'),onFamiliar:callback('grade'),onReveal:callback('reveal'),onSpeak:callback('speak')};
 const render=()=>{stateIndex=0;refIndex=0;return module.exports.default(props);};
 return{calls,render};
}
function elements(tree:any):any[]{if(!tree||typeof tree!=='object')return[];const child=tree.props?.children;return[tree,...(Array.isArray(child)?child.flatMap(elements):elements(child))];}
const classElement=(tree:any,name:string)=>elements(tree).find(node=>typeof node.props?.className==='string'&&node.props.className.split(/\s+/).includes(name));

test('multi-IPA playback, dictionary disclosure and word speech never rate, mark or reveal',()=>{
 const harness=interactiveRow();let tree=harness.render();const disclosure=classElement(tree,'pronunciation-toggle');assert.equal(disclosure.type,'button');assert.equal(disclosure.props['aria-expanded'],false);
 disclosure.props.onClick({stopPropagation(){}});assert.deepEqual(harness.calls,['close']);tree=harness.render();assert.equal(classElement(tree,'pronunciation-toggle').props['aria-expanded'],true);assert.equal(classElement(tree,'pronunciation-ipa').props.children,pronunciationFor({term:'record'})!.ipa);
 const ipa=classElement(tree,'word-phonetic');assert.equal(ipa.props['aria-expanded'],undefined);ipa.props.onClick();classElement(tree,'word-term').props.onClick();assert.equal(harness.calls.filter(name=>name==='speak').length,2);assert.ok(!harness.calls.some(name=>['mark','decrement','grade','reveal'].includes(name)));
});

test('playing or disclosing from an open swipe row closes it without swallowing the intended click',()=>{
 for(const name of ['word-phonetic','pronunciation-toggle']){const harness=interactiveRow('left');const tree=harness.render();let prevented=false;const target={closest(selector:string){return selector==='.speech-control,.pronunciation-toggle'?{}:null;}};tree.props.onClickCapture({detail:1,target,preventDefault(){prevented=true;},stopPropagation(){prevented=true;}});assert.equal(prevented,false);classElement(tree,name).props.onClick({stopPropagation(){}});assert.equal(harness.calls.filter(call=>call==='speak').length,name==='word-phonetic'?1:0);assert.ok(!harness.calls.some(call=>['mark','grade','reveal'].includes(call)));}
});

test('revealed real row separates original technical sense from ordinary and dictionary candidate senses',()=>{
 const word=seedWords.find(w=>w.id==='w-access')!,before=JSON.stringify(word);const html=row(word.term,undefined,{word,revealed:true});assert.ok(html.includes('CET4'));assert.ok(html.includes('技术场景'));assert.ok(html.includes('本场景义 · 原创例句'));assert.ok(html.includes(word.meaning));assert.ok(html.includes('通用 / 其他义 · ECDICT'));assert.ok(html.includes('计算机候选义 · ECDICT [计]'));assert.ok(!html.includes('<a '),'no nested interactive links inside the reveal button');assert.equal(JSON.stringify(word),before);
 const hidden=row(word.term,undefined,{word});assert.ok(!hidden.includes('meaning-section'));assert.ok(hidden.includes('点击显示'));
});
