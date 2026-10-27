import Phaser from 'phaser';
import { DARKNESS, TILE } from '../config';
import type { Pod } from '../pod/Pod';

const TEX = 64; // texels across the light texture
const BIG = 4000; // px; enough black to cover any view around the light

// Gets darker the deeper you go, with a pool of headlight around the pod.
// A soft radial texture is centred on the pod, with plain black around it.
export class Darkness {
  private root: Phaser.GameObjects.Container;
  private alpha = 0;

  constructor(scene: Phaser.Scene) {
    const tex = scene.textures.createCanvas('light', TEX, TEX)!;
    const ctx = tex.getContext();
    const half = TEX / 2;
    const inner = (DARKNESS.lightInner / DARKNESS.lightOuter) * half;
    const grad = ctx.createRadialGradient(half, half, inner, half, half, half);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, TEX, TEX);
    tex.refresh();
    tex.setFilter(Phaser.Textures.FilterMode.LINEAR); // smooth falloff, unlike the pixel art

    const size = DARKNESS.lightOuter * TILE * 2;
    const h = size / 2;
    this.root = scene.add
      .container(0, 0, [
        scene.add.image(0, 0, 'light').setDisplaySize(size, size),
        scene.add.rectangle(-h - BIG / 2, 0, BIG, BIG * 2, 0x000000), // left
        scene.add.rectangle(h + BIG / 2, 0, BIG, BIG * 2, 0x000000), // right
        scene.add.rectangle(0, -h - BIG / 2, size, BIG, 0x000000), // above
        scene.add.rectangle(0, h + BIG / 2, size, BIG, 0x000000), // below
      ])
      .setDepth(5)
      .setAlpha(0);
  }

  update(dt: number, pod: Pod, depthRows: number): void {
    const t = Phaser.Math.Clamp((depthRows - DARKNESS.startDepth) / (DARKNESS.fullDepth - DARKNESS.startDepth), 0, 1);
    this.alpha += (t * DARKNESS.max - this.alpha) * Math.min(1, dt * 3);
    // The light sits a little ahead of the pod, where it is facing.
    this.root
      .setPosition(pod.x + pod.w / 2 + pod.facing * TILE * 0.4, pod.y + pod.h / 2)
      .setAlpha(this.alpha)
      .setVisible(this.alpha > 0.01);
  }
}
