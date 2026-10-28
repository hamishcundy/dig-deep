import Phaser from 'phaser';
import { mulberry32 } from '../world/World';

// Gorlab's textures, drawn in code: a horned, winged shape of shadow with fire in
// its cracks. Shapes are laid out on a 320x192 sketch with the feet at (200, 168),
// then cropped into 240x150 textures with the feet at FEET.

const SW = 320;
const SH = 192;
const CROP_X = 80;
const CROP_Y = 26;
export const TEX_W = 240;
export const TEX_H = 150;
export const FEET = { x: 200 - CROP_X, y: 168 - CROP_Y }; // in texture pixels

type Mask = Uint8Array;
type Ctx = CanvasRenderingContext2D;
type Pt = [number, number];

// Top-edge points of the body (relative to the feet), where flames rise from.
export interface GorlabArt {
  asleepEdge: Pt[];
  awakeEdge: Pt[];
}

export function makeGorlabTextures(scene: Phaser.Scene): GorlabArt {
  const asleep = draw(scene, 'gorlab-asleep', (ctx) => drawAsleep(ctx));
  const awake = draw(scene, 'gorlab-awake-0', (ctx) => drawAwake(ctx, -4));
  draw(scene, 'gorlab-awake-1', (ctx) => drawAwake(ctx, 4));
  makeGlow(scene);
  return { asleepEdge: topEdge(asleep), awakeEdge: topEdge(awake) };
}

function draw(scene: Phaser.Scene, key: string, paint: (ctx: Ctx) => Mask): Mask {
  const tex = scene.textures.createCanvas(key, TEX_W, TEX_H)!;
  const ctx = tex.getContext();
  ctx.save();
  ctx.translate(-CROP_X, -CROP_Y);
  const bodyMask = paint(ctx);
  ctx.restore();
  tex.refresh();
  return bodyMask;
}

function drawAsleep(ctx: Ctx): Mask {
  const wings = mask((g) => poly(g, [[172, 96], [150, 104], [146, 130], [160, 160], [200, 166], [240, 160], [254, 130], [250, 104], [228, 96]]));
  paintWings(ctx, wings);
  const body = mask((g) => {
    g.fillRect(184, 140, 13, 28);
    g.fillRect(205, 140, 13, 28);
    poly(g, [[176, 142], [226, 142], [232, 104], [170, 104]]);
    limb(g, 176, 108, 166, 150, 9);
    limb(g, 226, 108, 236, 150, 9);
    poly(g, [[186, 114], [212, 114], [216, 102], [208, 94], [194, 94], [184, 102], [174, 108], [176, 114]]);
    limb(g, 218, 160, 250, 164, 7);
    limb(g, 250, 164, 268, 156, 5);
    limb(g, 268, 156, 272, 146, 3);
  });
  halo(ctx, body, 3, 0.25);
  paintBody(ctx, body, 3);
  flames(ctx, body, 0.25, 3);
  horn(ctx, 195, 98, -1, 15);
  horn(ctx, 209, 98, 1, 15);
  rect(ctx, '#7a2c10', 186, 104, 3, 1);
  rect(ctx, '#7a2c10', 196, 104, 3, 1);
  return body;
}

function drawAwake(ctx: Ctx, flap: number): Mask {
  const wings = mask((g) => {
    poly(g, [[176, 94], [120, 34 + flap], [126, 60 + flap], [96, 70 + flap], [118, 84], [92, 98 + flap], [130, 108], [150, 128], [172, 124]]);
    poly(g, [[224, 94], [280, 34 + flap], [274, 60 + flap], [304, 70 + flap], [282, 84], [308, 98 + flap], [270, 108], [250, 128], [228, 124]]);
  });
  paintWings(ctx, wings);
  flames(ctx, wings, 0.1, 3);
  const body = mask((g) => {
    g.fillRect(185, 128, 12, 40);
    g.fillRect(207, 128, 12, 40);
    poly(g, [[178, 130], [226, 130], [238, 86], [166, 86]]);
    limb(g, 232, 92, 246, 116, 9);
    limb(g, 172, 92, 156, 110, 9);
    poly(g, [[192, 90], [214, 90], [217, 74], [209, 62], [195, 62], [186, 68], [172, 72], [164, 76], [166, 82], [178, 84], [188, 86]]);
    limb(g, 214, 158, 252, 166, 9);
    limb(g, 252, 166, 280, 156, 6);
    limb(g, 280, 156, 292, 140, 4);
    limb(g, 292, 140, 290, 132, 2);
  });
  halo(ctx, body, 4, 0.45);
  paintBody(ctx, body, 4);
  flames(ctx, body, 0.4, 6);
  horn(ctx, 197, 66, -1, 20);
  horn(ctx, 209, 66, 1, 20);
  rect(ctx, '#fff27a', 185, 70, 3, 2);
  rect(ctx, '#fff27a', 196, 69, 3, 2);
  rect(ctx, '#ffffff', 186, 70, 1, 1);
  rect(ctx, '#ffffff', 197, 69, 1, 1);
  for (const [cx, cy] of [[156, 110], [246, 116]]) for (let k = -1; k <= 1; k++) rect(ctx, '#ffe27a', cx + k * 2, cy + 4, 1, 2); // claws
  return body;
}

// A soft orange glow, added on top of the darkness around Gorlab.
function makeGlow(scene: Phaser.Scene): void {
  const size = 128;
  const tex = scene.textures.createCanvas('gorlab-glow', size, size)!;
  const ctx = tex.getContext();
  const grad = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,110,40,0.9)');
  grad.addColorStop(1, 'rgba(255,60,20,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  tex.refresh();
  tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
}

