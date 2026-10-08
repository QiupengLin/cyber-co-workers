import type { WorkerSession, WorkerStatus } from '../../shared/types';

export interface ThreadMetadata {
  id: string; name?: string | null; preview?: string; cwd?: string;
  updatedAt?: number; parentThreadId?: string | null; source?: unknown;
  originator?: string | null;
  status?: { type?: string; activeFlags?: string[] };
}

export function sessionSource(source: unknown, originator?: string | null): WorkerSession['source'] {
  if (/desktop|codex\.app/i.test(originator ?? '')) return 'desktop';
  if (source === 'cli' || /^codex[-_ ](?:tui|cli)$/i.test(originator ?? '')) return 'cli';
  return source === 'appServer' ? 'desktop' : 'unknown';
}

export function normalizeThread(thread: ThreadMetadata, previous?: WorkerSession): WorkerSession | null {
  if (!thread.id || thread.parentThreadId || (typeof thread.source === 'object' && thread.source !== null && 'subAgent' in thread.source)) return null;
  const flags = thread.status?.activeFlags ?? [];
  let status: WorkerStatus = 'disconnected';
  let detail = 'Codex has not provided a live status.';
  if (thread.status?.type === 'active') {
    status = flags.some(flag => flag === 'waitingOnApproval' || flag === 'waitingOnUserInput') ? 'waiting' : 'working';
    detail = flags.includes('waitingOnApproval') ? 'Waiting for your approval in Codex.' : flags.includes('waitingOnUserInput') ? 'Waiting for your answer in Codex.' : 'Codex is working on this session.';
  } else if (thread.status?.type === 'idle') {
    status = 'idle'; detail = 'Ready for another turn.';
  } else if (thread.status?.type === 'systemError') detail = 'Codex reported a session error. Open the session for details.';
  const source = sessionSource(thread.source, thread.originator);
  return {
    id: thread.id, title: (thread.name || thread.preview || 'Untitled session').replace(/\s+/g, ' ').slice(0, 90),
    project: thread.cwd || '', source, status, detail,
    updatedAt: typeof thread.updatedAt === 'number' ? thread.updatedAt * 1000 : Date.now(),
    desk: previous?.desk ?? -1,
    ...(source === 'desktop' ? { focusUrl: `codex://threads/${encodeURIComponent(thread.id)}` } : {}),
  };
}
