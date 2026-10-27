import Phaser from 'phaser';
import { BUILDINGS, TILE, type BuildingDef, type BuildingKind } from '../config';
import { mulberry32, World } from '../world/World';

// Everything above ground: sky, sun, drifting clouds, parallax hills and the
// four buildings. Drawn in code.

const BUILDING_H = 3 * TILE;
const css = (c: number, a = 1) => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;

interface Cloud {
  img: Phaser.GameObjects.Image;
  speed: number; // px/s
}

export class Surface {
  private clouds: Cloud[] = [];
  private width: number;

  constructor(private scene: Phaser.Scene, world: World) {
    this.width = world.cols * TILE;
    const skyH = world.surfaceRow * TILE;
    const rand = mulberry32(world.seed ^ 0x5a5a);

    // Sky gradient, lighter toward the horizon.
    const sky = scene.textures.createCanvas('sky', 4, skyH)!;
    const sctx = sky.getContext();
    const grad = sctx.createLinearGradient(0, 0, 0, skyH);
    grad.addColorStop(0, '#3f8fd4');
    grad.addColorStop(0.7, '#8ccbee');
    grad.addColorStop(1, '#cdeef8');
    sctx.fillStyle = grad;
    sctx.fillRect(0, 0, 4, skyH);
    sky.refresh();
    scene.add.image(0, 0, 'sky').setOrigin(0, 0).setDisplaySize(this.width, skyH);

    // Sun with a soft glow.
    const sun = scene.add.graphics().setScrollFactor(0.3, 1);
    sun.fillStyle(0xfff6c8, 0.25);
    sun.fillCircle(0, 0, 26);
    sun.fillStyle(0xfff6c8, 0.5);
    sun.fillCircle(0, 0, 18);
    sun.fillStyle(0xfffbe6, 1);
    sun.fillCircle(0, 0, 12);
    sun.setPosition(this.width * 0.62, skyH * 0.28);

    // Clouds drift slowly and wrap around.
    makeCloudTextures(scene);
    for (let i = 0; i < 6; i++) {
      const img = scene.add
        .image(rand() * this.width, 18 + rand() * (skyH * 0.45), `cloud${i % 3}`)
        .setScrollFactor(0.5, 1)
        .setAlpha(0.9);
      this.clouds.push({ img, speed: 4 + rand() * 6 });
    }

    // Two hill ranges behind the buildings; the far one moves less.
    this.addHills('hillsFar', skyH, 70, 0x8fb4c8, 0xa6c6d6, 0.45, rand);
    this.addHills('hillsNear', skyH, 44, 0x5f9a4a, 0x78b35c, 0.75, rand);

    BUILDINGS.forEach((b) => this.addBuilding(b, skyH));
  }

  update(dt: number): void {
    for (const c of this.clouds) {
      c.img.x += c.speed * dt;
      if (c.img.x - c.img.width / 2 > this.width) c.img.x = -c.img.width / 2;
    }
  }

  private addHills(key: string, skyH: number, height: number, color: number, rim: number, parallax: number, rand: () => number): void {
    const tex = this.scene.textures.createCanvas(key, this.width, height)!;
    const ctx = tex.getContext();
    const waves = [0, 1, 2].map(() => ({ f: 0.004 + rand() * 0.012, p: rand() * Math.PI * 2, a: 0.2 + rand() * 0.3 }));
    ctx.fillStyle = css(color);
    for (let x = 0; x < this.width; x += 2) {
      let h = 0.45;
      for (const w of waves) h += Math.sin(x * w.f + w.p) * w.a * 0.5;
      const top = Math.round(height * (1 - Phaser.Math.Clamp(h, 0.15, 1)));
      ctx.fillRect(x, top, 2, height - top);
    }
    // a lighter rim along the ridge
    const img = ctx.getImageData(0, 0, this.width, height);
    ctx.fillStyle = css(rim);
    for (let x = 0; x < this.width; x += 2) {
      for (let y = 0; y < height; y++) {
        if (img.data[(y * this.width + x) * 4 + 3] > 0) {
          ctx.fillRect(x, y, 2, 2);
          break;
        }
      }
    }
    tex.refresh();
    this.scene.add.image(0, skyH, key).setOrigin(0, 1).setScrollFactor(parallax, 1);
  }

