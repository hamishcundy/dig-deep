import { GORLAB, TILE } from '../config';
import type { Pod } from '../pod/Pod';
import type { Cavern } from '../world/World';

export type GorlabState = 'asleep' | 'awake' | 'defeated';
export type GorlabAction = 'idle' | 'breathWindup' | 'breath' | 'tailWindup' | 'tail';

// What happened this frame, for the game scene to act on.
export interface GorlabFrame {
  damage: number; // hull the pod loses
  knock: number; // horizontal speed (px/s) to throw the pod at, or 0
  woke: boolean;
  started: 'breath' | 'tail' | null; // an attack that just began (after its windup)
}

const TAIL_SHOW = 0.3; // seconds the tail swipe is drawn for

// Gorlab's behaviour. It stands in the middle of its cavern facing the pod,
// turning round only after the pod has been behind it for a while. In front, it
// breathes fire; close behind, it swipes its tail. It never leaves the cavern.
export class Gorlab {
  readonly x: number; // feet, centre (px)
  readonly y: number; // top of the floor it stands on (px)
  state: GorlabState = 'asleep';
  action: GorlabAction = 'idle';
  facing: -1 | 1 = -1; // -1 faces left
  aim = Math.PI; // breath direction (radians)
  hits: number;
  private actionTime = 0;
  private breathCooldown = 0;
  private tailCooldown = 0;
  private behindFor = 0;

  constructor(
    private cavern: Cavern,
    hits: number,
  ) {
    this.hits = hits;
    this.x = ((cavern.c0 + cavern.c1 + 1) / 2) * TILE;
    this.y = (cavern.r1 + 1) * TILE;
  }

  // The part of it that hurts to touch and takes dynamite hits (px).
  get body(): { x0: number; y0: number; x1: number; y1: number } {
    const w = GORLAB.body.width * TILE;
    const h = GORLAB.body.height * TILE;
    return { x0: this.x - w / 2, y0: this.y - h, x1: this.x + w / 2, y1: this.y };
  }

  get mouth(): { x: number; y: number } {
    return { x: this.x + this.facing * 1.1 * TILE, y: this.y - 2.75 * TILE };
  }

  // 0..1 through the current windup, for the drawing to build up to the attack.
  get windup(): number {
    if (this.action === 'breathWindup') return this.actionTime / GORLAB.breath.windup;
    if (this.action === 'tailWindup') return this.actionTime / GORLAB.tail.windup;
    return 0;
  }

  // Back to sleep (when the pod is lost and the game rolls back); its wounds stay.
  sleep(): void {
    if (this.state !== 'awake') return;
    this.state = 'asleep';
    this.action = 'idle';
  }

  update(dt: number, pod: Pod): GorlabFrame {
    const frame: GorlabFrame = { damage: 0, knock: 0, woke: false, started: null };
    if (this.state === 'defeated') return frame;
    const px = pod.x + pod.w / 2;
    const py = pod.y + pod.h / 2;
    const inCavern = this.contains(px, py, 1);

    if (this.state === 'asleep') {
      if (!this.contains(px, py, 0)) return frame;
      this.state = 'awake';
      this.breathCooldown = 1.5;
      this.tailCooldown = 1;
      frame.woke = true;
    }

    // Turn to face the pod once it has stayed behind for a while, but not mid-attack.
    const side = px < this.x ? -1 : 1;
    if (side !== this.facing && inCavern) this.behindFor += dt;
    else this.behindFor = 0;
    if (this.behindFor > GORLAB.turnDelay && this.action === 'idle') {
      this.facing = side;
      this.behindFor = 0;
    }

    this.actionTime += dt;
    const { breath, tail } = GORLAB;
    switch (this.action) {
      case 'idle':
        if (!inCavern) break;
        this.breathCooldown -= dt;
        this.tailCooldown -= dt;
        if (side !== this.facing && Math.abs(px - this.x) < (GORLAB.body.width / 2 + tail.reach) * TILE && this.tailCooldown <= 0) {
          this.begin('tailWindup');
        } else if (side === this.facing && this.breathCooldown <= 0 && this.inBreathRange(px, py)) {
          this.begin('breathWindup');
        }
        break;
      case 'breathWindup':
        if (this.actionTime >= breath.windup) {
          const m = this.mouth;
          this.aim = Math.atan2(py - m.y, px - m.x);
          this.begin('breath');
          frame.started = 'breath';
        }
        break;
      case 'breath':
        if (this.inBreath(px, py)) frame.damage += breath.dps * dt;
        if (this.actionTime >= breath.duration) {
          this.begin('idle');
          this.breathCooldown = breath.interval;
        }
        break;
      case 'tailWindup':
        if (this.actionTime >= tail.windup) {
          this.begin('tail');
          frame.started = 'tail';
          const tailSide = -this.facing;
          const reachEnd = this.x + tailSide * (GORLAB.body.width / 2 + tail.reach) * TILE;
          const inReach = tailSide < 0 ? px >= reachEnd && px <= this.x : px <= reachEnd && px >= this.x;
          if (inReach && py >= this.y - tail.height * TILE) {
            frame.damage += tail.damage;
            frame.knock = tailSide * tail.knock * TILE;
          }
        }
        break;
      case 'tail':
        if (this.actionTime >= TAIL_SHOW) {
          this.begin('idle');
          this.tailCooldown = tail.interval;
        }
        break;
    }

    // Touching it burns, and pushes the pod back out.
    const b = this.body;
    if (pod.x < b.x1 && pod.x + pod.w > b.x0 && pod.y < b.y1 && pod.y + pod.h > b.y0) {
      frame.damage += GORLAB.contactDps * dt;
      if (!frame.knock) frame.knock = side * 4 * TILE;
    }
    return frame;
  }

  // A dynamite blast at (x, y): a hit if it's close enough to the body.
  blast(x: number, y: number): 'hit' | 'defeated' | null {
    if (this.state === 'defeated') return null;
    const b = this.body;
    const dx = Math.max(b.x0 - x, 0, x - b.x1);
    const dy = Math.max(b.y0 - y, 0, y - b.y1);
    if (Math.hypot(dx, dy) > GORLAB.hitRange * TILE) return null;
    this.hits++;
    if (this.hits >= GORLAB.hits) {
      this.state = 'defeated';
      this.action = 'idle';
      return 'defeated';
    }
    this.state = 'awake';
    return 'hit';
  }

  private begin(action: GorlabAction): void {
    this.action = action;
    this.actionTime = 0;
  }

  // Close enough to be worth breathing at (a little past the flame's reach, since the pod may move in).
  private inBreathRange(px: number, py: number): boolean {
    const m = this.mouth;
    return Math.hypot(px - m.x, py - m.y) <= (GORLAB.breath.length + 1) * TILE;
  }

  private inBreath(px: number, py: number): boolean {
    const m = this.mouth;
    const dist = Math.hypot(px - m.x, py - m.y);
    if (dist > GORLAB.breath.length * TILE) return false;
    const angle = Math.atan2(py - m.y, px - m.x);
    const diff = Math.abs(Math.atan2(Math.sin(angle - this.aim), Math.cos(angle - this.aim)));
    return diff <= GORLAB.breath.halfAngle;
  }

  // Is (x, y) inside the cavern, grown by `margin` tiles on every side?
  private contains(x: number, y: number, margin: number): boolean {
    const { c0, c1, r0, r1 } = this.cavern;
    return x >= (c0 - margin) * TILE && x <= (c1 + 1 + margin) * TILE && y >= (r0 - margin) * TILE && y <= (r1 + 1) * TILE;
  }
}
