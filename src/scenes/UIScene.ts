import Phaser from 'phaser';
import { METRES_PER_TILE, TILE } from '../config';
import { Joystick } from '../input/Joystick';
import type { GameScene } from './GameScene';

// Screen-space overlay: HUD and touch controls, unaffected by camera zoom.
export class UIScene extends Phaser.Scene {
  joystick!: Joystick;
  private depthText!: Phaser.GameObjects.Text;

  constructor() {
    super('ui');
  }

  create(): void {
    this.input.addPointer(2);
    this.joystick = new Joystick(this);
    this.depthText = this.add
      .text(12, 12, '', { fontFamily: 'monospace', fontSize: '18px', color: '#ffffff' })
      .setStroke('#000000', 4);
  }

  update(): void {
    const game = this.scene.get('game') as GameScene;
    const { pod, world } = game;
    const depth = Math.max(0, Math.floor((pod.y + pod.h - 1) / TILE) - world.surfaceRow + 1);
    this.depthText.setText(`Depth ${depth * METRES_PER_TILE} m`);
  }
}
