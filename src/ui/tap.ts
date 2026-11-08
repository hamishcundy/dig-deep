import type Phaser from 'phaser';

// Run `fn` when the object is tapped: pressed and released on it. A finger that
// was already down elsewhere (steering the joystick, say) and lifts over it
// doesn't count, so a button that appears under a finger can't be hit by accident.
export function onTap(obj: Phaser.GameObjects.GameObject, fn: () => void): void {
  let pressed = false;
  obj
    .on('pointerdown', () => (pressed = true))
    .on('pointerout', () => (pressed = false))
    .on('pointerup', () => {
      if (pressed) fn();
      pressed = false;
    });
}