  private addBuilding(b: BuildingDef, skyH: number): void {
    const key = `building-${b.kind}`;
    const w = b.width * TILE;
    const tex = this.scene.textures.createCanvas(key, w, BUILDING_H)!;
    const ctx = tex.getContext();
    DRAW[b.kind](ctx, w, BUILDING_H, b.color);
    tex.refresh();
    const x = b.col * TILE;
    const y = skyH - BUILDING_H;
    this.scene.add.image(x, y, key).setOrigin(0, 0);

    const sign = SIGN[b.kind];
    this.scene.add
      .text(x + w / 2, y + sign.y, b.label, { fontFamily: 'monospace', fontSize: '12px', fontStyle: 'bold', color: '#ffffff' })
      .setOrigin(0.5)
      .setResolution(3);

    // Two sign lamps blinking in turn.
    for (const [i, dx] of [-1, 1].entries()) {
      const lamp = this.scene.add.rectangle(x + w / 2 + dx * (sign.w / 2 + 5), y + sign.y, 3, 3, 0xfff1a8);
      this.scene.tweens.add({ targets: lamp, alpha: 0.25, duration: 500, yoyo: true, repeat: -1, delay: i * 500 });
    }
  }
}

// Each building's sign: vertical centre from its top, and board width.
const SIGN: Record<BuildingKind, { y: number; w: number }> = {
  fuel: { y: 9, w: 54 },
  sell: { y: 33, w: 50 },
  repair: { y: 22, w: 58 },
  shop: { y: 24, w: 50 },
};

type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number, color: number) => void;

const shade = (c: number, f: number) => {
  const ch = (s: number) => Math.max(0, Math.min(255, Math.round(((c >> s) & 255) * f)));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

function rect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: number, a = 1) {
  ctx.fillStyle = css(c, a);
  ctx.fillRect(x, y, w, h);
}

function signBoard(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number) {
  rect(ctx, cx - w / 2 - 1, cy - 7, w + 2, 14, 0x111318);
  rect(ctx, cx - w / 2, cy - 6, w, 12, 0x23262e);
}

function window_(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  rect(ctx, x - 1, y - 1, w + 2, h + 2, 0x2b2f38);
  rect(ctx, x, y, w, h, 0x8fd3ff);
  rect(ctx, x, y + h - 3, w, 3, 0x6ab8e8);
  rect(ctx, x + 2, y + 2, 3, 2, 0xffffff, 0.8);
}

