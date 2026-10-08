import { sessionSource } from './codex-state';
import { readdir, stat, open } from 'node:fs/promises';
import { join, basename } from 'node:path';
import type { WorkerSession, WorkerStatus } from '../shared/types';

type Event = { timestamp?: string; type?: string; payload?: Record<string, any> };
type Cursor = { offset: number; remainder: string; session?: WorkerSession; lastSignal: number; waitingCall?: string };

/** Consume only structural event markers. No prompts, outputs or reasoning are retained. */
export function statusFromEvent(event: Event): WorkerStatus | undefined {
  const p = event.payload;
  if (!p) return;
  if (event.type === 'event_msg') {
    if (['task_complete', 'turn_complete', 'turn_aborted'].includes(p.type)) return 'idle';
    if (['task_started', 'turn_started'].includes(p.type)) return 'working';
    if (['approval_request', 'request_user_input'].includes(p.type)) return 'waiting';
  }
  if (event.type === 'response_item') {
    if (['function_call', 'custom_tool_call'].includes(p.type)) {
      return /request_user_input|ask_user/i.test(p.name ?? '') ? 'waiting' : 'working';
    }
    if (['reasoning', 'function_call_output', 'custom_tool_call_output'].includes(p.type)) return 'working';
  }
}

/** Best-effort fallback for desktop instances using a private stdio app-server. */
export class RolloutObserver {
  private startedAt = Date.now();
  private cursors = new Map<string, Cursor>();
  private root: string;
  constructor(codexHome: string) { this.root = join(codexHome, 'sessions'); }

  async poll(): Promise<WorkerSession[]> {
    const files = await this.files(this.root);
    for (const file of files) {
      try {
        const info = await stat(file);
        if (!this.cursors.has(file) && info.mtimeMs < this.startedAt) continue;
        let cursor = this.cursors.get(file);
        if (!cursor) {
          cursor = { offset: 0, remainder: '', lastSignal: 0 };
          const fd = await open(file, 'r');
          try {
            const buffer = Buffer.alloc(Math.min(info.size, 256 * 1024));
            const { bytesRead } = await fd.read(buffer, 0, buffer.length, 0);
            const firstLine = buffer.subarray(0, bytesRead).toString().split('\n')[0];
            const meta = JSON.parse(firstLine)?.payload;
            if (!meta?.id || meta.parent_thread_id || typeof meta.source === 'object') {
              this.cursors.set(file, { ...cursor, offset: info.size }); continue;
            }
            const source = sessionSource(meta.source, meta.originator);
            cursor.session = { id: meta.id, title: `${basename(meta.cwd || '') || 'Codex'} · ${meta.id.slice(-6)}`, project: meta.cwd || '', source, status: 'disconnected', detail: 'Waiting for a fresh Codex activity event.', desk: -1, updatedAt: Date.now(), ...(source === 'desktop' ? { focusUrl: `codex://threads/${encodeURIComponent(meta.id)}` } : {}) };
            // On first observation inspect only a bounded tail; timestamps exclude old activity.
            cursor.offset = Math.max(0, info.size - 256 * 1024);
            if (cursor.offset > 0) cursor.remainder = '__discard_partial__';
          } finally { await fd.close(); }
          this.cursors.set(file, cursor);
        }
        if (!cursor.session || cursor.offset === info.size) continue;
        if (info.size < cursor.offset) { cursor.offset = 0; cursor.remainder = ''; }
        const fd = await open(file, 'r');
        try {
          // Bounded I/O per poll; catch up incrementally if a tool writes a large output.
          const buffer = Buffer.alloc(Math.min(info.size - cursor.offset, 1024 * 1024));
          const { bytesRead } = await fd.read(buffer, 0, buffer.length, cursor.offset);
          cursor.offset += bytesRead;
          const text = buffer.subarray(0, bytesRead).toString();
          const lines = (cursor.remainder + text).split('\n');
          cursor.remainder = lines.pop() || '';
          if (cursor.remainder.length > 2 * 1024 * 1024) cursor.remainder = '__discard_partial__';
          for (const line of lines) {
            let event: Event;
            try { event = JSON.parse(line); } catch { continue; }
            const timestamp = Date.parse(event.timestamp || '');
            if (!Number.isFinite(timestamp) || timestamp < this.startedAt) continue;
            let status = statusFromEvent(event);
            if (!status) continue;
            const payload = event.payload!;
            if (status === 'waiting' && typeof payload.call_id === 'string') cursor.waitingCall = payload.call_id;
            else if (status === 'idle') cursor.waitingCall = undefined;
            else if (cursor.waitingCall) {
              if (payload.call_id === cursor.waitingCall && /tool_call_output|function_call_output/.test(payload.type ?? '')) cursor.waitingCall = undefined;
              else status = 'waiting';
            }
            cursor.lastSignal = timestamp;
            cursor.session = { ...cursor.session, status, updatedAt: timestamp, detail: status === 'waiting' ? 'Codex requested input. Open the session for the question.' : status === 'working' ? 'Activity detected in the local Codex event log.' : 'Codex finished or interrupted its turn.' };
          }
        } finally { await fd.close(); }
      } catch {
        const cursor = this.cursors.get(file);
        if (cursor?.session) cursor.session = { ...cursor.session, status: 'disconnected', detail: 'The local Codex event log is unavailable.' };
      }
    }
    const sessions: WorkerSession[] = [];
    for (const cursor of this.cursors.values()) {
      if (!cursor.session || !cursor.lastSignal) continue;
      sessions.push(cursor.session);
    }
    return sessions;
  }
  private async files(directory: string, depth = 0): Promise<string[]> {
    if (depth > 3) return [];
    let entries; try { entries = await readdir(directory, { withFileTypes: true }); } catch { return []; }
    const files: string[] = [];
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) files.push(...await this.files(path, depth + 1));
      else if (entry.name.endsWith('.jsonl')) files.push(path);
    }
    return files;
  }
}
