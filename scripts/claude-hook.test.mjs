import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { normalizeHook } from './claude-hook.mjs';
const input = (hook_event_name, extra={}) => ({session_id:'shared-id',hook_event_name,cwd:'/projects/office',...extra});

test('Claude lifecycle is namespaced, bounded and private', () => {
 for (const [name,status] of Object.entries({SessionStart:'idle',UserPromptSubmit:'working',PostToolUse:'working',PostToolUseFailure:'working',PermissionRequest:'waiting',Stop:'idle',StopFailure:'idle',SessionEnd:'disconnected',PreCompact:'working',Elicitation:'waiting',ElicitationResult:'working'})) {
  const event=normalizeHook(input(name,{prompt:'SECRET',tool_input:{description:'SECRET'},last_assistant_message:'SECRET',transcript_path:'SECRET'}),{},123);
  assert.equal(event.status,status);assert.equal(event.id,'claude:shared-id');assert.equal(event.harness,'claude');
  assert.ok(!JSON.stringify(event).includes('SECRET'));
  assert.equal(event.ended,name==='SessionEnd'?true:undefined);
 }
 assert.equal(normalizeHook(input('PreToolUse',{tool_name:'AskUserQuestion'}),{}).status,'waiting');
 assert.equal(normalizeHook(input('SessionStart',{source:'compact'}),{}).status,'working');
 assert.equal(normalizeHook(input('Notification',{notification_type:'permission_prompt'}),{}).status,'waiting');
 assert.equal(normalizeHook(input('Notification',{notification_type:'idle_prompt'}),{}).status,'idle');
 for(const extra of [{hook_event_name:'Interrupt'},{hook_event_name:'SubagentStop'},{agent_id:'child'},{session_id:'../../invalid'},{hook_event_name:'Notification',notification_type:'auth_success'}]) assert.equal(normalizeHook(input('Stop',extra),{}),null);
});

test('Claude installer preserves settings, backs up once, and is idempotent', async () => {
 const directory=await mkdtemp(join(tmpdir(),'claude-settings-'));
 try {
  const original={permissions:{allow:['Read']},hooks:{Stop:[{hooks:[{type:'command',command:'existing-hook'}]}]}};
  const target=join(directory,'settings.json');
  await writeFile(target,JSON.stringify(original));
  const install=()=>spawnSync(process.execPath,['scripts/install-hooks.mjs','claude'],{encoding:'utf8',env:{...process.env,CLAUDE_CONFIG_DIR:directory}});
  assert.equal(install().status,0);
  const first=await readFile(target,'utf8');const settings=JSON.parse(first);
  assert.deepEqual(settings.permissions,original.permissions);
  assert.deepEqual(settings.hooks.Stop[0],original.hooks.Stop[0]);
  assert.match(settings.hooks.Stop[1].hooks[0].command,/claude-hook.mjs/);
  assert.equal(settings.hooks.Interrupt,undefined);
  assert.equal(install().status,0);assert.equal(await readFile(target,'utf8'),first);
  const backups=(await readdir(directory)).filter(file=>file.includes('cyber-backup'));
  assert.equal(backups.length,1);assert.deepEqual(JSON.parse(await readFile(join(directory,backups[0]),'utf8')),original);
  await writeFile(target,'invalid json');assert.notEqual(install().status,0);assert.equal(await readFile(target,'utf8'),'invalid json');
 } finally {await rm(directory,{recursive:true,force:true});}
});
