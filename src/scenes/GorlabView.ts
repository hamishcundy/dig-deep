import Phaser from 'phaser';
import type { Gorlab } from '../boss/Gorlab';
import { GORLAB, TILE } from '../config';
import { FEET, TEX_H, TEX_W, makeGorlabTextures, type GorlabArt } from './gorlabArt';

// Above the darkness (5), so Gorlab glows out of the dark at the bottom of the world.
const Depth = { glow: 6, body: 7, fire: 8 };
const FLAP_TIME = 0.35; // seconds per wing beat

// Draws Gorlab: the body (asleep, or awake with beating wings), moving flames,
// a glow, the fire breath and the tail swipe.
export class GorlabView {
  private sprite: Phaser.GameObjects.Image;
  private glow: Phaser.GameObjects.Image;
  private flames: Phaser.GameObjects.Particles.ParticleEmitter;
  private breath: Phaser.GameObjects.Particles.ParticleEmitter;
  private mouthGlow: Phaser.GameObjects.Image;
  private art: GorlabArt;
  private clock = 0;
  private flashUntil = 0;
  private gone = false;

  constructor(
    private scene: Phaser.Scene,
    private gorlab: Gorlab,
  ) {
    this.art = makeGorlabTextures(scene);
    const { x, y } = gorlab;
    this.glow = scene.add.image(x, y - 2 * TILE, 'gorlab-glow').setDisplaySize(14 * TILE, 10 * TILE).setBlendMode('ADD').setDepth(Depth.glow);
    this.sprite = scene.add
      .image(x, y, 'gorlab-asleep')
      .setOrigin(FEET.x / TEX_W, FEET.y / TEX_H)
      .setDepth(Depth.body);
    const fire = [0xfff2a8, 0xffb43b, 0xff6a1a, 0x8a1a08];
    this.flames = scene.add
      .particles(0, 0, 'px', {
        emitting: false,
        lifespan: { min: 250, max: 600 },
        speedY: { min: -60, max: -25 },
        speedX: { min: -8, max: 8 },
        scale: { start: 1.6, end: 0.4 },
        color: fire,
        colorEase: 'quad.out',
      })
      .setDepth(Depth.fire);
    this.breath = scene.add
      .particles(0, 0, 'puff', {
        emitting: false,
        frequency: 12,
        quantity: 3,
        lifespan: { min: 700, max: 900 },
        speed: { min: 230, max: 300 },
        angle: {
          onEmit: () => Phaser.Math.RadToDeg(this.gorlab.aim) + Phaser.Math.FloatBetween(-1, 1) * Phaser.Math.RadToDeg(GORLAB.breath.halfAngle),
        },
        scale: { start: 0.8, end: 2.8 },
        alpha: { start: 1, end: 0 },
        color: fire,
        colorEase: 'quad.out',
      })
      .setDepth(Depth.fire);
    this.mouthGlow = scene.add.image(0, 0, 'gorlab-glow').setBlendMode('ADD').setDepth(Depth.fire).setVisible(false);
  }

  update(dt: number): void {
    if (this.gone) return;
    const g = this.gorlab;
    this.clock += dt;
    const awake = g.state === 'awake';
    const flip = g.facing === 1; // the art faces left
    this.sprite.setTexture(awake ? `gorlab-awake-${Math.floor(this.clock / FLAP_TIME) % 2}` : 'gorlab-asleep');
    this.sprite.setFlipX(flip);
    // Leans away from the swing while winding up a tail swipe.
    this.sprite.setRotation(g.action === 'tailWindup' ? g.facing * 0.1 * g.windup : 0);
    this.sprite.setTint(this.scene.time.now < this.flashUntil ? 0xff5050 : 0xffffff); // red flash when hit
    this.glow.setAlpha((awake ? 0.55 : 0.3) + 0.08 * Math.sin(this.clock * 3));

    // Flames rising off random points along the top of the body.
    const edge = awake ? this.art.awakeEdge : this.art.asleepEdge;
    const count = awake ? 6 : 2;
    for (let i = 0; i < count; i++) {
      const [ex, ey] = edge[Math.floor(Math.random() * edge.length)];
      this.flames.emitParticleAt(g.x + (flip ? -ex : ex), g.y + ey);
    }

    // Breath: the mouth glows brighter through the windup, then fire pours out.
    const m = g.mouth;
    this.mouthGlow.setPosition(m.x, m.y);
    this.mouthGlow.setVisible(g.action === 'breathWindup' || g.action === 'breath');
    this.mouthGlow.setDisplaySize(TILE * (0.5 + 1.5 * (g.action === 'breath' ? 1 : g.windup)), TILE * (0.5 + 1.5 * (g.action === 'breath' ? 1 : g.windup)));
    this.breath.setPosition(m.x, m.y);
    if (g.action === 'breath' && !this.breath.emitting) this.breath.start();
    if (g.action !== 'breath' && this.breath.emitting) this.breath.stop();
  }

  // The tail sweeping along the floor behind it.
  tailSwipe(): void {
    const g = this.gorlab;
    const side = -g.facing;
    for (let i = 0; i <= 10; i++) {
      const x = g.x + side * (GORLAB.body.width / 2 + (GORLAB.tail.reach * i) / 10) * TILE;
      this.flames.emitParticleAt(x, g.y - 0.3 * TILE, 4);
    }
  }

  hit(): void {
    this.flashUntil = this.scene.time.now + 200;
  }

  // Sinks and fades in a final burst of flame, then is gone for good.
  defeat(): void {
    const g = this.gorlab;
    this.breath.stop();
    this.mouthGlow.setVisible(false);
    for (let i = 0; i < 40; i++) {
      const [ex, ey] = this.art.awakeEdge[Math.floor(Math.random() * this.art.awakeEdge.length)];
      this.flames.emitParticleAt(g.x + ex, g.y + ey, 3);
    }
    this.scene.tweens.add({ targets: [this.sprite, this.glow], alpha: 0, duration: 2200, ease: 'Quad.easeIn' });
    this.scene.tweens.add({
      targets: this.sprite,
      y: g.y + 1.5 * TILE,
      duration: 2200,
      ease: 'Quad.easeIn',
      onComplete: () => {
        this.gone = true;
        this.sprite.destroy();
        this.glow.destroy();
        this.mouthGlow.destroy();
      },
    });
  }
}
