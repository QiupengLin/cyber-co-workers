#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { normalizeHook as normalizeCodexHook, runHook } from './codex-hook.mjs';

// Only project/status metadata leaves this adapter. Prompts, tool inputs,
// assistant responses and notification bodies are deliberately discarded.
export function normalizeHook(input, env = process.env, now = Date.now()) {
  if (!input || typeof input !== 'object' || input.agent_id) return null;
  const statuses = {
    SessionStart: 'idle', UserPromptSubmit: 'working', PreToolUse: 'working',
    PostToolUse: 'working', PostToolUseFailure: 'working', PermissionRequest: 'waiting',
    Stop: 'idle', StopFailure: 'idle', SessionEnd: 'disconnected',
    PreCompact: 'working', PostCompact: 'working', Elicitation: 'waiting', ElicitationResult: 'working',
  };
  let status = Object.hasOwn(statuses, input.hook_event_name) ? statuses[input.hook_event_name] : undefined;
  if (input.hook_event_name === 'Notification') {
    status = {permission_prompt:'waiting', idle_prompt:'idle', elicitation_dialog:'waiting', elicitation_url_dialog:'waiting'}[input.notification_type];
    if (!['permission_prompt','idle_prompt','elicitation_dialog','elicitation_url_dialog'].includes(input.notification_type)) return null;
  }
  if (!status) return null;
  if (input.hook_event_name === 'SessionStart' && input.source === 'compact') status = 'working';
  if (input.hook_event_name === 'PreToolUse' && input.tool_name === 'AskUserQuestion') status = 'waiting';
  const base = normalizeCodexHook({session_id:input.session_id,cwd:input.cwd,hook_event_name:'Stop'}, env, now);
  if (!base) return null;
  return {...base, id:`claude:${base.id}`, harness:'claude', source:'cli', status,
    ...(status === 'waiting' ? {detail: input.hook_event_name === 'PermissionRequest' || input.notification_type === 'permission_prompt' ? 'Waiting for permission in Claude Code' : 'Waiting for your input in Claude Code'} : {}),
    ...(input.hook_event_name === 'SessionEnd' ? {ended:true} : {}),
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await runHook(normalizeHook);
