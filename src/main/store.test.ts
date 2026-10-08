import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OfficeStore } from './store';
import { sessionTarget } from './navigation';
import type { WorkerSession } from '../shared/types';
const worker=(id:string):WorkerSession=>({id,title:id,project:'test',source:'desktop',status:'working',desk:-1,updatedAt:1});
test('poll order does not move desks; missing sessions keep their last state',()=>{
 const store=new OfficeStore();store.update([worker('a'),worker('b')],true,'');store.update([worker('b'),worker('a')],true,'');
 assert.equal(store.get('a')?.desk,0);assert.equal(store.get('b')?.desk,1);
 store.update([worker('b')],true,'');assert.equal(store.get('a')?.status,'working');
});
test('dismissed sessions do not return on polling, and desks are reusable',()=>{
 const store=new OfficeStore();store.update([worker('a')],true,'');store.dismiss('a');store.update([worker('a'),worker('b')],true,'');assert.equal(store.get('a'),undefined);assert.equal(store.get('b')?.desk,0);
});
test('navigation permits exact session URLs, rejects command links and unidentified origin',()=>{
 assert.equal(sessionTarget(worker('abc-123')),'codex://threads/abc-123');
 assert.equal(sessionTarget({...worker('a'),source:'cli',focusUrl:'warp://session/'+'a'.repeat(32)}),'warp://session/'+'a'.repeat(32));
 assert.equal(sessionTarget({...worker('a'),source:'cli',focusUrl:'warp://action/new_tab?command=bad'}),undefined);
 assert.equal(sessionTarget({...worker('a'),source:'unknown'}),undefined);
});

test('missing and disconnected observations retain status, desk and routing',()=>{
 const store=new OfficeStore();
 for(const status of ['working','idle','waiting'] as const) {
  const session={...worker(status),status,focusUrl:'warp://session/'+'a'.repeat(32)};
  store.upsert(session);const before=store.get(status);
  store.update([],false,'Transport unavailable');
  store.update([{...session,status:'disconnected',updatedAt:Date.now()+86400000}],false,'');
  assert.deepEqual(store.get(status),before);
 }
});
test('explicit end removes a session, frees its desk and permits resumption',()=>{
 const store=new OfficeStore();store.upsert(worker('a'));store.upsert(worker('b'));
 store.upsert({...worker('a'),status:'disconnected',ended:true});
 assert.equal(store.get('a'),undefined);assert.equal(store.get('b')?.desk,1);
 store.upsert(worker('c'));assert.equal(store.get('c')?.desk,0);
 store.upsert(worker('a'));assert.equal(store.get('a')?.status,'working');
});
