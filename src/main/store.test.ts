import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OfficeStore } from './store';
import { sessionTarget } from './navigation';
import type { WorkerSession } from '../shared/types';
const worker=(id:string):WorkerSession=>({id,title:id,project:'test',source:'desktop',status:'working',desk:-1,updatedAt:1});
test('poll order does not move desks; missing sessions become disconnected',()=>{
 const store=new OfficeStore();store.update([worker('a'),worker('b')],true,'');store.update([worker('b'),worker('a')],true,'');
 assert.equal(store.get('a')?.desk,0);assert.equal(store.get('b')?.desk,1);
 store.update([worker('b')],true,'');assert.equal(store.get('a')?.status,'disconnected');
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
