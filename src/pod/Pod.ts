import { DRILL, PHYSICS, POD, TILE } from '../config';
import { World } from '../world/World';
import { isDrillable, isOre, isSolid, Tile } from '../world/tiles';

export interface Stick {
  x: number; // -1 (left) .. 1 (right)
  y: number; // -1 (up) .. 1 (down)
}

export type DrillDir = 'down' | 'left' | 'right';

interface Drill {
  col: number;
  row: number;
  dir: DrillDir;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  t: number;
  duration: number;
}

export interface DugTile {
  col: number;
  row: number;
  tile: number;
}

const EPS = 0.001;

// Pod movement and drilling. Plain logic with no Phaser, positions in px.
// Flying is free movement with gravity; drilling locks the pod and slides it
// into the target tile, like the original.
export class Pod {
  readonly w = POD.width * TILE;
  readonly h = POD.height * TILE;
  x: number; // top-left
  y: number;
  vx = 0;
  vy = 0;
  grounded = false;
  thrusting = false;
  facing: 1 | -1 = 1;
  drill: Drill | null = null;
  private blockedDir = 0;

  constructor(private world: World, col: number, row: number) {
    this.x = col * TILE + (TILE - this.w) / 2;
    this.y = row * TILE + TILE - this.h;
  }

  get drillDir(): DrillDir | null {
    return this.drill?.dir ?? null;
  }

