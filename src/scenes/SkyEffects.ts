import Phaser from 'phaser';
import { sound } from '../audio/sound';
import { SKY, TILE } from '../config';
import type { Pod } from '../pod/Pod';
import { isOre, oreIndex, Tile } from '../world/tiles';
import type { World } from '../world/World';
import type { PodView } from './PodView';
import type { Terrain } from './Terrain';

interface Loose {
  img: Phaser.GameObjects.Image;
  ore: number; // index into ORES
  vy: number; // px/s
  life: number; // seconds
}

export interface SkyHandlers {
  // The pod got caught in a blast; returns true if that destroyed it.
  hurt(amount: number): boolean;
  // Loose ore touched the pod; returns true if it went into the cargo bay.
  collect(ore: number, x: number, y: number): boolean;
}

// What happens to the sky blocks during play: blast clouds on a fuse setting each
// other off, crumbling clouds falling away, and ore thrown loose by blasts.
export class SkyEffects {
  private fuses = new Map<number, number>(); // cell → seconds left
  private crumbles = new Map<number, number>(); // cell → seconds left
  private loose: Loose[] = [];
  private glow: Phaser.GameObjects.Graphics;
  private fire: Phaser.GameObjects.Particles.ParticleEmitter;
  private clock = 0;
  private hurtGap = 0;

  constructor(
    private scene: Phaser.Scene,
    private world: World,
    private terrain: Terrain,
    private podView: PodView,
    private handlers: SkyHandlers,
  ) {
    this.glow = scene.add.graphics().setDepth(1);
    this.fire = scene.add
      .particles(0, 0, 'puff', {
        emitting: false,
        lifespan: { min: 250, max: 600 },
        speed: { min: 30, max: 170 },
        scale: { start: 1.4, end: 3 },
        alpha: { start: 1, end: 0 },
        color: [0xfff2a8, 0xffb43b, 0xff5a1f, 0x5a1a10],
        colorEase: 'quad.out',
      })
      .setDepth(4);
  }

  // Back to a clean slate when the game rolls back after losing the pod.
  reset(): void {
    this.fuses.clear();
    this.crumbles.clear();
    for (const l of this.loose) l.img.destroy();
    this.loose = [];
  }

  // Light a blast cloud; a fuse already burning keeps going.
  light(col: number, row: number, fuse: number = SKY.blast.fuse): void {
    if (this.world.get(col, row) !== Tile.Blast) return;
    const key = this.key(col, row);
    if (!this.fuses.has(key)) this.fuses.set(key, fuse);
  }

  // Sky ore knocked out of its block falls loose instead of being lost.
  dropOre(col: number, row: number, ore: number): void {
    const img = this.scene.add
      .image((col + 0.5) * TILE, (row + 0.5) * TILE, 'terrain', `ore${ore}`)
      .setScale(0.5)
      .setDepth(2);
    this.loose.push({ img, ore, vy: -40, life: SKY.loose.life });
  }

  // Called once a frame during play. Returns true if the pod was destroyed.
  step(dt: number, pod: Pod): boolean {
    this.hurtGap = Math.max(0, this.hurtGap - dt);
    if (this.startCrumbling(pod)) sound.tick();
    for (const [key, left] of [...this.crumbles]) {
      if (left - dt > 0) this.crumbles.set(key, left - dt);
      else this.fallAway(key);
    }
    this.updateLoose(dt, pod);
    let destroyed = false;
    for (const [key, left] of [...this.fuses]) {
      if (left - dt > 0) this.fuses.set(key, left - dt);
      else if (this.explode(key, pod)) destroyed = true;
    }
    return destroyed;
  }

