import Phaser from 'phaser';
import { POSES, SKETCH_SCALE as S, type GuamsPose } from '../boss/guamsShape';
import { mulberry32 } from '../world/World';

// Guams' textures, drawn in code: a red dragon with a plated belly, bone horns and
// dark wings. Shapes are laid out in sketch units (see guamsShape.ts) and filled at
// world scale, one texture pixel per world pixel, like the rest of the art.

type Ctx = CanvasRenderingContext2D;
type Pt = [number, number];
interface Mask {
  m: Uint8Array;
  w: number;
  h: number;
}

const COL = {
  out: '#250606',
  base: '#9a1d1a',
  dark: '#721412',
  light: '#c8402a',
  top: '#e2683e',
  wing: '#4c0f1a',
  wingDark: '#3a0b14',
  wingNear: '#64182a',
  rib: '#c9a477',
  ribDark: '#7d5f3d',
  spine: '#e9c98e',
};

// Texture key and size for each pose. The flying pose has two wing beats, and
// rearing has a version with fire building in the throat.
export function guamsTexture(pose: GuamsPose, frame = 0): string {
  return pose === 'fly' ? `guams-fly-${frame}` : pose === 'rear' && frame ? 'guams-rear-fire' : `guams-${pose}`;
}

export function textureSize(pose: GuamsPose): { w: number; h: number } {
  return { w: Math.ceil(POSES[pose].w * S), h: Math.ceil(POSES[pose].h * S) };
}

export function makeGuamsTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists('guams-asleep')) return;
  draw(scene, 'asleep', 'guams-asleep', asleep);
  draw(scene, 'fly', 'guams-fly-0', (ctx, w, h) => flying(ctx, w, h, 0));
  draw(scene, 'fly', 'guams-fly-1', (ctx, w, h) => flying(ctx, w, h, -14));
  draw(scene, 'rear', 'guams-rear', (ctx, w, h) => rearing(ctx, w, h, false));
  draw(scene, 'rear', 'guams-rear-fire', (ctx, w, h) => rearing(ctx, w, h, true));
  makeGlow(scene);
}

function draw(scene: Phaser.Scene, pose: GuamsPose, key: string, paint: (ctx: Ctx, w: number, h: number) => void): void {
  const { w, h } = textureSize(pose);
  const tex = scene.textures.createCanvas(key, w, h)!;
  paint(tex.getContext(), w, h);
  tex.refresh();
}

// A soft warm glow, for the bare patch and the mouth.
function makeGlow(scene: Phaser.Scene): void {
  const size = 128;
  const tex = scene.textures.createCanvas('guams-glow', size, size)!;
  const ctx = tex.getContext();
  const grad = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,190,90,0.95)');
  grad.addColorStop(1, 'rgba(255,90,30,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  tex.refresh();
  tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
}

// ---------- poses ----------

function flying(ctx: Ctx, w: number, h: number, flap: number): void {
  const far = mask(w, h, (g) => poly(g, [[156, 86], [186, 36 - flap], [212, 14 - flap], [214, 40 - flap], [230, 34 - flap], [230, 58 - flap], [244, 58 - flap], [232, 84], [200, 92]]));
  paintWing(ctx, far, [166, 84], [[212, 14 - flap], [230, 34 - flap], [244, 58 - flap]]);
  shade(ctx, far);
  const torso = (g: Ctx) => {
    ell(g, 152, 98, 50, 18, 0.05);
    ell(g, 114, 100, 26, 21);
    chain(g, [[110, 92, 22], [94, 80, 19], [82, 70, 17]]);
  };
  const body = mask(w, h, (g) => {
    torso(g);
    headShapes(g, 0, 0, true);
    chain(g, [[196, 100, 17], [226, 108, 12], [254, 106, 8], [278, 94, 5], [292, 82, 3]]); // tail
    poly(g, [[288, 84], [300, 70], [304, 86], [294, 92]]); // tail spade
    chain(g, [[178, 108, 13], [188, 126, 9], [178, 138, 6]]); // hind leg
    chain(g, [[122, 114, 10], [112, 128, 7], [100, 132, 4]]); // fore leg
  });
  paintBody(ctx, body, mask(w, h, torso), [0, 1], Math.round(7 * S), 7);
  spines(ctx, body, 86, 282, 5);
  const near = mask(w, h, (g) => poly(g, [[128, 88], [146, 34 - flap], [164, 8 - flap], [174, 34 - flap], [194, 24 - flap], [198, 52 - flap], [216, 48 - flap], [206, 78], [176, 90]]));
  paintWing(ctx, near, [136, 86], [[164, 8 - flap], [194, 24 - flap], [216, 48 - flap]]);
  headDetail(ctx, 0, 0, true, true);
  patch(ctx, POSES.fly.patch, false);
}

