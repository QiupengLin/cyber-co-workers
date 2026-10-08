import WebSocket from 'ws';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { WorkerSession } from '../../shared/types';
import { normalizeThread, type ThreadMetadata } from './codex-state';
import { RolloutObserver } from './codex-rollouts';

type Pending = { resolve: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };

/** Read-only observer: never starts/resumes threads or subscribes to their ownership. */
export class CodexObserver {
  private socket?: WebSocket;
  private timer?: ReturnType<typeof setTimeout>;
  private stopped = true;
  private rolloutTimer?: ReturnType<typeof setTimeout>;
  private rollouts = new RolloutObserver(process.env.CODEX_HOME || join(homedir(), '.codex'));
  private rolloutSessions: WorkerSession[] = [];
  private daemonConnected = false;
  private pending = new Map<number, Pending>();
  private sequence = 0;
  private sessions = new Map<string, WorkerSession>();
  private dismissed = new Set<string>();
  constructor(private onChange: (sessions: WorkerSession[], connected: boolean, message: string) => void) {}

  start(): void { if (!this.stopped) return; this.stopped = false; this.connect(); void this.pollRollouts(); }
  stop(): void {
    this.stopped = true;
    clearTimeout(this.timer);
    clearTimeout(this.rolloutTimer);
    this.socket?.terminate();
    this.rejectPending();
  }
  dismiss(id: string): void { this.dismissed.add(id); this.sessions.delete(id); this.rolloutSessions = this.rolloutSessions.filter(session => session.id !== id); this.publish(this.socket?.readyState === WebSocket.OPEN, 'Session dismissed from the office.'); }

  private connect(): void {
    if (this.stopped) return;
    const codexHome = process.env.CODEX_HOME || join(homedir(), '.codex');
    const socketPath = process.env.CYBER_CODEX_SOCKET || join(codexHome, 'app-server-control', 'app-server-control.sock');
    const socket = new WebSocket(`ws+unix://${socketPath}:/`, { handshakeTimeout: 4000, maxPayload: 16 * 1024 * 1024 });
    this.socket = socket;
    socket.on('message', data => {
      try {
        const message = JSON.parse(data.toString());
        // Unsolicited notifications and server requests are deliberately ignored.
        // This connection cannot answer approvals, take control, or send input.
        const pending = this.pending.get(message.id);
        if (!pending) return;
        clearTimeout(pending.timer); this.pending.delete(message.id);
        if (message.error) pending.reject(new Error('Codex rejected a metadata request.'));
        else pending.resolve(message.result);
      } catch { /* Ignore non-JSON or unrelated frames. */ }
    });
    socket.on('open', async () => {
      try {
        await this.request('initialize', { clientInfo: { name: 'cyber_coworkers', title: 'Cyber Co-workers', version: '0.1.0' }, capabilities: { experimentalApi: true, requestAttestation: false } });
        socket.send(JSON.stringify({ method: 'initialized' }));
        await this.poll();
      } catch { socket.terminate(); }
    });
    socket.on('error', () => { /* close below handles reconnect and visible status. */ });
    socket.on('close', () => {
      if (this.socket !== socket) return;
      this.rejectPending();
      for (const [id, session] of this.sessions) this.sessions.set(id, { ...session, status: 'disconnected', detail: 'Connection to the Codex daemon was lost.' });
      if (!this.stopped) {
        this.publish(false, 'Codex daemon unavailable. Open Codex; reconnecting automatically. CLI hooks can still report activity.');
        clearTimeout(this.timer); this.timer = setTimeout(() => this.connect(), 5000);
      }
    });
  }

  private request(method: string, params: unknown): Promise<any> {
    return new Promise((resolve, reject) => {
      const socket = this.socket;
      if (!socket || socket.readyState !== WebSocket.OPEN) { reject(new Error('Disconnected')); return; }
      const id = ++this.sequence;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('Codex metadata request timed out.')); }, 6000);
      this.pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params }), error => { if (error) { clearTimeout(timer); this.pending.delete(id); reject(error); } });
    });
  }

  private async poll(): Promise<void> {
    try {
      const ids: string[] = [];
      let cursor: string | null = null;
      do {
        const page: { data: string[]; nextCursor?: string | null } = await this.request('thread/loaded/list', { limit: 100, cursor });
        if (!Array.isArray(page.data)) throw new Error('Unsupported Codex response');
        ids.push(...page.data.filter(id => typeof id === 'string'));
        cursor = page.nextCursor ?? null;
      } while (cursor && ids.length < 1000);
      // Do not enumerate historical thread/list results: only loaded, live sessions enter.
      const results = await Promise.allSettled(ids.filter(id => !this.dismissed.has(id)).map(async id => {
        const result = await this.request('thread/read', { threadId: id, includeTurns: false });
        return { id, thread: result.thread as ThreadMetadata };
      }));
      for (const [id, session] of this.sessions) {
        if (!ids.includes(id)) this.sessions.set(id, { ...session, status: 'disconnected', detail: 'This session is no longer loaded in Codex. Dismiss it when finished.' });
      }
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          const { id, thread } = result.value;
          const session = normalizeThread(thread, this.sessions.get(id));
          if (session) this.sessions.set(id, session);
        } else {
          const id = ids.filter(id => !this.dismissed.has(id))[index];
          const session = this.sessions.get(id);
          if (session) this.sessions.set(id, { ...session, status: 'disconnected', detail: 'Could not read this session’s current status.' });
        }
      });
      if (this.stopped) return;
      this.publish(true, 'Live Codex daemon connected · metadata refreshed every 2 seconds');
      this.timer = setTimeout(() => void this.poll(), 2000);
    } catch { this.socket?.terminate(); }
  }
  private rejectPending(): void { for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error('Disconnected')); } this.pending.clear(); }
  private async pollRollouts(): Promise<void> {
    try { this.rolloutSessions = await this.rollouts.poll(); } catch { /* Retry without erasing known sessions. */ }
    if (this.stopped) return;
    this.publish(this.daemonConnected, 'Watching local Codex activity');
    this.rolloutTimer = setTimeout(() => void this.pollRollouts(), 2000);
  }
  private publish(connected: boolean, message: string): void {
    this.daemonConnected = connected;
    const merged = new Map(this.rolloutSessions.filter(session => !this.dismissed.has(session.id)).map(session => [session.id, session]));
    for (const session of this.sessions.values()) {
      if (session.status !== 'disconnected' || !merged.has(session.id)) merged.set(session.id, session);
    }
    const hasLogs = this.rolloutSessions.some(session => !this.dismissed.has(session.id));
    this.onChange([...merged.values()], connected || hasLogs, hasLogs
      ? 'Watching local Codex event logs · desktop fallback · status may lag; approval details need hooks'
      : message);
  }
}