const DRAW: Record<BuildingKind, Draw> = {
  // Fuel: canopy over two pumps, kiosk behind.
  fuel(ctx, w, h, color) {
    rect(ctx, 6, 30, w - 12, h - 30, 0xd9d4cc); // kiosk wall
    rect(ctx, 6, 30, w - 12, 2, 0xb8b2a8);
    window_(ctx, w - 34, 44, 20, 14);
    rect(ctx, 14, 48, 14, h - 48, 0x5a5f69); // kiosk door
    rect(ctx, 0, 16, w, 10, shade(color, 0.7)); // canopy
    rect(ctx, 0, 16, w, 2, shade(color, 1.2));
    rect(ctx, 0, 22, w, 2, 0xffffff);
    rect(ctx, 8, 26, 4, h - 26, 0x9aa0a8); // posts
    rect(ctx, w - 12, 26, 4, h - 26, 0x9aa0a8);
    for (const px of [36, w - 50]) {
      rect(ctx, px, h - 30, 14, 30, color); // pump
      rect(ctx, px, h - 30, 14, 3, shade(color, 1.25));
      rect(ctx, px + 2, h - 25, 10, 6, 0x10161c);
      rect(ctx, px + 3, h - 24, 6, 2, 0x5dff8a);
      rect(ctx, px + 14, h - 20, 2, 12, 0x2b2b30); // hose
      rect(ctx, px - 2, h - 3, 18, 3, 0x6f737a);
    }
    signBoard(ctx, w / 2, SIGN.fuel.y, SIGN.fuel.w);
  },

  // Sell: corrugated warehouse with a roller door, crates and an ore cart.
  sell(ctx, w, h, color) {
    rect(ctx, 4, 20, w - 8, h - 20, color);
    for (let x = 6; x < w - 4; x += 4) rect(ctx, x, 20, 1, h - 20, shade(color, 0.8));
    ctx.fillStyle = css(0x34495e);
    ctx.beginPath();
    ctx.moveTo(0, 22);
    ctx.lineTo(w / 2, 4);
    ctx.lineTo(w, 22);
    ctx.closePath();
    ctx.fill();
    rect(ctx, 0, 20, w, 3, 0x2c3e50);
    rect(ctx, 38, 44, 52, h - 44, 0x2b2f38); // door frame
    rect(ctx, 40, 46, 48, h - 46, 0x14161b); // dark inside
    for (let y = 46; y < 66; y += 4) rect(ctx, 40, y, 48, 3, 0xa0a6ae); // door half rolled up
    rect(ctx, 8, h - 14, 14, 14, 0x9c6b3c); // crates
    rect(ctx, 8, h - 14, 14, 2, 0xb98a55);
    rect(ctx, 14, h - 26, 12, 12, 0x8a5c31);
    rect(ctx, 14, h - 26, 12, 2, 0xb98a55);
    rect(ctx, w - 30, h - 14, 22, 10, 0x55555c); // ore cart
    rect(ctx, w - 28, h - 4, 4, 4, 0x2b2b30);
    rect(ctx, w - 14, h - 4, 4, 4, 0x2b2b30);
    for (const [ox, c] of [[0, 0xc87533], [6, 0xffcf33], [12, 0xa9a29a]] as const) rect(ctx, w - 27 + ox, h - 18, 5, 4, c);
    signBoard(ctx, w / 2, SIGN.sell.y, SIGN.sell.w);
  },

  // Repair: garage with an open bay, hazard-striped frame and a tyre stack.
  repair(ctx, w, h, color) {
    rect(ctx, 4, 12, w - 8, h - 12, color);
    for (let y = 16; y < h; y += 6) rect(ctx, 4, y, w - 8, 1, shade(color, 0.8));
    rect(ctx, 0, 8, w, 6, shade(color, 0.55)); // parapet
    rect(ctx, 0, 8, w, 1, shade(color, 1.2));
    rect(ctx, 34, 36, 60, h - 36, 0x14161b); // open bay
    for (let x = 34; x < 94; x += 8) {
      rect(ctx, x, 32, 4, 4, 0xf2c200);
      rect(ctx, x + 4, 32, 4, 4, 0x222222);
    }
    rect(ctx, 30, 32, 4, h - 32, 0xf2c200);
    rect(ctx, 94, 32, 4, h - 32, 0xf2c200);
    for (let i = 0; i < 4; i++) rect(ctx, 44 + i * 10, 42, 2, 10, 0x55555c); // tools on the wall
    for (let i = 0; i < 3; i++) {
      rect(ctx, 8, h - 8 - i * 7, 18, 7, 0x1f1f23); // tyres
      rect(ctx, 14, h - 6 - i * 7, 6, 3, 0x3a3a40);
    }
    signBoard(ctx, w / 2, SIGN.repair.y, SIGN.repair.w);
  },

  // Shop: storefront with a striped awning and display windows.
  shop(ctx, w, h, color) {
    rect(ctx, 4, 14, w - 8, h - 14, shade(color, 0.85));
    rect(ctx, 0, 10, w, 6, shade(color, 0.55)); // cornice
    rect(ctx, 0, 10, w, 1, shade(color, 1.3));
    for (let x = 0; x < w; x += 12) {
      rect(ctx, x, 40, 6, 9, color); // awning stripes
      rect(ctx, x + 6, 40, 6, 9, 0xf5f0ff);
      ctx.fillStyle = css(x % 24 ? 0xf5f0ff : color);
      ctx.beginPath();
      ctx.arc(x + 6, 49, 6, 0, Math.PI);
      ctx.fill();
    }
    window_(ctx, 10, 60, 30, 24);
    window_(ctx, w - 40, 60, 30, 24);
    rect(ctx, 18, 76, 6, 8, 0x9a9aa2); // goods in the windows
    rect(ctx, 28, 72, 6, 12, 0xffcf33);
    rect(ctx, w - 32, 74, 8, 10, 0xf2b705);
    rect(ctx, w - 20, 70, 4, 14, 0x9a9aa2);
    rect(ctx, 50, 58, 28, h - 58, 0x2b2f38); // door
    rect(ctx, 53, 61, 22, 18, 0x8fd3ff, 0.8);
    rect(ctx, 72, 82, 2, 3, 0xffcf33);
    signBoard(ctx, w / 2, SIGN.shop.y, SIGN.shop.w);
  },
};

function makeCloudTextures(scene: Phaser.Scene): void {
  const shapes = [
    [[14, 14, 12], [28, 10, 14], [44, 14, 11], [30, 18, 12]],
    [[12, 12, 9], [24, 9, 11], [36, 13, 9]],
    [[16, 14, 12], [32, 9, 13], [50, 12, 12], [64, 15, 9], [38, 17, 12]],
  ];
  shapes.forEach((puffs, i) => {
    const w = Math.max(...puffs.map(([x, , r]) => x + r)) + 2;
    const h = 36;
    const tex = scene.textures.createCanvas(`cloud${i}`, w, h)!;
    const ctx = tex.getContext();
    for (const [color, dy] of [['#d6e6ef', 3], ['#ffffff', 0]] as const) {
      ctx.fillStyle = color;
      for (const [x, y, r] of puffs) {
        ctx.beginPath();
        ctx.arc(x, y + dy + 6, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.clearRect(0, 32, w, 4); // flat bottom
    tex.refresh();
  });
}
