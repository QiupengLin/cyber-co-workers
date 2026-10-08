import type { WorkerSession } from '../shared/types';
import { parseHookEvent, type HookSessionEvent } from '../shared/hook-event';

/** Routing enriches live observations; it never admits a session to the office. */
export class SessionRouting {
  private routes = new Map<string, { updatedAt: number; focusUrl?: string; ended: boolean }>();

  remember(value: HookSessionEvent): void {
    const event = parseHookEvent(value);
    if (!event || event.updatedAt > Date.now() + 5000) return;
    const previous = this.routes.get(event.id);
    if (previous && (event.updatedAt < previous.updatedAt ||
      (event.updatedAt === previous.updatedAt && previous.ended))) return;
    this.routes.set(event.id, {
      updatedAt: event.updatedAt,
      ended: event.ended === true,
      focusUrl: event.ended ? undefined : event.focusUrl ?? (previous?.ended ? undefined : previous?.focusUrl),
    });
  }

  apply(session: WorkerSession): WorkerSession {
    const route = this.routes.get(session.id);
    if (!route) return session;
    if (route.ended) return { ...session, focusUrl: undefined };
    return route.focusUrl ? { ...session, source: 'cli', focusUrl: route.focusUrl } : session;
  }
}
