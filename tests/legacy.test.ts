import test from 'node:test';import assert from 'node:assert/strict';
import { readLegacyDraft } from '../src/client/legacy.ts';
import { loadPendingBatch,makeBatchPayload,persistPendingBatch,clearPendingBatch } from '../src/client/batch.ts';
test('new editor reload clears a V4 snapshot drained by the previous owner',()=>{
 const items=new Map<string,string>();const store={getItem:(key:string)=>items.get(key)??null,setItem:(key:string,value:string)=>{items.set(key,value);},removeItem:(key:string)=>{items.delete(key);}};
 const key='draft';store.setItem(key,JSON.stringify({day:1,date:'2026-10-31',ratings:{word1:'forgot'}}));persistPendingBatch(store,makeBatchPayload('2026-10-31',[{wordId:'word1',grade:'forgot'}],false,'legacy-owner-1'));
 const oldDraft=readLegacyDraft(store.getItem(key),['word1'],10);assert.equal(oldDraft.grades.word1,'forgot');assert.ok(loadPendingBatch(store));
 // The first editor receives ACK while the second is read-only.
 clearPendingBatch(store,'legacy-owner-1');store.removeItem(key);
 const nextOwnerDraft=readLegacyDraft(store.getItem(key),['word1'],10);const nextOwnerPending=loadPendingBatch(store);
 assert.deepEqual(nextOwnerDraft,{grades:{},day:null,actionDate:null});assert.equal(nextOwnerPending,null);assert.equal(oldDraft.grades.word1,'forgot');
});