function asleep(ctx: Ctx, w: number, h: number): void {
  const [hx, hy] = [6, 18]; // head resting low, on the paws
  const torso = (g: Ctx) => {
    ell(g, 160, 74, 62, 20);
    ell(g, 206, 72, 28, 22);
    chain(g, [[112, 80, 19], [92, 84, 17]]);
  };
  const body = mask(w, h, (g) => {
    torso(g);
    chain(g, [[226, 82, 15], [254, 92, 11], [276, 96, 7], [292, 90, 4]]);
    poly(g, [[290, 92], [302, 80], [306, 94], [298, 98]]);
    chain(g, [[206, 86, 12], [214, 98, 8]]);
    headShapes(g, hx, hy, false);
    chain(g, [[108, 90, 9], [70, 98, 7]]); // fore paw out under the chin
  });
  paintBody(ctx, body, mask(w, h, torso), [0, 1], Math.round(6 * S), 3);
  spines(ctx, body, 100, 252, 6);
  const wing = mask(w, h, (g) => poly(g, [[118, 62], [146, 38], [176, 30], [206, 34], [226, 50], [208, 60], [150, 64]]));
  paintWing(ctx, wing, [130, 60], [[176, 30], [206, 34], [226, 50]]);
  headDetail(ctx, hx, hy, false, false);
}

function rearing(ctx: Ctx, w: number, h: number, fire: boolean): void {
  const far = mask(w, h, (g) => poly(g, [[146, 104], [188, 46], [236, 18], [230, 52], [262, 60], [230, 88], [252, 112], [204, 112], [172, 124]]));
  paintWing(ctx, far, [150, 106], [[236, 18], [262, 60], [252, 112]]);
  shade(ctx, far);
  const neck: Pt[] = [[126, 100], [114, 74], [122, 50]];
  const torso = (g: Ctx) => {
    ell(g, 148, 146, 26, 46, -0.25);
    ell(g, 128, 116, 28, 26);
    chain(g, [[126, 100, 24], [114, 74, 19], [122, 52, 16]]);
  };
  const body = mask(w, h, (g) => {
    torso(g);
    poly(g, [[134, 50], [134, 36], [124, 26], [112, 18], [100, 12], [94, 15], [98, 22], [106, 30], [112, 42], [118, 52], [128, 56]]); // head thrown back
    poly(g, [[118, 48], [104, 40], [92, 34], [90, 38], [100, 46], [112, 54]]); // jaw dropping open
    chain(g, [[162, 184, 16], [196, 206, 12], [230, 210, 8], [254, 198, 5]]);
    poly(g, [[252, 200], [264, 186], [268, 202], [258, 206]]);
    chain(g, [[158, 176, 15], [168, 204, 10], [158, 216, 7]]);
    chain(g, [[138, 182, 13], [132, 208, 9], [122, 218, 6]]);
    chain(g, [[118, 128, 10], [98, 134, 7], [88, 124, 4]]); // fore leg raised, claws out
  });
  paintBody(ctx, body, mask(w, h, torso), [-1, 0], Math.round(8 * S), 11);
  if (fire) {
    // fire building up the throat
    for (let i = 0; i < neck.length - 1; i++) {
      const [[x1, y1], [x2, y2]] = [neck[i], neck[i + 1]];
      for (let t = 0; t <= 1; t += 0.01) {
        const x = Math.round((x1 + (x2 - x1) * t) * S);
        const y = Math.round((y1 + (y2 - y1) * t) * S);
        for (let k = -2; k <= 2; k++) {
          if (at(body, x + k - 3, y) && at(body, x + k + 3, y)) px(ctx, Math.abs(k) < 1 ? '#ffe27a' : Math.abs(k) < 2 ? '#ffb43b' : '#ff6a1a', x + k, y);
        }
      }
    }
  }
  const near = mask(w, h, (g) => poly(g, [[116, 96], [84, 46], [40, 22], [52, 58], [18, 68], [54, 90], [34, 112], [80, 106], [106, 108]]));
  paintWing(ctx, near, [114, 98], [[40, 22], [18, 68], [34, 112]]);
  horn(ctx, 130, 38, -0.75, 26, -0.6);
  horn(ctx, 134, 44, -0.45, 18, -0.5);
  eye(ctx, 114, 26, true);
  patch(ctx, POSES.rear.patch, true);
}

// ---------- head ----------

