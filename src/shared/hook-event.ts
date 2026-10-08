import type { WorkerSession } from './types';

export interface HookSessionEvent extends Pick<WorkerSession, 'id' | 'status' | 'updatedAt' | 'source' | 'harness'> {
  title?: string;
  project?: string;
  detail?: string;
  focusUrl?: string;
  ended?: boolean;
}
export function parseHookEvent(value: unknown): HookSessionEvent | undefined {
  if (!value || typeof value !== 'object') return;
  const e = value as Record<string, unknown>;
  if (typeof e.id !== 'string' || !/^(?:[\w-]{1,160}|claude:[\w-]{1,160})$/.test(e.id) || typeof e.updatedAt !== 'number' || !Number.isFinite(e.updatedAt)) return;
  if (!['working', 'idle', 'waiting', 'disconnected'].includes(String(e.status))) return;
  if ((e.harness === 'claude') !== e.id.startsWith('claude:')) return;
  const label = e.harness === 'claude' ? 'Claude Code' : 'Codex';
  const focusUrl = typeof e.focusUrl === 'string' && /^war(?:p|ppreview):\/\/session\/[a-fA-F0-9]{32}$/.test(e.focusUrl) ? e.focusUrl : undefined;
  return {
    id: e.id, status: e.status as WorkerSession['status'], updatedAt: e.updatedAt,
    source: focusUrl || e.harness === 'claude' ? 'cli' : 'unknown',
    ...(e.harness === 'claude' ? { harness: 'claude' as const } : {}),
    ...(typeof e.project === 'string' ? { project: e.project.slice(0, 100) } : {}),
    ...(e.status === 'waiting' ? { detail: typeof e.detail === 'string' ? e.detail.replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0,240) || `Waiting for permission in ${label}` : `Waiting for permission in ${label}` } : {}),
    ...(focusUrl ? { focusUrl } : {}), ...(e.ended === true ? { ended: true } : {}),
  };
}
