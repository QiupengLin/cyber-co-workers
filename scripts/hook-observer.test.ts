import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { HookObserver, type HookSessionEvent } from '../src/main/hooks';

test('real hook file forwards sanitized permission and exact Warp focus to observer', async () => {
 const directory = await mkdtemp(join(tmpdir(), 'cyber-hook-observer-'));
 let observer: HookObserver | undefined;
 try {
  const result = spawnSync(process.execPath,['scripts/codex-hook.mjs'],{
   cwd:process.cwd(), encoding:'utf8',
   env:{...process.env,CYBER_CO_WORKERS_EVENT_DIR:directory,WARP_FOCUS_URL:'warp://session/550e8400e29b41d4a716446655440000'},
   input:JSON.stringify({session_id:'test-root',hook_event_name:'PermissionRequest',cwd:'/projects/test',tool_input:{description:'Allow access to project files?',command:'SECRET'},prompt:'PRIVATE'}),
  });
  assert.equal(result.status,0);
  const files = await readdir(directory);
  const raw = await readFile(join(directory,files[0]),'utf8');
  assert.ok(!raw.includes('SECRET') && !raw.includes('PRIVATE'));
  const event = await new Promise<HookSessionEvent>((resolve,reject)=>{
   const deadline=setTimeout(()=>reject(new Error('Hook callback not delivered')),3000);
   observer=new HookObserver(event=>{clearTimeout(deadline);resolve(event)},directory);
   observer.start();
  });
  assert.equal(event.id,'test-root');
  assert.equal(event.status,'waiting');
  assert.equal(event.detail,'Allow access to project files?');
  assert.equal(event.focusUrl,'warp://session/550e8400e29b41d4a716446655440000');
 } finally {observer?.stop(); await rm(directory,{recursive:true,force:true});}
});

test('Claude subprocess reaches observer without colliding with Codex or retaining content', async () => {
 const directory=await mkdtemp(join(tmpdir(),'cyber-claude-observer-'));
 let observer:HookObserver|undefined;
 try {
  for(const harness of ['codex','claude']) {
   const result=spawnSync(process.execPath,[`scripts/${harness}-hook.mjs`],{encoding:'utf8',env:{...process.env,CYBER_CO_WORKERS_EVENT_DIR:directory,WARP_FOCUS_URL:'warp://session/'+'b'.repeat(32)},input:JSON.stringify({session_id:'same-session',hook_event_name:'PermissionRequest',prompt:'PRIVATE',tool_input:{command:'SECRET'}})});
   assert.equal(result.status,0);assert.equal(result.stdout,'');assert.equal(result.stderr,'');
  }
  assert.equal((await readdir(directory)).length,2);
  const events=await new Promise<HookSessionEvent[]>((resolve,reject)=>{
   const received:HookSessionEvent[]=[];
   const timeout=setTimeout(()=>reject(new Error('Hooks not delivered')),3000);
   observer=new HookObserver(event=>{received.push(event);if(received.length===2){clearTimeout(timeout);resolve(received);}},directory);observer.start();
  });
  const claude=events.find(e=>e.harness==='claude')!;
  assert.equal(claude.id,'claude:same-session');assert.equal(claude.status,'waiting');assert.equal(claude.detail,'Waiting for permission in Claude Code');assert.equal(claude.source,'cli');
  assert.equal(claude.focusUrl,'warp://session/'+'b'.repeat(32));
  assert.ok(!JSON.stringify(events).includes('PRIVATE'));assert.ok(!JSON.stringify(events).includes('SECRET'));
 } finally {observer?.stop();await rm(directory,{recursive:true,force:true});}
});
