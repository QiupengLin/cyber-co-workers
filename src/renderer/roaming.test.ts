import test from 'node:test';
import assert from 'node:assert/strict';
import { Roaming, deskPosition, route, seatOf, spots } from './roaming';

const run = (roaming: Roaming, seconds: number, actors: Parameters<Roaming['update']>[1]) => {
  let poses = roaming.update(0, actors);
  for (let t = 0; t < seconds; t += 0.05) poses = roaming.update(0.05, actors);
  return poses;
};

test('routes never cut through a desk', () => {
  const desks = Array.from({ length: 8 }, (_, i) => deskPosition(i));
  for (let slot = 0; slot < 8; slot++) for (const spot of spots) {
    const path = route(slot, spot);
    for (let k = 1; k < path.length; k++) for (let f = 0; f <= 1; f += 0.02) {
      const x = path[k - 1].x + (path[k].x - path[k - 1].x) * f, y = path[k - 1].y + (path[k].y - path[k - 1].y) * f;
      for (const [d, desk] of desks.entries()) {
        if (d === slot) continue; // leaving your own desk is fine
        const inside = Math.abs(x - desk.x) < 51 + 15 && y > desk.y - 44 && y < desk.y + 48;
        assert.ok(!inside, `slot ${slot} → ${spot.activity} crosses desk ${d} at ${x},${y}`);
      }
    }
  }
});

test('idle co-workers leave for a break and come back to their seat', () => {
  const roaming = new Roaming(() => 0.5);
  const actor = { id: 'a', slot: 5, idle: true };
  let pose = run(roaming, 4, [actor]).get('a')!;
  assert.equal(pose.walking, true, 'starts walking after the short idle delay');
  pose = run(roaming, 30, [actor]).get('a')!;
  assert.ok(pose.activity, 'arrives at an activity spot');
  pose = run(roaming, 90, [{ ...actor, idle: false }]).get('a')!;
  assert.deepEqual({ x: pose.x, y: pose.y, walking: pose.walking }, { ...seatOf(5), walking: false });
});

test('working co-workers stay at their desk', () => {
  const pose = run(new Roaming(() => 0.5), 60, [{ id: 'a', slot: 0, idle: false }]).get('a')!;
  assert.deepEqual({ x: pose.x, y: pose.y }, seatOf(0));
});

test('a recall mid-walk heads straight home', () => {
  const roaming = new Roaming(() => 0.5);
  run(roaming, 6, [{ id: 'a', slot: 7, idle: true }]);
  const pose = run(roaming, 20, [{ id: 'a', slot: 7, idle: false }]).get('a')!;
  assert.deepEqual({ x: pose.x, y: pose.y, mug: pose.mug }, { ...seatOf(7), mug: false });
});

test('two co-workers never share a spot and a second player joins ping-pong', () => {
  let i = 0; const picks = [0.9, 0.1]; // first picks the last free spot (ping-pong), second would pick coffee
  const roaming = new Roaming(() => picks[i++ % 2] ?? 0.5);
  const actors = [{ id: 'a', slot: 0, idle: true }, { id: 'b', slot: 3, idle: true }];
  const poses = run(roaming, 25, actors);
  assert.equal(poses.get('a')!.activity, 'pingpong');
  assert.equal(poses.get('b')!.activity, 'pingpong');
  assert.notDeepEqual([poses.get('a')!.x, poses.get('a')!.y], [poses.get('b')!.x, poses.get('b')!.y]);
  assert.equal(roaming.occupied('pingpong'), 2);
});
