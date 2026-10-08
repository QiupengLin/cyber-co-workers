import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HookObserver, type HookSessionEvent } from './hooks';
import { OfficeStore } from './store';
import { normalizeThread } from './codex-state';
import { sessionTarget } from './navigation';
import { SessionRouting } from './session-routing';

const id = 'test-live-warp-session';
const focusUrl = 'warp://session/' + 'a'.repeat(32);
const liveSession = () => normalizeThread({id,source:'tui',name:'Test session',status:{type:'idle'}})!;
const hook = (overrides: Partial<HookSessionEvent> = {}): HookSessionEvent => ({
  id, status:'working', source:'cli', focusUrl, updatedAt:Date.now()-10*60_000, ...overrides,
});

for (const hookFirst of [false, true]) {
  test(`restart restores an old Warp destination with ${hookFirst ? 'hooks' : 'daemon'} observed first`, async () => {
    const dir = await mkdtemp(join(tmpdir(), 'office-navigation-'));
    const store = new OfficeStore();
    const routing = new SessionRouting();
    let received = false;
    let activityEvents = 0;
    if (!hookFirst) store.update([routing.apply(liveSession())], true, '');
    await writeFile(join(dir, 'b'.repeat(64)+'.json'), JSON.stringify(hook()), {mode:0o600});
    const observer = new HookObserver(() => { activityEvents++; }, dir, event => {
      routing.remember(event);
      const current = store.get(event.id);
      if (current) store.upsert(routing.apply(current));
      received = true;
    });
    try {
      observer.start();
      const deadline = Date.now()+1200;
      while (!received && Date.now()<deadline) await new Promise(resolve=>setTimeout(resolve,20));
      assert.equal(received,true);
      if (hookFirst) {
        assert.equal(store.snapshot().sessions.length,0,'historical routing cannot create an occupant');
        store.update([routing.apply(liveSession())], true, '');
      }
      assert.equal(sessionTarget(store.get(id)!),focusUrl);
      assert.equal(store.get(id)?.status,'idle','old activity must not override current daemon state');
      assert.equal(activityEvents,0,'stale hooks are routing only');
    } finally { observer.stop();await rm(dir,{recursive:true,force:true}); }
  });
}

test('newer hook without environment keeps a known destination and preserves live state', () => {
  const routing = new SessionRouting();
  routing.remember(hook());
  routing.remember(hook({focusUrl:undefined,source:'unknown',updatedAt:Date.now()}));
  const current = {...liveSession(),status:'waiting' as const,detail:'Approve command'};
  assert.deepEqual(routing.apply(current),{...current,source:'cli',focusUrl});
});

test('ended routing clears a destination and older events cannot revive it', () => {
  const routing = new SessionRouting();
  const endedAt = Date.now();
  routing.remember(hook());
  routing.remember(hook({ended:true,updatedAt:endedAt}));
  routing.remember(hook());
  routing.remember(hook({updatedAt:endedAt}));
  assert.equal(sessionTarget(routing.apply({...liveSession(),focusUrl})),undefined);
  const store = new OfficeStore();
  store.upsert({...liveSession(),focusUrl});
  store.upsert(routing.apply(store.get(id)!));
  assert.equal(store.get(id)?.focusUrl,undefined,'ended routing also clears an existing store association');
  routing.remember(hook({updatedAt:endedAt+1}));
  assert.equal(sessionTarget(routing.apply(liveSession())),focusUrl,'a new live hook may resume the session');
});

test('future and malformed routing cannot supply a destination', () => {
  for (const event of [hook({updatedAt:Date.now()+60_000}),hook({focusUrl:'https://example.com'}),hook({updatedAt:NaN})]) {
    const routing = new SessionRouting();
    routing.remember(event);
    assert.equal(sessionTarget(routing.apply(liveSession())),undefined);
  }
});
