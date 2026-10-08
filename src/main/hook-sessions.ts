import type { WorkerSession } from '../shared/types';
import type { HookSessionEvent } from './hooks';

export const HOOK_ACTIVITY_MS = 60_000;
export function sessionFromHook(event: HookSessionEvent, previous?: WorkerSession): WorkerSession {
  const label = event.harness === 'claude' ? 'Claude Code' : 'Codex';
  return {
    id:event.id, harness:event.harness,
    title:previous?.title ?? `${label} · ${event.project || event.id.slice(-6)}`,
    project:event.project ?? previous?.project ?? '',
    source:event.source === 'unknown' ? previous?.source ?? 'unknown' : event.source,
    status:event.status, detail:event.detail, updatedAt:event.updatedAt,
    desk:previous?.desk ?? -1, focusUrl:event.ended ? undefined : event.focusUrl ?? previous?.focusUrl,
  };
}
export function mergeHookSessions(sessions: WorkerSession[], events: Iterable<HookSessionEvent>, now = Date.now()): WorkerSession[] {
  const merged = new Map(sessions.map(session => [session.id, session]));
  for (const event of events) {
    if (event.updatedAt < now - HOOK_ACTIVITY_MS || event.updatedAt > now + 5000) continue;
    const previous = merged.get(event.id);
    if (!previous || previous.status === 'disconnected' || event.updatedAt >= previous.updatedAt) merged.set(event.id, sessionFromHook(event, previous));
  }
  return [...merged.values()];
}
