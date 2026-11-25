import Phaser from 'phaser';
import type { Guams } from '../boss/Guams';
import { POSES, SKETCH_SCALE } from '../boss/guamsShape';
import { GUAMS, TILE } from '../config';
import { guamsTexture, makeGuamsTextures, textureSize } from './guamsArt';

const Depth = { body: 7, fire: 8 };
const FLAP_TIME = 0.18; // seconds per wing beat
const FIRE = [0xfff2a8, 0xffb43b, 0xff6a1a, 0x8a1a08];

// Draws Guams: asleep with smoke curling from his nose, flying with beating wings,
// rearing with the bare patch on his chest glowing, the fire breath, and sparks
// when a blast bounces off his plates.
export class GuamsView {
  private sprite: Phaser.GameObjects.Image;
  private patchGlow: Phaser.GameObjects.Image;
  private mouthGlow: Phaser.GameObjects.Image;
  private breath: Phaser.GameObjects.Particles.ParticleEmitter;
  private smoke: Phaser.GameObjects.Particles.ParticleEmitter;
  private sparks: Phaser.GameObjects.Particles.ParticleEmitter;
  private clock = 0;
  private smokeIn = 0;
  private flashUntil = 0;
  private flashColor = 0xffffff;
  private gone = false;

  constructor(
    private scene: Phaser.Scene,
    private guams: Guams,
  ) {
    makeGuamsTextures(scene);
    this.sprite = scene.add.image(guams.x, guams.y, 'guams-asleep').setDepth(Depth.body);
    this.patchGlow = scene.add.image(0, 0, 'guams-glow').setBlendMode('ADD').setDepth(Depth.fire).setVisible(false);
    this.mouthGlow = scene.add.image(0, 0, 'guams-glow').setBlendMode('ADD').setDepth(Depth.fire).setVisible(false);
    this.breath = scene.add
      .particles(0, 0, 'puff', {
        emitting: false,
        frequency: 12,
        quantity: 3,
        lifespan: { min: 750, max: 950 },
        speed: { min: 260, max: 330 },
        angle: {
          onEmit: () => Phaser.Math.RadToDeg(this.guams.aim) + Phaser.Math.FloatBetween(-1, 1) * Phaser.Math.RadToDeg(GUAMS.breath.halfAngle),
        },
        scale: { start: 0.8, end: 3 },
        alpha: { start: 1, end: 0 },
        color: FIRE,
        colorEase: 'quad.out',
      })
      .setDepth(Depth.fire);
    this.smoke = scene.add
      .particles(0, 0, 'puff', {
        emitting: false,
        lifespan: 1600,
        speedX: { min: -14, max: -6 },
        speedY: { min: -22, max: -12 },
        scale: { start: 0.6, end: 2.2 },
        alpha: { start: 0.55, end: 0 },
        tint: 0xc8c8d8,
      })
      .setDepth(Depth.fire);
    this.sparks = scene.add
      .particles(0, 0, 'px', {
        emitting: false,
        lifespan: { min: 200, max: 450 },
        speed: { min: 80, max: 220 },
        scale: { start: 1.4, end: 0.2 },
        color: [0xffffff, 0xfff2a8, 0xffb43b],
      })
      .setDepth(Depth.fire);
  }

  update(dt: number): void {
    if (this.gone) return;
    const g = this.guams;
    this.clock += dt;
    const pose = g.pose;
    const swooping = g.state === 'swoop';
    const frame = pose === 'fly' ? Math.floor(this.clock / (swooping ? FLAP_TIME * 2.5 : FLAP_TIME)) % 2 : pose === 'rear' && g.windup > 0.3 ? 1 : 0;
    const { w, h } = textureSize(pose);
    const [ox, oy] = POSES[pose].origin;
    const flip = g.facing === 1; // the art faces left
    this.sprite
      .setTexture(guamsTexture(pose, frame))
      .setOrigin(flip ? 1 - (ox * SKETCH_SCALE) / w : (ox * SKETCH_SCALE) / w, (oy * SKETCH_SCALE) / h)
      .setFlipX(flip)
      .setPosition(g.x, g.y);
    const dive = Phaser.Math.Clamp(g.vy / (12 * TILE), -1, 1);
    this.sprite.setRotation(pose === 'fly' ? g.facing * (swooping ? 0.45 : 0.25) * dive : g.state === 'reel' ? Math.sin(this.clock * 9) * 0.12 : 0);
    this.sprite.setTint(this.scene.time.now < this.flashUntil ? this.flashColor : 0xffffff);

    // The bare patch glows, pulsing, whenever it shows.
    const p = g.patch;
    const pulse = 0.5 + 0.5 * Math.sin(this.clock * 10);
    this.patchGlow.setVisible(g.patchShowing).setPosition(p.x, p.y).setDisplaySize(TILE * (1.4 + 0.6 * pulse), TILE * (1.4 + 0.6 * pulse));

    // Breath: the mouth glows brighter through the windup, then fire pours out.
    const m = g.mouth;
    const fire = g.state === 'rear' || g.state === 'breath';
    const size = TILE * (0.6 + 1.6 * g.windup);
    this.mouthGlow.setVisible(fire).setPosition(m.x, m.y).setDisplaySize(size, size);
    this.breath.setPosition(m.x, m.y);
    if (g.state === 'breath' && !this.breath.emitting) this.breath.start();
    if (g.state !== 'breath' && this.breath.emitting) this.breath.stop();

    // Asleep: smoke from his nose, more of it the more he has been stirred.
    if (g.state === 'asleep') {
      this.smokeIn -= dt;
      if (this.smokeIn <= 0) {
        this.smokeIn = Math.max(0.35, 1.4 - g.stirs * 0.4);
        this.smoke.emitParticleAt(m.x, m.y, 1 + g.stirs);
      }
    }
  }

  // A blast on the patch: a red flash and a burst of sparks.
  hit(): void {
    this.flash(0xff5050, 250);
    const p = this.guams.patch;
    this.sparks.emitParticleAt(p.x, p.y, 30);
  }

  // A blast that bounced off his plates: a white flash and sparks where it hit.
  armour(x: number, y: number): void {
    this.flash(0xffffff, 120);
    this.sparks.emitParticleAt(x, y, 18);
  }

  // Falls away through the clouds in a burst of fire, then is gone for good.
  defeat(): void {
    const g = this.guams;
    this.gone = true; // the tween moves him from here on
    this.breath.stop();
    this.mouthGlow.setVisible(false);
    this.patchGlow.setVisible(false);
    this.sparks.emitParticleAt(g.patch.x, g.patch.y, 60);
    this.scene.tweens.add({
      targets: this.sprite,
      y: g.y + 8 * TILE,
      rotation: g.facing * 0.9,
      alpha: 0,
      duration: 2600,
      ease: 'Quad.easeIn',
      onComplete: () => {
        this.sprite.destroy();
        this.patchGlow.destroy();
        this.mouthGlow.destroy();
      },
    });
  }

  private flash(color: number, ms: number): void {
    this.flashColor = color;
    this.flashUntil = this.scene.time.now + ms;
  }
}