  // Pulsing light in every blast cloud on screen, flashing fast once lit.
  draw(dt: number, view: Phaser.Geom.Rectangle): void {
    this.clock += dt;
    this.glow.clear();
    const { world } = this;
    if (view.y > world.surfaceRow * TILE) return; // underground: nothing to draw
    const r0 = Math.max(0, Math.floor(view.y / TILE));
    const r1 = Math.min(world.rows - 1, Math.ceil((view.y + view.height) / TILE));
    const c0 = Math.max(0, Math.floor(view.x / TILE));
    const c1 = Math.min(world.cols - 1, Math.ceil((view.x + view.width) / TILE));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (world.get(c, r) !== Tile.Blast) continue;
        const lit = this.fuses.has(this.key(c, r));
        const pulse = 0.5 + 0.5 * Math.sin(this.clock * (lit ? 24 : 4) + c * 1.7 + r * 2.3);
        const size = lit ? 7 + pulse * 6 : 4 + pulse * 4;
        const [x, y] = [(c + 0.5) * TILE, (r + 0.5) * TILE];
        this.glow.fillStyle(0xff6a1a, 1).fillCircle(x, y, size);
        this.glow.fillStyle(0xffb52e, 1).fillCircle(x, y, size * 0.72);
        this.glow.fillStyle(lit && pulse > 0.5 ? 0xffffff : 0xfff3b0, 1).fillCircle(x, y, size * 0.4);
      }
    }
  }

  // Standing on crumbling cloud starts it falling. Returns true if any just started.
  private startCrumbling(pod: Pod): boolean {
    if (!pod.grounded || pod.drill) return false;
    const row = pod.row + 1;
    const c0 = Math.floor(pod.x / TILE);
    const c1 = Math.floor((pod.x + pod.w - 1) / TILE);
    let started = false;
    for (let c = c0; c <= c1; c++) {
      const key = this.key(c, row);
      if (this.world.get(c, row) === Tile.Crumble && !this.crumbles.has(key)) {
        this.crumbles.set(key, SKY.crumble.delay);
        started = true;
      }
    }
    return started;
  }

  // One crumbling block goes, and its crumbling neighbours follow soon after.
  private fallAway(key: number): void {
    this.crumbles.delete(key);
    const [col, row] = this.cell(key);
    if (this.world.get(col, row) !== Tile.Crumble) return;
    this.clear(col, row, Tile.Crumble);
    sound.dig();
    for (const [c, r] of [[col - 1, row], [col + 1, row], [col, row - 1], [col, row + 1]]) {
      if (this.world.get(c, r) === Tile.Crumble && !this.crumbles.has(this.key(c, r))) this.crumbles.set(this.key(c, r), SKY.crumble.chainDelay);
    }
  }

  // Returns true if the blast destroyed the pod.
  private explode(key: number, pod: Pod): boolean {
    this.fuses.delete(key);
    const [col, row] = this.cell(key);
    if (this.world.get(col, row) !== Tile.Blast) return false;
    const { radius, chainFuse, hurtRange, damage, knock, hurtGap } = SKY.blast;
    this.clear(col, row, Tile.Blast);
    for (let r = row - radius; r <= row + radius; r++) {
      for (let c = col - radius; c <= col + radius; c++) {
        const tile = this.world.get(c, r);
        if (tile === Tile.Blast) this.light(c, r, chainFuse);
        else if (tile >= Tile.Cloud || (isOre(tile) && r < this.world.surfaceRow)) {
          this.clear(c, r, tile);
          if (isOre(tile)) this.dropOre(c, r, oreIndex(tile));
        }
      }
    }
    const [x, y] = [(col + 0.5) * TILE, (row + 0.5) * TILE];
    this.fire.emitParticleAt(x, y, 36);
    this.scene.cameras.main.shake(220, 0.01);
    sound.boom();

    const [px, py] = [pod.x + pod.w / 2, pod.y + pod.h / 2];
    if (Math.hypot(px - x, py - y) > hurtRange * TILE || this.hurtGap > 0) return false;
    this.hurtGap = hurtGap;
    pod.vx = (px < x ? -1 : 1) * knock * TILE;
    pod.vy = (py < y ? -1 : 1) * knock * TILE * 0.5;
    pod.grounded = false;
    return this.handlers.hurt(damage);
  }

  private updateLoose(dt: number, pod: Pod): void {
    const { gravity, maxFall } = SKY.loose;
    this.loose = this.loose.filter((l) => {
      l.life -= dt;
      const { img } = l;
      const [px, py] = [pod.x + pod.w / 2, pod.y + pod.h / 2];
      if (Math.abs(img.x - px) < pod.w * 0.7 && Math.abs(img.y - py) < pod.h * 0.8 && this.handlers.collect(l.ore, img.x, img.y)) {
        img.destroy();
        return false;
      }
      if (l.life <= 0) {
        img.destroy();
        return false;
      }
      img.setAlpha(Math.min(1, l.life));
      // Falls until it comes to rest on something; if that goes, it falls again.
      l.vy = Math.min(l.vy + gravity * TILE * dt, maxFall * TILE);
      const ny = img.y + l.vy * dt;
      const below = this.world.get(Math.floor(img.x / TILE), Math.floor((ny + 6) / TILE));
      if (l.vy > 0 && below !== Tile.Empty) l.vy = 0;
      else img.y = ny;
      return true;
    });
  }

  private clear(col: number, row: number, tile: number): void {
    this.podView.burst(col, row, this.terrain.colorAt(col, row, tile));
    this.world.set(col, row, Tile.Empty);
    this.terrain.dug(col, row);
  }

  private key(col: number, row: number): number {
    return row * this.world.cols + col;
  }

  private cell(key: number): [number, number] {
    return [key % this.world.cols, Math.floor(key / this.world.cols)];
  }
}
