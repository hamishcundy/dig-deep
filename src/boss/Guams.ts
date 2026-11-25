import { GUAMS, TILE } from '../config';
import type { Pod } from '../pod/Pod';
import { Tile } from '../world/tiles';
import type { World } from '../world/World';
import { POSES, SKETCH_SCALE, offset, type GuamsPose } from './guamsShape';

export type GuamsState = 'asleep' | 'waking' | 'guard' | 'fly' | 'swoopWindup' | 'swoop' | 'rear' | 'breath' | 'reel' | 'defeated';

// What happened this frame, for the game scene to act on.
export interface GuamsFrame {
  damage: number; // hull the pod loses
  knock: { x: number; y: number } | null; // speed (px/s) to throw the pod at
  woke: boolean;
  started: 'breath' | 'swoop' | null; // an attack that just began (after its windup)
  light: [number, number][]; // blast clouds his body or breath touched
}

export type GuamsBlast = 'woke' | 'armour' | 'hit' | 'defeated' | null;

const WAKE_TIME = 1.4; // seconds to rise off the hoard
const UP_ALLOWANCE = 0.17; // radians the breath can aim above level
const REAR_MIN_Y = 3.8 * TILE; // highest he rears up, so his head stays on screen

// Guams' behaviour. Asleep on his hoard until stirred; then, whenever the pod is
// in his lair, he flies at it: swooping, or rearing up to breathe fire. Away from
// the lair he hovers over the hoard on guard. He ignores the islands as he flies,
// but sets off any blast cloud he touches.
export class Guams {
  x: number; // position (px): the middle of his body
  y: number;
  vx = 0;
  vy = 0;
  state: GuamsState;
  facing: -1 | 1 = -1; // -1 faces left
  aim = Math.PI; // breath direction (radians)
  hits: number;
  stirs: number;
  readonly stirsToWake: number;
  private time = 0; // seconds in the current state
  private cooldown = 1;
  private nextAttack: 'swoop' | 'breath' = 'breath';
  private swoopTime = 0;
  private swoopHit = false;
  private readonly perch: { x: number; y: number };
  private readonly guardSpot: { x: number; y: number };

  constructor(
    private world: World,
    saved: { hits: number; stirs: number; awake: boolean },
  ) {
    const { x, top } = world.lairCentre;
    this.perch = { x, y: top - (POSES.asleep.box[3] - POSES.asleep.origin[1]) * SKETCH_SCALE };
    this.guardSpot = { x, y: top - 2.6 * TILE };
    const [lo, hi] = GUAMS.stirsToWake;
    const span = hi - lo + 1;
    this.stirsToWake = lo + (((world.seed % span) + span) % span);
    this.hits = saved.hits;
    this.stirs = saved.stirs;
    this.state = saved.awake ? 'guard' : 'asleep';
    const at = saved.awake ? this.guardSpot : this.perch;
    this.x = at.x;
    this.y = at.y;
  }

  get pose(): GuamsPose {
    if (this.state === 'asleep' || (this.state === 'waking' && this.time < 0.5)) return 'asleep';
    if (this.patchShowing) return 'rear';
    return 'fly';
  }

  get awake(): boolean {
    return this.state !== 'asleep' && this.state !== 'defeated';
  }

  // The bare patch on his chest shows while he rears up to breathe, and while he reels.
  get patchShowing(): boolean {
    return this.state === 'rear' || this.state === 'breath' || this.state === 'reel';
  }

  // 0..1 through rearing up, for the drawing to build up to the breath.
  get windup(): number {
    return this.state === 'rear' ? Math.min(1, this.time / GUAMS.breath.windup) : this.state === 'breath' ? 1 : 0;
  }

  get mouth(): { x: number; y: number } {
    return this.point(POSES[this.pose].mouth);
  }

  get patch(): { x: number; y: number } {
    return this.point(POSES[this.pose].patch);
  }

  // The part of him that hurts to touch (px).
  get body(): { x0: number; y0: number; x1: number; y1: number } {
    const [x0, y0, x1, y1] = POSES[this.pose].box;
    const a = this.point([x0, y0]);
    const b = this.point([x1, y1]);
    return { x0: Math.min(a.x, b.x), y0: a.y, x1: Math.max(a.x, b.x), y1: b.y };
  }

  // Taking a hoard tile while he sleeps stirs him; enough of them wake him.
  stir(): 'stirred' | 'woke' | null {
    if (this.state !== 'asleep') return null;
    this.stirs++;
    if (this.stirs < this.stirsToWake) return 'stirred';
    this.begin('waking');
    return 'woke';
  }

  // After the pod is lost: back on guard over the hoard; asleep stays asleep.
  reset(): void {
    if (!this.awake) return;
    this.begin('guard');
    this.x = this.guardSpot.x;
    this.y = this.guardSpot.y;
    this.vx = this.vy = 0;
  }

