import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeHookSessions } from './hook-sessions';
import { parseHookEvent } from '../shared/hook-event';
import { OfficeStore } from './store';
import { sessionTarget } from './navigation';
const event=(updatedAt:number,extra={})=>parseHookEvent({id:'claude:shared-id',harness:'claude',status:'working',updatedAt,...extra})!;
test('both harnesses coexist; ended Claude sessions can resume; quiet sessions remain',()=>{
 let now=100_000;const store=new OfficeStore();
 const codex={id:'shared-id',source:'desktop' as const,title:'Codex',project:'',status:'idle' as const,updatedAt:now,desk:0};
 const sync=(events:ReturnType<typeof event>[])=>store.update(mergeHookSessions([codex],events,now),true,'');
 sync([event(now)]);assert.equal(store.snapshot().sessions.length,2);
 const claude=store.get('claude:shared-id')!;assert.equal(claude.harness,'claude');assert.equal(sessionTarget(claude),undefined);
 assert.equal(sessionTarget({...claude,source:'desktop'}),undefined);
 sync([event(now,{status:'disconnected',ended:true})]);assert.equal(store.get(claude.id),undefined);
 now++;sync([event(now)]);assert.equal(store.get(claude.id)?.status,'working');
 const stale=event(now);now+=60_001;sync([stale]);assert.equal(store.get(claude.id)?.status,'working');
 now+=86_400_000;sync([stale]);assert.equal(store.get(claude.id)?.status,'working');
 sync([event(now,{status:'disconnected',ended:true})]);now+=86_400_000;sync([event(now-86_400_000,{status:'disconnected',ended:true})]);assert.equal(store.get(claude.id),undefined);
 sync([event(now)]);assert.equal(store.get(claude.id)?.status,'working');
 store.dismiss(claude.id);sync([event(now)]);assert.equal(store.get(claude.id),undefined);
});
test('provider namespace is validated at the spool boundary',()=>{
 assert.equal(parseHookEvent({id:'shared-id',harness:'claude',status:'idle',updatedAt:1}),undefined);
 assert.equal(parseHookEvent({id:'claude:shared-id',status:'idle',updatedAt:1}),undefined);
});
