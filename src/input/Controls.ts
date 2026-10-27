import Phaser from 'phaser';
import type { Stick } from '../pod/Pod';
import type { Joystick } from './Joystick';

// Merges keyboard (arrows / WASD) and the touch joystick into one stick.
export class Controls {
  private keys: Record<'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd', Phaser.Input.Keyboard.Key>;
  private stick: Stick = { x: 0, y: 0 };

  constructor(scene: Phaser.Scene, private joystick: Joystick) {
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = scene.input.keyboard!.addKeys({
      up: K.UP,
      down: K.DOWN,
      left: K.LEFT,
      right: K.RIGHT,
      w: K.W,
      a: K.A,
      s: K.S,
      d: K.D,
    }) as Controls['keys'];
  }

  read(): Stick {
    if (this.joystick.active) return this.joystick.stick;
    const k = this.keys;
    this.stick.x = (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0);
    this.stick.y = (k.down.isDown || k.s.isDown ? 1 : 0) - (k.up.isDown || k.w.isDown ? 1 : 0);
    return this.stick;
  }
}
