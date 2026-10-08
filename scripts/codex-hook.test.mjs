import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHook } from './codex-hook.mjs';

test('captures permission without retaining arguments, prompt, or transcript', () => {
 const event = normalizeHook({session_id:'session-1',hook_event_name:'PermissionRequest',cwd:'/home/me/project',tool_input:{command:'PRIVATE'},prompt:'SECRET',transcript_path:'/private'}, {WARP_FOCUS_URL:'warp://session/550e8400e29b41d4a716446655440000'}, 100);
 assert.deepEqual(event,{id:'session-1',status:'waiting',updatedAt:100,source:'cli',project:'project',focusUrl:'warp://session/550e8400e29b41d4a716446655440000',detail:'Waiting for permission in Codex'});
});
test('invalid focus URLs and unknown events cannot produce navigation or state', () => {
 assert.equal(normalizeHook({session_id:'x',hook_event_name:'Stop'},{WARP_FOCUS_URL:'warp://action/new_tab?command=unsafe'},1).focusUrl,undefined);
 assert.equal(normalizeHook({session_id:'x',hook_event_name:'SubagentStop'},{}),null);
 assert.equal(normalizeHook({session_id:'../../bad',hook_event_name:'Stop'},{}),null);
});
test('turn completion retains occupant; session end is explicit', () => {
 assert.equal(normalizeHook({session_id:'x',hook_event_name:'Stop'},{}).status,'idle');
 assert.equal(normalizeHook({session_id:'x',hook_event_name:'SessionEnd'},{}).ended,true);
});

test('hook process spools a private minimal event and tolerates invalid input', async () => {
 const { mkdtemp, readdir, readFile, stat, rm } = await import('node:fs/promises');
 const { tmpdir } = await import('node:os');
 const { join } = await import('node:path');
 const { spawnSync } = await import('node:child_process');
 const root = await mkdtemp(join(tmpdir(),'cyber-hook-test-'));
 try {
  const env = { ...process.env, CYBER_CO_WORKERS_EVENT_DIR: root, WARP_FOCUS_URL:'warp://session/550e8400e29b41d4a716446655440000' };
  const script = new URL('./codex-hook.mjs',import.meta.url);
  const {fileURLToPath} = await import('node:url');
  const invoke = input => spawnSync(process.execPath,[fileURLToPath(script)],{input,env,encoding:'utf8'});
  assert.equal(invoke('{broken').status,0);
  assert.equal(invoke(JSON.stringify({session_id:'test-session',hook_event_name:'UserPromptSubmit',prompt:'private'})).status,0);
  const files = await readdir(root);
  assert.equal(files.length,1);
  const path = join(root,files[0]);
  const event = JSON.parse(await readFile(path,'utf8'));
  assert.equal(event.status,'working');
  assert.equal(event.prompt,undefined);
  assert.equal((await stat(path)).mode & 0o777,0o600);
 } finally { await rm(root,{recursive:true,force:true}); }
});

test('only optional approval description is retained and bounded', () => {
 const event = normalizeHook({session_id:'x',hook_event_name:'PermissionRequest',tool_input:{description:'Need approval\n'+ 'a'.repeat(300),command:'SECRET',reason:'NOT_DOCUMENTED'}} ,{});
 assert.equal(event.detail.length,240);
 assert.equal(event.detail.includes('\n'),false);
 assert.equal(JSON.stringify(event).includes('SECRET'),false);
 assert.equal(JSON.stringify(event).includes('NOT_DOCUMENTED'),false);
});
