import Phaser from 'phaser';
import { PHYSICS, TILE } from '../config';
import type { Pod } from '../pod/Pod';
import { DRILL_FRAMES, POD_ORIGIN_Y, podFrame } from './textures';

const Depth = { exhaust: 2, pod: 3, debris: 4 };

// Everything drawn for the pod: the animated sprite, thruster exhaust, and
// dirt thrown up by the drill.
export class PodView {
  readonly sprite: Phaser.GameObjects.Sprite;
  private exhaust: Phaser.GameObjects.Particles.ParticleEmitter;
  private dirt: Phaser.GameObjects.Particles.ParticleEmitter;
  private chunks: Phaser.GameObjects.Particles.ParticleEmitter;
  private dirtTint = 0xffffff;
  private dirtAngle = 270;
  private chunkTint = 0xffffff;
  private drillFrame = 0;
  private treadFrame = 0;
  private animClock = 0;
  private tilt = 0;
  private squash = 0;
  private flashUntil = 0;

  constructor(private scene: Phaser.Scene, private pod: Pod) {
    this.exhaust = scene.add
      .particles(0, 0, 'puff', {
        emitting: false,
        lifespan: { min: 250, max: 450 },
        speedY: { min: 60, max: 140 },
        speedX: { min: -15, max: 15 },
        scale: { start: 0.9, end: 2.2 },
        alpha: { start: 0.9, end: 0 },
        color: [0xfff2a8, 0xffa13b, 0xd9480f, 0x4a4a4a],
        colorEase: 'quad.out',
      })
      .setDepth(Depth.exhaust);
    this.sprite = scene.add.sprite(0, 0, 'pod', 0).setOrigin(0.5, POD_ORIGIN_Y).setDepth(Depth.pod);
    this.dirt = scene.add
      .particles(0, 0, 'px', {
        emitting: false,
        lifespan: { min: 250, max: 550 },
        speed: { min: 40, max: 130 },
        angle: { onEmit: () => this.dirtAngle + Phaser.Math.Between(-60, 60) },
        gravityY: 400,
        scale: { start: 1.3, end: 0.6 },
        alpha: { start: 1, end: 0.2 },
        tint: { onEmit: () => this.dirtTint },
      })
      .setDepth(Depth.debris);
    this.chunks = scene.add
      .particles(0, 0, 'chunk', {
        emitting: false,
        lifespan: { min: 400, max: 800 },
        speed: { min: 60, max: 180 },
        angle: { min: 200, max: 340 },
        gravityY: 600,
        rotate: { start: 0, end: 360 },
        scale: { start: 1.2, end: 0.4 },
        alpha: { start: 1, end: 0 },
        tint: { onEmit: () => this.chunkTint },
      })
      .setDepth(Depth.debris);
  }

  // Squash on landing, harder for faster landings (tiles/s).
  landed(impact: number): void {
    if (impact > 3) this.squash = Math.min(1, (impact - 3) / 10);
  }

  hit(): void {
    this.flashUntil = this.scene.time.now + 160;
  }

  // Chunks flying out of a tile that just broke.
  burst(col: number, row: number, color: number): void {
    this.chunkTint = color;
    this.chunks.emitParticleAt(col * TILE + TILE / 2, row * TILE + TILE / 2, 8);
  }

  update(dt: number, dead: boolean, drillColor: number): void {
    const pod = this.pod;
    const cx = pod.x + pod.w / 2;
    const cy = pod.y + pod.h / 2;
    const dir = pod.drillDir;
    const alive = !dead;

    this.animClock += dt;
    if (this.animClock > 0.05) {
      this.animClock = 0;
      if (dir && alive) this.drillFrame = (this.drillFrame + 1) % DRILL_FRAMES;
      if (pod.grounded && Math.abs(pod.vx) > 10) this.treadFrame = 1 - this.treadFrame;
    }

    // Lean into horizontal movement, more in the air than on the ground.
    const lean = dir ? 0 : Phaser.Math.Clamp(pod.vx / (PHYSICS.maxSpeedX * TILE), -1, 1) * (pod.grounded ? 3 : 9);
    this.tilt += (lean - this.tilt) * Math.min(1, dt * 10);
    this.squash = Math.max(0, this.squash - dt * 5);

    const shake = dir && alive ? (Math.random() - 0.5) * 1.5 : 0;
    const flashing = this.scene.time.now < this.flashUntil;
    this.sprite
      .setFrame(podFrame(this.drillFrame, this.treadFrame))
      .setPosition(cx + shake, cy + shake)
      .setAngle((dir === 'right' ? -90 : dir === 'left' ? 90 : 0) + this.tilt)
      .setFlipX(pod.facing < 0)
      .setScale(1 + 0.15 * this.squash, 1 - 0.22 * this.squash)
      .setTint(dead || flashing ? 0xff5050 : 0xffffff);

    if (pod.thrusting && alive) {
      const y = pod.y + pod.h + 1;
      this.exhaust.emitParticleAt(cx - 9, y, 1);
      this.exhaust.emitParticleAt(cx + 9, y, 1);
    }

    if (dir && alive) {
      this.dirtTint = drillColor;
      if (dir === 'down') {
        this.dirtAngle = 270;
        this.dirt.emitParticleAt(cx, pod.y + pod.h + 6, 2);
      } else {
        const side = dir === 'right' ? 1 : -1;
        this.dirtAngle = side > 0 ? 225 : 315;
        this.dirt.emitParticleAt(cx + side * (pod.w / 2 + 6), cy + 2, 2);
      }
    }
  }
}
