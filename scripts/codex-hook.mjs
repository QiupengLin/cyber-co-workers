#!/usr/bin/env node
// Optional Codex lifecycle observer. Never returns policy decisions or transcript data.
import { mkdir, lstat, writeFile, rename } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { join, basename } from 'node:path';
import { pathToFileURL } from 'node:url';

export function normalizeHook(input, env = process.env, now = Date.now()) {
  if (!input || typeof input !== 'object' || typeof input.session_id !== 'string' || !/^[\w-]{1,160}$/.test(input.session_id)) return null;
  const statuses = { SessionStart: 'idle', UserPromptSubmit: 'working', PreToolUse: 'working', PostToolUse: 'working', PermissionRequest: 'waiting', Stop: 'idle', Interrupt: 'idle', SessionEnd: 'disconnected' };
  const status = input.hook_event_name === 'SessionStart' && input.source === 'compact' ? 'working' : statuses[input.hook_event_name];
  if (!status) return null;
  const focusUrl = typeof env.WARP_FOCUS_URL === 'string' && /^war(?:p|ppreview):\/\/session\/[a-fA-F0-9]{32}$/.test(env.WARP_FOCUS_URL) ? env.WARP_FOCUS_URL : undefined;
  const project = typeof input.cwd === 'string' ? basename(input.cwd).slice(0,100) : undefined;
  const approvalDescription = input.hook_event_name === 'PermissionRequest' && input.tool_input && typeof input.tool_input.description === 'string' ? input.tool_input.description.replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0,240) : '';
  return {
    id: input.session_id, status, updatedAt: now, source: focusUrl ? 'cli' : 'unknown',
    ...(project ? { project } : {}), ...(focusUrl ? { focusUrl } : {}),
    ...(input.hook_event_name === 'PermissionRequest' ? { detail: approvalDescription || 'Waiting for permission in Codex' } : {}),
    ...(input.hook_event_name === 'SessionEnd' ? { ended: true } : {}),
  };
}

async function main() {
  const timeout = setTimeout(() => process.exit(0), 1200);
  try {
    const chunks = []; let size = 0;
    for await (const chunk of process.stdin) {
      size += chunk.length;
      if (size > 1024 * 1024) return;
      chunks.push(chunk);
    }
    const event = normalizeHook(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    if (!event) return;
    const root = process.env.CYBER_CO_WORKERS_EVENT_DIR || join(homedir(), '.local', 'share', 'cyber-co-workers', 'events');
    await mkdir(root, { recursive: true, mode: 0o700 });
    const stat = await lstat(root);
    if (!stat.isDirectory() || stat.isSymbolicLink() || (process.getuid && stat.uid !== process.getuid()) || (stat.mode & 0o077)) return;
    const file = createHash('sha256').update(event.id).digest('hex');
    const temporary = join(root, `${file}-${randomUUID()}.tmp`);
    await writeFile(temporary, JSON.stringify(event), { mode: 0o600, flag: 'wx' });
    await rename(temporary, join(root, `${file}.json`));
  } catch { /* Monitoring must never block or change a Codex turn. */ }
  finally { clearTimeout(timeout); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
