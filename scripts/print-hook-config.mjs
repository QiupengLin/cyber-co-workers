#!/usr/bin/env node
// Prints a reviewable config; never touches the user's Codex configuration.
import { fileURLToPath } from 'node:url';
const quote = s => "'" + s.replaceAll("'", "'\\''") + "'";
const harness = process.argv[2] || 'codex';
if (!['codex', 'claude'].includes(harness)) throw new Error('Expected codex or claude');
const command = `${quote(process.execPath)} ${quote(fileURLToPath(new URL(`./${harness}-hook.mjs`, import.meta.url)))}`;
const events = harness === 'claude' ? ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PermissionRequest', 'Notification', 'Stop', 'StopFailure', 'SessionEnd', 'PreCompact', 'PostCompact', 'Elicitation', 'ElicitationResult'] : ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PermissionRequest', 'Stop', 'Interrupt', 'SessionEnd'];
console.log(JSON.stringify({hooks:Object.fromEntries(events.map(event => [event,[{hooks:[{type:'command',command,timeout:2}]}]]))},null,2));
