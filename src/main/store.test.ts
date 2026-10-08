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

test('disconnected workers expire after 30 seconds without new observations',()=>{
 let now=0;const store=new OfficeStore(()=>now);
 store.update([worker('a'),worker('b')],true,'');
 store.update([worker('b')],true,'');
 now=29_999;assert.equal(store.expireDisconnected(),false);assert.equal(store.get('a')?.status,'disconnected');
 now=30_000;assert.equal(store.expireDisconnected(),true);assert.equal(store.get('a'),undefined);
 assert.equal(store.get('b')?.desk,1);
 store.upsert(worker('c'));assert.equal(store.get('c')?.desk,0);
});

test('repeated disconnected polls neither reset the grace period nor recreate expired workers',()=>{
 let now=100;const store=new OfficeStore(()=>now);
 const disconnected={...worker('a'),status:'disconnected' as const};
 store.update([disconnected],false,'');
 now=20_100;store.update([disconnected],false,'');assert.ok(store.get('a'));
 now=30_100;store.update([disconnected],false,'');assert.equal(store.get('a'),undefined);
 now=60_100;store.update([disconnected],false,'');assert.equal(store.get('a'),undefined);
 store.update([worker('a')],true,'');assert.equal(store.get('a')?.status,'working');
});

test('reconnection cancels expiry; a later disconnect starts a fresh grace period',()=>{
 let now=0;const store=new OfficeStore(()=>now);store.upsert(worker('a'));
 store.update([],false,'');now=20_000;store.upsert(worker('a'));
 now=35_000;assert.equal(store.expireDisconnected(),false);assert.equal(store.get('a')?.desk,0);
 store.update([],false,'');now=64_999;assert.equal(store.expireDisconnected(),false);
 now=65_000;assert.equal(store.expireDisconnected(),true);
});
