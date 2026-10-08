import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeThread } from './codex-state';
import { statusFromEvent } from './codex-rollouts';

test('waiting flags override active; unknown states never become idle', () => {
  assert.equal(normalizeThread({ id: 'a', status: { type: 'active', activeFlags: ['waitingOnApproval'] } })?.status, 'waiting');
  assert.equal(normalizeThread({ id: 'a', status: { type: 'futureState' } })?.status, 'disconnected');
  assert.equal(normalizeThread({ id: 'a', status: { type: 'idle' } })?.status, 'idle');
});
test('desktop originator is recognized even with vscode source; subagents excluded', () => {
  assert.equal(normalizeThread({ id: 'a', source: 'vscode', originator: 'Codex Desktop' })?.source, 'desktop');
  assert.equal(normalizeThread({ id: 'a', parentThreadId: 'parent' }), null);
  assert.equal(normalizeThread({ id: 'a', source: { subAgent: {} } }), null);
});
test('log fallback uses explicit completion, input request, and tool markers only', () => {
  assert.equal(statusFromEvent({ type: 'event_msg', payload: { type: 'task_complete' } }), 'idle');
  assert.equal(statusFromEvent({ type: 'response_item', payload: { type: 'function_call', name: 'request_user_input' } }), 'waiting');
  assert.equal(statusFromEvent({ type: 'response_item', payload: { type: 'custom_tool_call', name: 'exec' } }), 'working');
  assert.equal(statusFromEvent({ type: 'event_msg', payload: { type: 'token_count' } }), undefined);
  assert.equal(statusFromEvent({ type: 'response_item', payload: { type: 'message', role: 'assistant' } }), undefined);
});

import { mkdtemp, mkdir, writeFile, appendFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RolloutObserver } from './codex-rollouts';

test('fresh rollout discovery excludes history and subagents, retains completion as idle', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cyber-observer-'));
  try {
    const sessions = join(directory, 'sessions'); await mkdir(sessions);
    const history = join(sessions, 'history.jsonl');
    const meta = (id: string, parent?: string) => JSON.stringify({ type: 'session_meta', payload: { id, cwd: '/project', originator: 'Codex Desktop', source: 'vscode', parent_thread_id: parent } }) + '\n';
    await writeFile(history, meta('old') + JSON.stringify({ timestamp: '2020-01-01T00:00:00Z', type: 'event_msg', payload: { type: 'task_started' } }) + '\n');
    const observer = new RolloutObserver(directory);
    const event = (type: string) => JSON.stringify({ timestamp: new Date().toISOString(), type: 'event_msg', payload: { type } }) + '\n';
    const active = join(sessions, 'live.jsonl');
    await writeFile(active, meta('live') + event('task_started'));
    await writeFile(join(sessions, 'child.jsonl'), meta('child', 'live') + event('task_started'));
    const first = await observer.poll();
    assert.deepEqual(first.map(s => [s.id, s.status]), [['live', 'working']]);
    await appendFile(active, event('task_complete'));
    assert.equal((await observer.poll())[0].status, 'idle');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
