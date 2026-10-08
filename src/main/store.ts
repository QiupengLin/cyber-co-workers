import type { WorkerSession, OfficeSnapshot } from '../shared/types';

export class OfficeStore {
  private workers = new Map<string, WorkerSession>();
  private dismissed = new Set<string>();
  private desks = new Map<string, number>();
  connected = false;
  message = 'Waiting for local Codex or Claude Code activity…';

  update(sessions: WorkerSession[], connected: boolean, message: string) {
    this.connected = connected;
    this.message = message;
    for (const session of sessions) this.upsert(session);
  }

  upsert(session: WorkerSession) {
    if (this.dismissed.has(session.id)) return;
    if (session.ended) { this.removeOccupant(session.id); return; }
    // Missing transport evidence is not evidence that the user closed a session.
    if (session.status === 'disconnected') return;
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

  private removeOccupant(id: string) {
    this.workers.delete(id);
    this.desks.delete(id);
  }

  get(id: string) { return this.workers.get(id); }

  dismiss(id: string) {
    this.dismissed.add(id);
    this.removeOccupant(id);
  }

  snapshot(): OfficeSnapshot {
    return {
      sessions: [...this.workers.values()].sort((a, b) => a.desk - b.desk),
      connected: this.connected, message: this.message, demo: false,
    };
  }
}