  // Returns the tile dug out this frame, if any.
  update(dt: number, stick: Stick): DugTile | null {
    if (this.drill) return this.updateDrill(dt);

    this.thrusting = false;
    if (this.grounded && this.tryStartDrill(stick)) return null;

    if (Math.abs(stick.x) > 0.1) this.facing = stick.x > 0 ? 1 : -1;
    this.updateVelocity(dt, stick);

    const dx = this.vx * dt;
    const dy = this.vy * dt;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / (TILE / 4)));
    this.grounded = false;
    this.blockedDir = 0;
    for (let i = 0; i < steps; i++) {
      this.moveX(dx / steps);
      this.moveY(dy / steps, dt / steps);
    }
    return null;
  }

  private updateVelocity(dt: number, stick: Stick): void {
    const p = PHYSICS;
    if (Math.abs(stick.x) > 0.1) {
      this.vx += stick.x * p.accel * TILE * dt;
    } else {
      const slow = (this.grounded ? p.groundFriction : p.airDrag) * TILE * dt;
      this.vx = Math.abs(this.vx) <= slow ? 0 : this.vx - Math.sign(this.vx) * slow;
    }
    this.vx = clamp(this.vx, -p.maxSpeedX * TILE, p.maxSpeedX * TILE);

    this.thrusting = stick.y < -0.3;
    this.vy += p.gravity * TILE * dt;
    if (this.thrusting) this.vy -= p.thrust * TILE * dt;
    this.vy = clamp(this.vy, -p.maxRise * TILE, p.maxFall * TILE);
  }

  private tryStartDrill(stick: Stick): boolean {
    if (stick.y > 0.5 && stick.y >= Math.abs(stick.x)) return this.tryDrillDown();
    if (Math.abs(stick.x) > 0.5) {
      const dir = stick.x > 0 ? 1 : -1;
      if (this.blockedDir === dir) return this.tryDrillSide(dir);
    }
    return false;
  }

  private tryDrillDown(): boolean {
    const col = Math.floor((this.x + this.w / 2) / TILE);
    const row = Math.round((this.y + this.h) / TILE);
    if (!isDrillable(this.world.get(col, row))) return false;
    this.startDrill(col, row, 'down', col * TILE + (TILE - this.w) / 2, row * TILE + TILE - this.h);
    return true;
  }

  private tryDrillSide(dir: 1 | -1): boolean {
    const row = Math.round((this.y + this.h) / TILE) - 1;
    const col = dir > 0 ? Math.round((this.x + this.w) / TILE) : Math.round(this.x / TILE) - 1;
    if (!isDrillable(this.world.get(col, row))) return false;
    this.startDrill(col, row, dir > 0 ? 'right' : 'left', col * TILE + (TILE - this.w) / 2, this.y);
    return true;
  }

  private startDrill(col: number, row: number, dir: DrillDir, toX: number, toY: number): void {
    const tile = this.world.get(col, row);
    const depth = Math.max(0, this.world.depthOf(row));
    const duration =
      (DRILL.baseTime * (1 + depth * DRILL.depthHardness) * (isOre(tile) ? DRILL.oreTimeFactor : 1)) / DRILL.speed;
    this.drill = { col, row, dir, fromX: this.x, fromY: this.y, toX, toY, t: 0, duration };
    if (dir !== 'down') this.facing = dir === 'right' ? 1 : -1;
    this.vx = 0;
    this.vy = 0;
  }

  private updateDrill(dt: number): DugTile | null {
    const d = this.drill!;
    d.t += dt;
    const p = Math.min(1, d.t / d.duration);
    this.x = d.fromX + (d.toX - d.fromX) * p;
    this.y = d.fromY + (d.toY - d.fromY) * p;
    if (p < 1) return null;

    const tile = this.world.get(d.col, d.row);
    this.world.set(d.col, d.row, Tile.Empty);
    this.drill = null;
    // Still resting on something after a sideways drill; a down drill lands on the next row.
    this.grounded = true;
    return { col: d.col, row: d.row, tile };
  }

  private overlapsSolid(x: number, y: number): boolean {
    const c0 = Math.floor(x / TILE);
    const c1 = Math.floor((x + this.w - EPS) / TILE);
    const r0 = Math.floor(y / TILE);
    const r1 = Math.floor((y + this.h - EPS) / TILE);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (isSolid(this.world.get(c, r))) return true;
      }
    }
    return false;
  }

  private moveX(dx: number): void {
    if (dx === 0) return;
    const nx = this.x + dx;
    if (!this.overlapsSolid(nx, this.y)) {
      this.x = nx;
      return;
    }
    this.x = dx > 0 ? Math.floor((nx + this.w - EPS) / TILE) * TILE - this.w : (Math.floor(nx / TILE) + 1) * TILE;
    this.vx = 0;
    this.blockedDir = Math.sign(dx);
  }

  private moveY(dy: number, dt: number): void {
    if (dy === 0) return;
    const ny = this.y + dy;
    if (!this.overlapsSolid(this.x, ny)) {
      this.y = ny;
      return;
    }
    if (dy > 0) {
      this.y = Math.floor((ny + this.h - EPS) / TILE) * TILE - this.h;
      this.vy = 0;
      this.grounded = true;
      return;
    }
    // Hit a ceiling. If a shaft is just off to the side, slide toward it so
    // flying back up a 1-tile shaft doesn't need pixel-perfect steering.
    if (this.nudgeTowardShaft(ny, dt)) return;
    this.y = (Math.floor(ny / TILE) + 1) * TILE;
    this.vy = 0;
  }

  private nudgeTowardShaft(ny: number, dt: number): boolean {
    const centreCol = Math.floor((this.x + this.w / 2) / TILE);
    for (const col of [centreCol, centreCol - 1, centreCol + 1]) {
      const targetX = col * TILE + (TILE - this.w) / 2;
      const dist = targetX - this.x;
      if (Math.abs(dist) > PHYSICS.cornerNudge * TILE) continue;
      if (this.overlapsSolid(targetX, ny)) continue;
      const step = PHYSICS.cornerNudgeSpeed * TILE * dt;
      const nx = this.x + (Math.abs(dist) <= step ? dist : Math.sign(dist) * step);
      if (this.overlapsSolid(nx, this.y)) continue;
      this.x = nx;
      return true;
    }
    return false;
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
