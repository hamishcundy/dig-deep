import Phaser from 'phaser';
import type { Stick } from '../pod/Pod';

const RADIUS = 56; // px of thumb travel for full input
const DEAD_ZONE = 0.2;
const ZONE_WIDTH = 0.6; // left share of the screen that starts the joystick

// Floating thumb joystick: touch anywhere on the left of the screen and drag.
export class Joystick {
  readonly stick: Stick = { x: 0, y: 0 };
  private pointerId: number | null = null;
  private enabled = true;
  private baseX = 0;
  private baseY = 0;
  private base: Phaser.GameObjects.Arc;
  private knob: Phaser.GameObjects.Arc;
  private hint: Phaser.GameObjects.Arc;

  constructor(private scene: Phaser.Scene) {
    this.base = scene.add.circle(0, 0, RADIUS, 0xffffff, 0.12).setStrokeStyle(2, 0xffffff, 0.35).setVisible(false);
    this.knob = scene.add.circle(0, 0, RADIUS * 0.45, 0xffffff, 0.35).setVisible(false);
    this.hint = scene.add.circle(0, 0, RADIUS, 0xffffff, 0.06).setStrokeStyle(2, 0xffffff, 0.15);
    this.hint.setVisible(scene.sys.game.device.input.touch);
    this.layout();

    scene.input.on('pointerdown', this.onDown, this);
    scene.input.on('pointermove', this.onMove, this);
    scene.input.on('pointerup', this.onUp, this);
    scene.input.on('pointerupoutside', this.onUp, this);
    scene.scale.on('resize', this.layout, this);
  }

  get active(): boolean {
    return this.pointerId !== null;
  }

  // Off while a menu is open, so taps on buttons don't steer the pod.
  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on && this.pointerId !== null) this.release();
    this.hint.setVisible(on && this.scene.sys.game.device.input.touch);
  }

  private layout(): void {
    const { height } = this.scene.scale;
    this.hint.setPosition(RADIUS + 32, height - RADIUS - 48);
  }

  private onDown(p: Phaser.Input.Pointer): void {
    if (!this.enabled || this.pointerId !== null || p.x > this.scene.scale.width * ZONE_WIDTH) return;
    this.pointerId = p.id;
    this.baseX = p.x;
    this.baseY = p.y;
    this.base.setPosition(p.x, p.y).setVisible(true);
    this.knob.setPosition(p.x, p.y).setVisible(true);
    this.hint.setVisible(false);
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (p.id !== this.pointerId) return;
    let dx = p.x - this.baseX;
    let dy = p.y - this.baseY;
    const len = Math.hypot(dx, dy);
    if (len > RADIUS) {
      dx = (dx / len) * RADIUS;
      dy = (dy / len) * RADIUS;
    }
    this.knob.setPosition(this.baseX + dx, this.baseY + dy);
    const mag = Math.min(1, len / RADIUS);
    if (mag < DEAD_ZONE) {
      this.stick.x = 0;
      this.stick.y = 0;
    } else {
      this.stick.x = dx / RADIUS;
      this.stick.y = dy / RADIUS;
    }
  }

  private onUp(p: Phaser.Input.Pointer): void {
    if (p.id === this.pointerId) this.release();
  }

  private release(): void {
    this.pointerId = null;
    this.stick.x = 0;
    this.stick.y = 0;
    this.base.setVisible(false);
    this.knob.setVisible(false);
    this.hint.setVisible(this.enabled && this.scene.sys.game.device.input.touch);
  }
}
