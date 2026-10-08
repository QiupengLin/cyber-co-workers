#!/usr/bin/env node
// Prints a reviewable config; never touches the user's Codex configuration.
import { fileURLToPath } from 'node:url';
const quote = s => "'" + s.replaceAll("'", "'\\''") + "'";
const command = `${quote(process.execPath)} ${quote(fileURLToPath(new URL('./codex-hook.mjs', import.meta.url)))}`;
const events = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PermissionRequest', 'Stop', 'Interrupt', 'SessionEnd'];
console.log(JSON.stringify({hooks:Object.fromEntries(events.map(event => [event,[{hooks:[{type:'command',command,timeout:2}]}]]))},null,2));
