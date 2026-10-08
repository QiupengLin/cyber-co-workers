import type { WorkerSession, OfficeSnapshot } from '../shared/types';
export class OfficeStore {
 private workers = new Map<string, WorkerSession>();
 private dismissed = new Set<string>();
 private desks = new Map<string, number>();
 connected = false;
 message = 'Connecting to Codex…';
 update(sessions: WorkerSession[], connected: boolean, message: string) {
  this.connected = connected; this.message = message;
  const incoming = new Set(sessions.map(s=>s.id));
  for (const [id, worker] of this.workers) {
   if (!incoming.has(id)) this.workers.set(id, {...worker, status:'disconnected', detail:'Session is no longer observable. Dismiss it when finished.'});
  }
  for (const session of sessions) this.upsert(session);
 }
 upsert(session: WorkerSession) {
  if (this.dismissed.has(session.id)) return;
  if (!this.desks.has(session.id)) {
   const occupied = new Set([...this.workers.values()].map(s=>s.desk));
   let desk=0; while(occupied.has(desk)) desk++;
   this.desks.set(session.id,desk);
  }
  const previous = this.workers.get(session.id);
  this.workers.set(session.id,{...previous,...session,focusUrl:session.focusUrl ?? previous?.focusUrl,desk:this.desks.get(session.id)!});
 }
 get(id: string) { return this.workers.get(id); }
 dismiss(id: string) { this.dismissed.add(id); this.workers.delete(id); this.desks.delete(id); }
 snapshot(): OfficeSnapshot { return {sessions:[...this.workers.values()].sort((a,b)=>a.desk-b.desk),connected:this.connected,message:this.message,demo:false}; }
}