function topEdge(m: Mask): Pt[] {
  const pts: Pt[] = [];
  for (let y = 1; y < SH; y++) {
    for (let x = 0; x < SW; x++) if (at(m, x, y) && !at(m, x, y - 1)) pts.push([x - 200, y - 168]);
  }
  return pts;
}

// Fill a shape on a scratch canvas and read back which pixels it covers.
function mask(shape: (g: Ctx) => void): Mask {
  const c = document.createElement('canvas');
  c.width = SW;
  c.height = SH;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  g.strokeStyle = '#fff';
  g.lineCap = 'round';
  shape(g);
  const d = g.getImageData(0, 0, SW, SH).data;
  const m = new Uint8Array(SW * SH);
  for (let i = 0; i < SW * SH; i++) m[i] = d[i * 4 + 3] > 110 ? 1 : 0;
  return m;
}

const at = (m: Mask, x: number, y: number) => x >= 0 && y >= 0 && x < SW && y < SH && m[y * SW + x] === 1;

function rect(ctx: Ctx, color: string, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function poly(g: Ctx, pts: Pt[]) {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (const [x, y] of pts.slice(1)) g.lineTo(x, y);
  g.closePath();
  g.fill();
}

function limb(g: Ctx, x1: number, y1: number, x2: number, y2: number, w: number) {
  g.lineWidth = w;
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
  g.stroke();
}

function eachPixel(m: Mask, fn: (x: number, y: number) => void) {
  for (let i = 0; i < SW * SH; i++) if (m[i]) fn(i % SW, (i / SW) | 0);
}

// Wings of shadow, with darker ribs fanning out from the shoulders.
function paintWings(ctx: Ctx, m: Mask) {
  eachPixel(m, (x, y) => rect(ctx, (x + y) % 7 === 0 ? 'rgba(40,16,12,0.92)' : 'rgba(8,4,4,0.9)', x, y, 1, 1));
  for (const s of [-1, 1]) {
    for (let k = 0; k < 4; k++) {
      const [sx, sy, ex, ey] = [200 + s * 28, 92, 200 + s * (46 + k * 18), 46 + k * 16];
      for (let t = 0; t <= 1; t += 0.02) {
        const x = Math.round(sx + (ex - sx) * t);
        const y = Math.round(sy + (ey - sy) * t);
        if (at(m, x, y)) rect(ctx, 'rgba(70,26,18,0.9)', x, y, 1, 1);
      }
    }
  }
}

// Near-black body with glowing cracks and a dark red rim.
function paintBody(ctx: Ctx, m: Mask, seed: number) {
  const rand = mulberry32(seed);
  eachPixel(m, (x, y) => rect(ctx, rand() < 0.08 ? '#1e1010' : '#110909', x, y, 1, 1));
  for (let k = 0; k < 26; k++) {
    let x = 0;
    let y = 0;
    for (let tries = 0; tries < 4000 && !at(m, x, y); tries++) [x, y] = [Math.floor(rand() * SW), Math.floor(rand() * SH)];
    for (let s = 0; s < 9 && at(m, x, y); s++) {
      rect(ctx, s % 3 === 0 ? '#ffb347' : '#ff6a1a', x, y, 1, 1);
      x += rand() < 0.5 ? 1 : -1;
      y += rand() < 0.7 ? 1 : 0;
    }
  }
  eachPixel(m, (x, y) => {
    if (!at(m, x - 1, y) || !at(m, x + 1, y) || !at(m, x, y + 1)) rect(ctx, '#3a1208', x, y, 1, 1);
  });
}

// Fiery light hugging the outline, fading with distance.
function halo(ctx: Ctx, m: Mask, reach: number, alpha: number) {
  for (let y = 0; y < SH; y++) {
    for (let x = 0; x < SW; x++) {
      if (at(m, x, y)) continue;
      let near = 0;
      for (let d = 1; d <= reach && !near; d++) if (at(m, x + d, y) || at(m, x - d, y) || at(m, x, y + d) || at(m, x, y - d)) near = d;
      if (near) rect(ctx, `rgba(255,${90 + near * 20},30,${alpha / near})`, x, y, 1, 1);
    }
  }
}

// Short flame tongues rising off the top edges (moving flames are particles).
function flames(ctx: Ctx, m: Mask, density: number, maxLen: number) {
  const rand = mulberry32(1000);
  for (let y = 1; y < SH; y++) {
    for (let x = 1; x < SW - 1; x++) {
      if (!at(m, x, y) || at(m, x, y - 1) || rand() > density) continue;
      const len = 1 + Math.floor(rand() * maxLen);
      for (let i = 1; i <= len; i++) {
        const k = i / len;
        if (!at(m, x, y - i)) rect(ctx, k < 0.34 ? '#ff6a1a' : k < 0.7 ? '#ffb43b' : '#ffe27a', x, y - i, 1, 1);
      }
    }
  }
}

// A thick curved horn, bone coloured, thinning to a point.
function horn(ctx: Ctx, x0: number, y0: number, dir: number, len: number) {
  for (let i = 0; i < len; i++) {
    const t = i / len;
    const x = x0 + dir * (i * 0.9 - t * t * len * 0.35);
    const y = y0 - i * 0.75 - Math.sin(t * Math.PI) * 2;
    const w = Math.max(1, Math.round(5 * (1 - t * 0.85)));
    for (let k = 0; k < w; k++) {
      const color = k === 0 ? '#efe4c8' : k === w - 1 ? '#4e4636' : k === 1 ? '#cbbd9c' : '#9a8d70';
      rect(ctx, color, Math.round(x), Math.round(y) + k - Math.floor(w / 2), 1, 1);
    }
  }
}
