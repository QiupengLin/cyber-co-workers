import type { WorkerSession, OfficeSnapshot } from '../shared/types';

export const DISCONNECTED_GRACE_MS = 30_000;

export class OfficeStore {
  private workers = new Map<string, WorkerSession>();
  private dismissed = new Set<string>();
  private desks = new Map<string, number>();
  // Retain expired entries so repeated disconnected observations cannot respawn them.
  private disconnectedSince = new Map<string, number>();
  connected = false;
  message = 'Waiting for local Codex or Claude Code activity…';

  constructor(private now: () => number = Date.now) {}

  update(sessions: WorkerSession[], connected: boolean, message: string) {
    this.connected = connected;
    this.message = message;
    const incoming = new Set(sessions.map(session => session.id));
    for (const [id, worker] of this.workers) {
      if (!incoming.has(id)) {
        this.upsert({ ...worker, status: 'disconnected', detail: 'Connection lost. This character will leave after 30 seconds unless it reconnects.' });
      }
    }
    for (const session of sessions) this.upsert(session);
    this.expireDisconnected();
  }

  upsert(session: WorkerSession) {
    if (this.dismissed.has(session.id)) return;
    if (session.status === 'disconnected') {
      if (!this.disconnectedSince.has(session.id)) this.disconnectedSince.set(session.id, this.now());
      if (this.now() - this.disconnectedSince.get(session.id)! >= DISCONNECTED_GRACE_MS) {
        this.removeOccupant(session.id);
        return;
      }
    } else {
      // Automatic removal is reversible when live evidence returns; manual dismissal is not.
      this.disconnectedSince.delete(session.id);
    }
    if (!this.desks.has(session.id)) {
      const occupied = new Set([...this.workers.values()].map(worker => worker.desk));
      let desk = 0;
      while (occupied.has(desk)) desk++;
      this.desks.set(session.id, desk);
    }
    const previous = this.workers.get(session.id);
    this.workers.set(session.id, {
      ...previous, ...session,
      focusUrl: Object.hasOwn(session, 'focusUrl') ? session.focusUrl : previous?.focusUrl,
      desk: this.desks.get(session.id)!,
    });
  }

  expireDisconnected(): boolean {
    let changed = false;
    for (const [id, since] of this.disconnectedSince) {
      if (this.workers.has(id) && this.now() - since >= DISCONNECTED_GRACE_MS) {
        this.removeOccupant(id);
        changed = true;
      }
    }
    return changed;
  }

  private removeOccupant(id: string) {
    this.workers.delete(id);
    this.desks.delete(id);
  }

  get(id: string) { return this.workers.get(id); }

  dismiss(id: string) {
    this.dismissed.add(id);
    this.disconnectedSince.delete(id);
    this.removeOccupant(id);
  }

  snapshot(): OfficeSnapshot {
    return {
      sessions: [...this.workers.values()].sort((a, b) => a.desk - b.desk),
      connected: this.connected, message: this.message, demo: false,
    };
  }
}