  update(dt: number, pod: Pod): GuamsFrame {
    const frame: GuamsFrame = { damage: 0, knock: null, woke: false, started: null, light: [] };
    if (this.state === 'defeated') return frame;
    const px = pod.x + pod.w / 2;
    const py = pod.y + pod.h / 2;
    const inLair = py < GUAMS.arenaRows * TILE;
    const touching = this.touches(pod);
    this.time += dt;

    if (this.state === 'asleep') {
      if (!touching) return frame;
      this.begin('waking');
    }
    if (this.state === 'waking' && this.time <= dt) frame.woke = true;

    const { breath, swoop } = GUAMS;
    switch (this.state) {
      case 'waking':
        this.steer(this.perch.x, this.perch.y - 1.6 * TILE, dt, 0.5);
        if (this.time >= WAKE_TIME) this.begin(inLair ? 'fly' : 'guard', 1);
        break;
      case 'guard':
        this.steer(this.guardSpot.x, this.guardSpot.y + Math.sin(this.time * 2) * 0.3 * TILE, dt, 0.6);
        if (inLair) this.begin('fly', 1);
        break;
      case 'fly': {
        if (!inLair) {
          this.begin('guard');
          break;
        }
        this.face(px);
        // Keep off to one side of the pod and a little above it.
        let side = this.x < px ? -1 : 1;
        if (px + side * 5 * TILE < 3 * TILE || px + side * 5 * TILE > (this.world.cols - 3) * TILE) side = -side;
        this.steer(px + side * 5 * TILE, py - 3 * TILE, dt, 1);
        this.cooldown -= dt;
        if (this.cooldown <= 0) {
          const near = Math.hypot(px - this.x, py - this.y) <= breath.range * TILE;
          this.begin(near && this.nextAttack === 'breath' ? 'rear' : 'swoopWindup');
          this.nextAttack = this.nextAttack === 'breath' ? 'swoop' : 'breath';
        }
        break;
      }
      case 'swoopWindup':
        this.face(px);
        this.brake(dt);
        if (this.time >= swoop.windup) {
          const dist = Math.max(1, Math.hypot(px - this.x, py - this.y));
          this.vx = ((px - this.x) / dist) * swoop.speed * TILE;
          this.vy = ((py - this.y) / dist) * swoop.speed * TILE;
          this.swoopTime = dist / (swoop.speed * TILE) + 0.35;
          this.swoopHit = false;
          this.begin('swoop');
          frame.started = 'swoop';
        }
        break;
      case 'swoop':
        if (touching && !this.swoopHit) {
          this.swoopHit = true;
          frame.damage += swoop.damage;
          const speed = Math.hypot(this.vx, this.vy) || 1;
          frame.knock = { x: (this.vx / speed) * swoop.knock * TILE, y: (this.vy / speed) * swoop.knock * TILE };
        }
        if (this.time >= this.swoopTime || this.atEdge()) this.begin('fly', GUAMS.attackGap);
        break;
      case 'rear':
        this.brake(dt);
        if (this.time >= breath.windup) {
          const m = this.mouth;
          this.aim = this.clampAim(Math.atan2(py - m.y, px - m.x));
          this.begin('breath');
          frame.started = 'breath';
        }
        break;
      case 'breath':
        this.brake(dt);
        if (this.inBreath(px, py)) frame.damage += breath.dps * dt;
        frame.light.push(...this.breathCells());
        if (this.time >= breath.duration) this.begin('fly', GUAMS.attackGap);
        break;
      case 'reel':
        this.vx *= Math.exp(-3 * dt);
        this.vy = 0.6 * TILE + Math.sin(this.time * 9) * 0.8 * TILE;
        if (this.time >= GUAMS.reel) this.begin(inLair ? 'fly' : 'guard', 1);
        break;
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.x = Math.min(Math.max(this.x, 2.5 * TILE), (this.world.cols - 2.5) * TILE);
    this.y = Math.min(Math.max(this.y, 1.4 * TILE), (GUAMS.arenaRows - 1.5) * TILE);
    // Rearing up raises his head well above his body: sink so it stays under the top of the sky.
    if (this.patchShowing && this.y < REAR_MIN_Y) this.y += (REAR_MIN_Y - this.y) * Math.min(1, dt * 6);

    // Touching him burns, and pushes the pod away (a swoop hits harder, above).
    if (touching && this.state !== 'swoop' && this.state !== 'waking') {
      frame.damage += GUAMS.contactDps * dt;
      if (!frame.knock) frame.knock = { x: (px < this.x ? -1 : 1) * 4 * TILE, y: pod.vy };
    }
    if (this.state !== 'guard') frame.light.push(...this.bodyCells());
    return frame;
  }

  // A dynamite blast at (x, y).
  blast(x: number, y: number): GuamsBlast {
    if (this.state === 'defeated') return null;
    const fromBody = this.distanceToBody(x, y);
    if (this.state === 'asleep') {
      if (fromBody > GUAMS.wakeRange * TILE) return null;
      this.begin('waking');
      return 'woke';
    }
    const p = this.patch;
    if (this.patchShowing && Math.hypot(x - p.x, y - p.y) <= GUAMS.hitRange * TILE) {
      this.hits++;
      if (this.hits >= GUAMS.hits) {
        this.begin('defeated');
        return 'defeated';
      }
      // Flinches away from the pod and comes round again.
      this.vx = (this.x < x ? -1 : 1) * 6 * TILE;
      this.vy = -3 * TILE;
      this.begin('fly', GUAMS.attackGap);
      return 'hit';
    }
    return fromBody <= GUAMS.hitRange * TILE ? 'armour' : null;
  }

  // A blast cloud went off at (x, y): close by, it leaves him reeling.
  blastCloud(x: number, y: number): boolean {
    if (!this.awake || this.state === 'waking' || this.state === 'reel') return false;
    if (this.distanceToBody(x, y) > GUAMS.reelRange * TILE) return false;
    this.begin('reel');
    return true;
  }

  private begin(state: GuamsState, cooldown?: number): void {
    this.state = state;
    this.time = 0;
    if (cooldown !== undefined) this.cooldown = cooldown;
  }

  private point(p: [number, number]): { x: number; y: number } {
    const o = offset(this.pose, p, this.facing);
    return { x: this.x + o.x, y: this.y + o.y };
  }

  private face(px: number): void {
    if (Math.abs(px - this.x) > 0.5 * TILE) this.facing = px < this.x ? -1 : 1;
  }

  // Fly toward a point, easing in as he arrives. `pace` is a share of top speed.
  private steer(tx: number, ty: number, dt: number, pace: number): void {
    const dx = tx - this.x;
    const dy = ty - this.y;
    const dist = Math.hypot(dx, dy);
    const speed = Math.min(GUAMS.speed * pace * TILE, dist * 2);
    const [wx, wy] = dist > 1 ? [(dx / dist) * speed, (dy / dist) * speed] : [0, 0];
    const k = Math.min(1, GUAMS.accel * dt);
    this.vx += (wx - this.vx) * k;
    this.vy += (wy - this.vy) * k;
  }

  private brake(dt: number): void {
    const k = Math.exp(-4 * dt);
    this.vx *= k;
    this.vy *= k;
  }

  private atEdge(): boolean {
    return this.x <= 2.5 * TILE || this.x >= (this.world.cols - 2.5) * TILE || this.y <= 1.4 * TILE || this.y >= (GUAMS.arenaRows - 1.5) * TILE;
  }

  private touches(pod: Pod): boolean {
    const b = this.body;
    return pod.x < b.x1 && pod.x + pod.w > b.x0 && pod.y < b.y1 && pod.y + pod.h > b.y0;
  }

  private distanceToBody(x: number, y: number): number {
    const b = this.body;
    return Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.y0 - y, 0, y - b.y1));
  }

  // The breath only goes forward and down, never back under his own chest.
  private clampAim(angle: number): number {
    let rel = this.facing === 1 ? angle : Math.PI - angle;
    rel = Math.atan2(Math.sin(rel), Math.cos(rel));
    rel = Math.min(Math.max(rel, -UP_ALLOWANCE), GUAMS.breath.maxDown);
    return this.facing === 1 ? rel : Math.PI - rel;
  }

  private inBreath(px: number, py: number): boolean {
    const m = this.mouth;
    const dist = Math.hypot(px - m.x, py - m.y);
    if (dist > GUAMS.breath.length * TILE) return false;
    const angle = Math.atan2(py - m.y, px - m.x);
    return Math.abs(Math.atan2(Math.sin(angle - this.aim), Math.cos(angle - this.aim))) <= GUAMS.breath.halfAngle;
  }

  // Blast clouds along the middle and edges of the flame.
  private breathCells(): [number, number][] {
    const m = this.mouth;
    const { length, halfAngle } = GUAMS.breath;
    const cells: [number, number][] = [];
    for (const da of [-halfAngle, 0, halfAngle]) {
      for (let d = 0.5; d <= length; d += 0.5) {
        const c = Math.floor((m.x + Math.cos(this.aim + da) * d * TILE) / TILE);
        const r = Math.floor((m.y + Math.sin(this.aim + da) * d * TILE) / TILE);
        if (this.world.get(c, r) === Tile.Blast) cells.push([c, r]);
      }
    }
    return cells;
  }

  // Blast clouds his body is touching.
  private bodyCells(): [number, number][] {
    const b = this.body;
    const cells: [number, number][] = [];
    for (let c = Math.floor(b.x0 / TILE); c <= Math.floor(b.x1 / TILE); c++) {
      for (let r = Math.floor(b.y0 / TILE); r <= Math.floor(b.y1 / TILE); r++) {
        if (this.world.get(c, r) === Tile.Blast) cells.push([c, r]);
      }
    }
    return cells;
  }
}
