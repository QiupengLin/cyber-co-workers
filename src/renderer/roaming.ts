// Idle co-workers take breaks around the office: coffee nook, common room sofa, or ping-pong.
// Pure movement logic (no canvas) so it can be unit tested.
export type Point = { x: number; y: number };
export type Activity = 'coffee' | 'lounge' | 'pingpong';
export type Spot = Point & { activity: Activity };
export type Pose = Point & { walking: boolean; activity?: Activity; mug: boolean };
export type Actor = { id: string; slot: number; idle: boolean };

export const deskPosition = (index: number): Point => ({ x: 365 + (index % 4) * 195, y: 340 + Math.floor(index / 4) * 165 });
export const seatOf = (slot: number): Point => { const d = deskPosition(slot); return { x: d.x, y: d.y + 24 }; };
export const spots: Spot[] = [
  { activity: 'coffee', x: 270, y: 556 }, { activity: 'coffee', x: 280, y: 606 },
  { activity: 'lounge', x: 378, y: 212 }, { activity: 'lounge', x: 531, y: 212 },
  { activity: 'pingpong', x: 748, y: 206 }, { activity: 'pingpong', x: 1022, y: 206 },
];
// Clear lanes: vertical gaps between desk columns, and the aisle under the common room.
const gaps = [285, 462, 657, 852, 1047];
const topAisle = 270;

/** Route from a desk seat to a spot using only aisles (never through desks). */
export function route(slot: number, spot: Spot): Point[] {
  const seat = seatOf(slot);
  const front = { x: seat.x, y: deskPosition(slot).y + 62 };
  if (spot.activity === 'coffee') return [seat, front, { x: gaps[0], y: front.y }, { x: gaps[0], y: spot.y }, spot];
  const col = slot % 4; // desk column sits between gaps[col] and gaps[col + 1]
  const gap = Math.abs(gaps[col] - spot.x) <= Math.abs(gaps[col + 1] - spot.x) ? gaps[col] : gaps[col + 1];
  return [seat, front, { x: gap, y: front.y }, { x: gap, y: topAisle }, { x: spot.x, y: topAisle }, spot];
}

type Phase = 'seated' | 'out' | 'there' | 'back';
type Roamer = { phase: Phase; pos: Point; path: Point[]; spot?: Spot; timer: number; mug: boolean; slot: number };
const SPEED = 70, HURRY = 120;
const stay: Record<Activity, [number, number]> = { coffee: [10, 18], lounge: [20, 35], pingpong: [25, 40] };

export class Roaming {
  private roamers = new Map<string, Roamer>();
  constructor(private rng: () => number = Math.random) {}
  private between([a, b]: [number, number]) { return a + (b - a) * this.rng(); }
  private taken(spot: Spot) { for (const r of this.roamers.values()) if (r.spot === spot) return true; return false; }

  private pickSpot(): Spot | undefined {
    const free = spots.filter(s => !this.taken(s));
    // Join a lone ping-pong player first so there is a rally.
    const partner = free.find(s => s.activity === 'pingpong' && spots.some(o => o !== s && o.activity === 'pingpong' && this.taken(o)));
    if (partner && this.rng() < 0.6) return partner;
    return free.length ? free[Math.floor(this.rng() * free.length)] : undefined;
  }

  update(dt: number, actors: Actor[]): Map<string, Pose> {
    for (const id of this.roamers.keys()) if (!actors.some(a => a.id === id)) this.roamers.delete(id);
    const poses = new Map<string, Pose>();
    for (const a of actors) {
      let r = this.roamers.get(a.id);
      if (!r) { r = { phase: 'seated', pos: seatOf(a.slot), path: [], timer: this.between([2, 6]), mug: false, slot: a.slot }; this.roamers.set(a.id, r); }
      if (r.phase === 'seated' && r.slot !== a.slot) r.pos = seatOf(a.slot);
      r.slot = a.slot;
      this.step(r, a, dt);
      poses.set(a.id, { x: r.pos.x, y: r.pos.y, walking: r.phase === 'out' || r.phase === 'back', activity: r.phase === 'there' ? r.spot?.activity : undefined, mug: r.mug || (r.phase === 'there' && r.spot?.activity === 'coffee') });
    }
    return poses;
  }

  /** Spots with someone currently standing at them (not just walking over). */
  occupied(activity: Activity) { let n = 0; for (const r of this.roamers.values()) if (r.phase === 'there' && r.spot?.activity === activity) n++; return n; }

  private goBack(r: Roamer) {
    // Retrace the walked part of the route so the trip home also stays in the aisles.
    if (r.phase === 'there' && r.spot?.activity === 'coffee') r.mug = true;
    r.path = [...r.path].reverse(); r.phase = 'back'; r.spot = undefined;
  }

  private step(r: Roamer, a: Actor, dt: number) {
    if (!a.idle && (r.phase === 'out' || r.phase === 'there')) {
      const full = r.spot ? route(r.slot, r.spot) : [];
      // Keep only the waypoints already passed, then head home from the current position.
      r.path = r.phase === 'there' ? full : full.slice(0, full.length - r.path.length);
      r.path.push({ ...r.pos }); this.goBack(r); r.path.shift();
    }
    if (r.phase === 'seated') {
      r.pos = seatOf(r.slot);
      if (!a.idle) { r.timer = Math.max(r.timer, this.between([2, 6])); return; }
      if ((r.timer -= dt) > 0) return;
      const spot = this.pickSpot();
      if (!spot) { r.timer = this.between([5, 10]); return; }
      r.spot = spot; r.mug = false; r.path = route(r.slot, spot).slice(1); r.phase = 'out';
    } else if (r.phase === 'there') {
      if ((r.timer -= dt) <= 0) { r.path = route(r.slot, r.spot!).slice(0, -1); this.goBack(r); }
    } else if (this.walk(r, dt * (a.idle ? SPEED : HURRY))) {
      if (r.phase === 'out') { r.phase = 'there'; r.timer = this.between(stay[r.spot!.activity]); }
      else { r.phase = 'seated'; r.pos = seatOf(r.slot); r.timer = this.between([15, 30]); }
    }
  }

  /** Advance along the path; true once the last waypoint is reached. */
  private walk(r: Roamer, dist: number) {
    while (r.path.length && dist > 0) {
      const t = r.path[0], dx = t.x - r.pos.x, dy = t.y - r.pos.y, len = Math.hypot(dx, dy);
      if (len <= dist) { r.pos = { x: t.x, y: t.y }; r.path.shift(); dist -= len; }
      else { r.pos = { x: r.pos.x + dx / len * dist, y: r.pos.y + dy / len * dist }; dist = 0; }
    }
    return r.path.length === 0;
  }
}