// Facing left, mouth open or shut; (hx, hy) moves the whole head.
function headShapes(g: Ctx, hx: number, hy: number, open: boolean): void {
  const move = (pts: Pt[]) => pts.map(([x, y]): Pt => [x + hx, y + hy]);
  poly(g, move([[84, 60], [76, 52], [62, 52], [56, 56], [44, 59], [26, 64], [19, 68], [19, 73], [50, 75], [70, 77], [84, 72]]));
  if (open) poly(g, move([[72, 76], [52, 80], [30, 87], [26, 91], [36, 93], [58, 88], [78, 82]]));
  else poly(g, move([[72, 75], [50, 76], [24, 74], [26, 80], [52, 82], [76, 80]]));
}

function headDetail(ctx: Ctx, hx: number, hy: number, open: boolean, eyeOpen: boolean): void {
  horn(ctx, 78 + hx, 55 + hy, -0.32, 28, -0.5);
  horn(ctx, 83 + hx, 61 + hy, -0.12, 20, -0.35);
  px(ctx, COL.out, Math.round((58 + hx) * S), Math.round((57 + hy) * S), Math.round(10 * S), 1); // brow
  eye(ctx, 59 + hx, 59 + hy, eyeOpen);
  px(ctx, COL.out, Math.round((23 + hx) * S), Math.round((67 + hy) * S), 2, 1); // nostril
  if (open) {
    for (const [x, y] of [[26, 73], [34, 74], [42, 74], [32, 84], [42, 82]]) px(ctx, '#fff8e8', Math.round((x + hx) * S), Math.round((y + hy) * S), 1, 2);
  }
}

function eye(ctx: Ctx, sx: number, sy: number, open: boolean): void {
  const [x, y] = [Math.round(sx * S), Math.round(sy * S)];
  if (open) {
    px(ctx, '#5e0f0f', x - 1, y - 1, 6, 1);
    px(ctx, '#ffd84a', x, y, 4, 2);
    px(ctx, '#fff6c0', x, y, 1, 1);
    px(ctx, '#1a0000', x + 2, y, 1, 2);
  } else {
    px(ctx, '#5e0f0f', x + 1, y, 3, 1);
    px(ctx, '#1a0303', x, y + 1, 5, 1);
  }
}

// A curved horn of bone, thinning to a point; `curl` bends it along its length.
function horn(ctx: Ctx, sx: number, sy: number, angle: number, length: number, curl: number): void {
  let [x, y, a] = [sx * S, sy * S, angle];
  const len = length * S;
  for (let i = 0; i < len; i++) {
    const t = i / len;
    const w = Math.max(1, Math.round(4 * (1 - t * 0.85)));
    for (let k = 0; k < w; k++) {
      const color = k === 0 ? '#f1e6cb' : k === w - 1 ? '#4e4636' : k === 1 ? '#cbbd9c' : '#9a8d70';
      px(ctx, color, Math.round(x - Math.sin(a) * (k - w / 2)), Math.round(y + Math.cos(a) * (k - w / 2)));
    }
    x += Math.cos(a);
    y += Math.sin(a);
    a += curl / len;
  }
}

// The one bare patch on his chest: dull skin, or glowing hot while he rears up.
function patch(ctx: Ctx, [sx, sy]: Pt, hot: boolean): void {
  const [x, y] = [Math.round(sx * S), Math.round(sy * S)];
  const rows: [number, number][] = [[-2, 5], [-3, 7], [-4, 9], [-4, 9], [-4, 9], [-3, 7], [-2, 5]];
  rows.forEach(([dx, w], i) => {
    for (let k = 0; k < w; k++) {
      const edge = k === 0 || k === w - 1 || i === 0 || i === rows.length - 1;
      const color = hot ? (edge ? '#ff8a2a' : (k + i) % 2 === 0 ? '#fffbe6' : '#ffe0a0') : edge ? '#4a1414' : (k + i) % 3 === 0 ? '#a85a5a' : '#c27a74';
      px(ctx, color, x + dx + k, y + i - 3);
    }
  });
}

// ---------- painting ----------

// Red scales lit from above, a plated belly on the torso facing `belly`
// ([0, 1] down, [-1, 0] left), and a dark outline.
function paintBody(ctx: Ctx, m: Mask, torso: Mask, belly: Pt, depth: number, seed: number): void {
  const rand = mulberry32(seed);
  each(m, (x, y) => px(ctx, (y % 3 === 0 && (x + Math.floor(y / 3) * 2) % 4 === 0) || rand() < 0.04 ? COL.dark : COL.base, x, y));
  each(m, (x, y) => {
    if (!at(m, x, y - 1)) px(ctx, COL.top, x, y);
    else if (!at(m, x, y - 2) || (!at(m, x, y - 3) && x % 2 === 0)) px(ctx, COL.light, x, y);
  });
  const [bx, by] = belly;
  each(torso, (x, y) => {
    if (!at(m, x, y)) return;
    let edge = 0;
    for (let k = 1; k <= depth && !edge; k++) if (!at(torso, x + bx * k, y + by * k)) edge = k;
    if (!edge) return;
    const along = by ? x : y;
    px(ctx, along % 4 === 0 ? '#a57a30' : edge <= 2 ? '#e8c578' : '#cfa450', x, y);
  });
  outline(ctx, m);
}

