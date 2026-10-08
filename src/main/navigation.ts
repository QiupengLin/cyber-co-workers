import type { WorkerSession } from '../shared/types';
export function sessionTarget(session: WorkerSession): string | undefined {
 if (session.focusUrl && /^warp(?:preview)?:\/\/session\/[a-fA-F0-9]{32}\/?$/.test(session.focusUrl)) return session.focusUrl;
 if (session.harness !== 'claude' && session.source === 'desktop' && /^[a-zA-Z0-9_-]{1,150}$/.test(session.id)) return `codex://threads/${session.id}`;
 return undefined;
}