// Dark membrane, lighter beside the finger bones, which fan out from the shoulder.
function paintWing(ctx: Ctx, m: Mask, shoulder: Pt, tips: Pt[]): void {
  each(m, (x, y) => px(ctx, (x * 3 + y * 2) % 9 === 0 ? COL.wing : COL.wingDark, x, y));
  const bone = (tip: Pt, step: number, fn: (x: number, y: number, t: number) => void) => {
    const [sx, sy, ex, ey] = [shoulder[0] * S, shoulder[1] * S, tip[0] * S, tip[1] * S];
    for (let t = 0; t <= 1; t += step) fn(Math.round(sx + (ex - sx) * t), Math.round(sy + (ey - sy) * t), t);
  };
  for (const tip of tips) {
    bone(tip, 0.01, (x, y) => {
      for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) if (at(m, x + dx, y + dy)) px(ctx, COL.wingNear, x + dx, y + dy);
    });
  }
  for (const tip of tips) {
    bone(tip, 0.005, (x, y, t) => {
      if (!at(m, x, y)) return;
      px(ctx, COL.rib, x, y);
      if (t < 0.5 && at(m, x, y + 1)) px(ctx, COL.ribDark, x, y + 1);
    });
  }
  outline(ctx, m);
}

// The far wing sits in shadow behind the body.
function shade(ctx: Ctx, m: Mask): void {
  ctx.globalAlpha = 0.4;
  each(m, (x, y) => px(ctx, '#000000', x, y));
  ctx.globalAlpha = 1;
}

// Bone spikes along the top of the neck, back and tail.
function spines(ctx: Ctx, m: Mask, x0: number, x1: number, every: number): void {
  for (let x = Math.round(x0 * S); x <= x1 * S; x++) {
    if (x % every !== 0) continue;
    let y = 0;
    while (y < m.h && !at(m, x, y)) y++;
    if (y >= m.h) continue;
    px(ctx, COL.spine, x, y - 1);
    px(ctx, COL.spine, x, y - 2);
    px(ctx, '#a07a48', x + 1, y - 1);
    px(ctx, COL.out, x - 1, y - 1);
  }
}

function outline(ctx: Ctx, m: Mask): void {
  each(m, (x, y) => {
    if (!at(m, x - 1, y) || !at(m, x + 1, y) || !at(m, x, y - 1) || !at(m, x, y + 1)) px(ctx, COL.out, x, y);
  });
}

// ---------- shapes ----------

// Fill a shape (in sketch units) on a scratch canvas and read back which pixels it covers.
function mask(w: number, h: number, shape: (g: Ctx) => void): Mask {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  g.strokeStyle = '#fff';
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.scale(S, S);
  shape(g);
  const d = g.getImageData(0, 0, w, h).data;
  const m = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) m[i] = d[i * 4 + 3] > 110 ? 1 : 0;
  return { m, w, h };
}

const at = (m: Mask, x: number, y: number) => x >= 0 && y >= 0 && x < m.w && y < m.h && m.m[y * m.w + x] === 1;

function each(m: Mask, fn: (x: number, y: number) => void): void {
  for (let i = 0; i < m.w * m.h; i++) if (m.m[i]) fn(i % m.w, Math.floor(i / m.w));
}

function px(ctx: Ctx, color: string, x: number, y: number, w = 1, h = 1): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function poly(g: Ctx, pts: Pt[]): void {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (const [x, y] of pts.slice(1)) g.lineTo(x, y);
  g.closePath();
  g.fill();
}

function ell(g: Ctx, x: number, y: number, rx: number, ry: number, rot = 0): void {
  g.beginPath();
  g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  g.fill();
}

// Thick rounded strokes through [x, y, width] points: necks, legs and tails.
function chain(g: Ctx, pts: [number, number, number][]): void {
  for (let i = 0; i < pts.length - 1; i++) {
    g.lineWidth = pts[i][2];
    g.beginPath();
    g.moveTo(pts[i][0], pts[i][1]);
    g.lineTo(pts[i + 1][0], pts[i + 1][1]);
    g.stroke();
  }
}
