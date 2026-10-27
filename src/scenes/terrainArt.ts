import Phaser from 'phaser';
import { BANDS, ORES, TILE, type BandDef } from '../config';
import { mulberry32 } from '../world/World';

// Terrain tileset, drawn in code. One canvas holds every frame; tilemap
// layers index into it with the helpers below.

export const VARIANTS = 4;
const NB = BANDS.length;
const COLS = 16;

export const Frame = {
  dirt: (band: number, v: number) => band * VARIANTS + v,
  back: (band: number, v: number) => NB * VARIANTS + band * VARIANTS + v,
  topsoil: (v: number) => 2 * NB * VARIANTS + v,
  bedrock: (v: number) => 2 * NB * VARIANTS + VARIANTS + v,
  pad: () => 2 * NB * VARIANTS + 2 * VARIANTS,
  ore: (i: number, v: number) => 2 * NB * VARIANTS + 2 * VARIANTS + 1 + i * VARIANTS + v,
  boulder: (v: number) => 2 * NB * VARIANTS + 2 * VARIANTS + 1 + ORES.length * VARIANTS + v,
  // mask bits: 1 top, 2 right, 4 bottom, 8 left are open
  edge: (band: number, mask: number) => 2 * NB * VARIANTS + 2 * VARIANTS + 1 + (ORES.length + 1) * VARIANTS + band * 16 + mask,
  // Transition from band `pair` to the next one down; level 1..3 = 25/50/75% of the deeper band.
  blendDirt: (pair: number, level: number, v: number) => Frame.edge(NB - 1, 15) + 1 + (pair * BLEND_LEVELS + level - 1) * VARIANTS + v,
  blendBack: (pair: number, level: number, v: number) => Frame.blendDirt(NB - 1, 1, 0) + (pair * BLEND_LEVELS + level - 1) * VARIANTS + v,
};

export const BLEND_LEVELS = 3;
const FRAME_COUNT = Frame.blendBack(NB - 2, BLEND_LEVELS, VARIANTS - 1) + 1;
const GEMS = new Set(['Emerald', 'Ruby', 'Diamond']);

const css = (c: number, a = 1) => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;
const mix = (c: number, d: number, t: number) => {
  const ch = (s: number) => Math.round(((c >> s) & 255) * (1 - t) + ((d >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

export function makeTerrainTexture(scene: Phaser.Scene): void {
  const rows = Math.ceil(FRAME_COUNT / COLS);
  const tex = scene.textures.createCanvas('terrain', COLS * TILE, rows * TILE)!;
  const ctx = tex.getContext();
  const at = (frame: number) => [(frame % COLS) * TILE, Math.floor(frame / COLS) * TILE] as const;

  BANDS.forEach((band, b) => {
    for (let v = 0; v < VARIANTS; v++) {
      drawDirt(ctx, ...at(Frame.dirt(b, v)), band, mulberry32(b * 101 + v * 7 + 1));
      drawBack(ctx, ...at(Frame.back(b, v)), band, mulberry32(b * 211 + v * 13 + 3));
    }
    for (let m = 1; m < 16; m++) drawEdge(ctx, ...at(Frame.edge(b, m)), band, m, mulberry32(b * 307 + m * 17));
  });
  for (let pair = 0; pair < NB - 1; pair++) {
    for (let level = 1; level <= BLEND_LEVELS; level++) {
      for (let v = 0; v < VARIANTS; v++) {
        const share = level / (BLEND_LEVELS + 1);
        const seed = 1700 + pair * 97 + level * 13 + v;
        drawBlend(ctx, at(Frame.dirt(pair, v)), at(Frame.dirt(pair + 1, v)), at(Frame.blendDirt(pair, level, v)), share, mulberry32(seed));
        drawBlend(ctx, at(Frame.back(pair, v)), at(Frame.back(pair + 1, v)), at(Frame.blendBack(pair, level, v)), share, mulberry32(seed));
      }
    }
  }
  for (let v = 0; v < VARIANTS; v++) {
    const [x, y] = at(Frame.topsoil(v));
    drawDirt(ctx, x, y, BANDS[0], mulberry32(900 + v));
    drawGrass(ctx, x, y, mulberry32(950 + v));
    drawBedrock(ctx, ...at(Frame.bedrock(v)), mulberry32(990 + v));
  }
  drawPad(ctx, ...at(Frame.pad()));
  ORES.forEach((_, i) => {
    for (let v = 0; v < VARIANTS; v++) {
      const [x, y] = at(Frame.ore(i, v));
      drawOre(ctx, x, y, i, mulberry32(1200 + i * 10 + v));
    }
    const [x, y] = at(Frame.ore(i, 0));
    tex.add(`ore${i}`, 0, x, y, TILE, TILE); // for HUD icons
  });
  for (let v = 0; v < VARIANTS; v++) drawBoulder(ctx, ...at(Frame.boulder(v)), mulberry32(1500 + v));
  tex.refresh();
}

// Mix two finished tiles in blotchy patches: `share` of the pixels come from `to`.
// Patches come from smooth value noise on an 8px lattice, so it reads as one
// layer creeping into the other rather than a checkerboard.
function drawBlend(
  ctx: CanvasRenderingContext2D,
  from: readonly [number, number],
  to: readonly [number, number],
  dest: readonly [number, number],
  share: number,
  rand: () => number,
) {
  const a = ctx.getImageData(from[0], from[1], TILE, TILE);
  const b = ctx.getImageData(to[0], to[1], TILE, TILE);
  const step = 8;
  const n = TILE / step + 1;
  const lattice = Array.from({ length: n * n }, () => rand());
  const at = (ix: number, iy: number) => lattice[iy * n + ix];
  for (let py = 0; py < TILE; py++) {
    for (let px = 0; px < TILE; px++) {
      const fx = px / step;
      const fy = py / step;
      const ix = Math.floor(fx);
      const iy = Math.floor(fy);
      const tx = fx - ix;
      const ty = fy - iy;
      const top = at(ix, iy) * (1 - tx) + at(ix + 1, iy) * tx;
      const bottom = at(ix, iy + 1) * (1 - tx) + at(ix + 1, iy + 1) * tx;
      const value = top * (1 - ty) + bottom * ty + (rand() - 0.5) * 0.12;
      if (value < share) {
        const i = (py * TILE + px) * 4;
        for (let k = 0; k < 4; k++) a.data[i + k] = b.data[i + k];
      }
    }
  }
  ctx.putImageData(a, dest[0], dest[1]);
}

function specks(ctx: CanvasRenderingContext2D, x: number, y: number, rand: () => number, n: number, size: number, color: string) {
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) ctx.fillRect(x + Math.floor(rand() * (TILE - size)), y + Math.floor(rand() * (TILE - size)), size, size);
}

function drawDirt(ctx: CanvasRenderingContext2D, x: number, y: number, band: BandDef, rand: () => number) {
  ctx.fillStyle = css(band.base);
  ctx.fillRect(x, y, TILE, TILE);
  // soft mottling
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = css(rand() < 0.5 ? band.dark : band.light, 0.18);
    ctx.fillRect(x + Math.floor(rand() * 24), y + Math.floor(rand() * 24), 6 + Math.floor(rand() * 6), 4 + Math.floor(rand() * 4));
  }
  switch (band.style) {
    case 'soil':
      specks(ctx, x, y, rand, 12, 2, css(band.dark));
      specks(ctx, x, y, rand, 6, 1, css(band.light));
      // an occasional muted pebble, kept dull so it never reads as ore
      if (rand() < 0.5) {
        const px = x + 3 + Math.floor(rand() * 24);
        const py = y + 3 + Math.floor(rand() * 24);
        ctx.fillStyle = css(mix(band.base, 0x8c7a64, 0.6));
        ctx.fillRect(px, py, 3, 2);
        ctx.fillStyle = css(mix(band.light, 0x8c7a64, 0.4));
        ctx.fillRect(px, py, 2, 1);
      }
      break;
    case 'clay':
      for (let i = 0; i < 3; i++) {
        let ly = y + 5 + i * 9 + Math.floor(rand() * 3);
        ctx.fillStyle = css(band.dark);
        for (let lx = 0; lx < TILE; lx += 4) {
          if (rand() < 0.3) ly += rand() < 0.5 ? -1 : 1;
          ctx.fillRect(x + lx, Math.max(y, Math.min(y + TILE - 1, ly)), 4, 1);
        }
      }
      specks(ctx, x, y, rand, 5, 1, css(band.light));
      break;
    case 'stone':
    case 'hot': {
      const crack = band.style === 'hot' ? css(0xff6a1a) : css(band.dark);
      for (let i = 0; i < 2; i++) {
        let cx = x + 4 + Math.floor(rand() * 24);
        let cy = y + 4 + Math.floor(rand() * 24);
        for (let s = 0; s < 8; s++) {
          ctx.fillStyle = crack;
          ctx.fillRect(cx, cy, 1, 1);
          if (band.style === 'hot' && s % 3 === 0) {
            ctx.fillStyle = css(0xffc04d);
            ctx.fillRect(cx, cy, 1, 1);
          }
          cx = Math.max(x, Math.min(x + TILE - 1, cx + (rand() < 0.5 ? 1 : -1)));
          cy = Math.max(y, Math.min(y + TILE - 1, cy + (rand() < 0.7 ? 1 : 0)));
        }
      }
      specks(ctx, x, y, rand, 6, 2, css(band.light, 0.7));
      specks(ctx, x, y, rand, 6, 1, css(band.dark));
      break;
    }
    case 'basalt':
      for (let i = 0; i < 3; i++) {
        const px = x + Math.floor(rand() * 22);
        const py = y + Math.floor(rand() * 22);
        const s = 5 + Math.floor(rand() * 5);
        ctx.fillStyle = css(band.light, 0.5);
        ctx.beginPath();
        ctx.moveTo(px, py + s);
        ctx.lineTo(px + s, py);
        ctx.lineTo(px + s + 3, py + s);
        ctx.closePath();
        ctx.fill();
      }
      specks(ctx, x, y, rand, 8, 1, css(band.dark));
      break;
  }
}

function drawBack(ctx: CanvasRenderingContext2D, x: number, y: number, band: BandDef, rand: () => number) {
  ctx.fillStyle = css(band.back);
  ctx.fillRect(x, y, TILE, TILE);
  specks(ctx, x, y, rand, 10, 2, css(mix(band.back, 0x000000, 0.35)));
  specks(ctx, x, y, rand, 4, 1, css(mix(band.back, band.base, 0.25)));
}

function drawEdge(ctx: CanvasRenderingContext2D, x: number, y: number, band: BandDef, mask: number, rand: () => number) {
  const top = mask & 1, right = mask & 2, bottom = mask & 4, left = mask & 8;
  if (top) {
    ctx.fillStyle = css(band.light);
    ctx.fillRect(x, y, TILE, 2);
    ctx.fillStyle = css(mix(band.light, band.base, 0.5));
    ctx.fillRect(x, y + 2, TILE, 1);
  }
  ctx.fillStyle = css(band.dark, 0.85);
  if (bottom) ctx.fillRect(x, y + TILE - 3, TILE, 3);
  if (left) ctx.fillRect(x, y, 2, TILE);
  if (right) ctx.fillRect(x + TILE - 2, y, 2, TILE);

  // Rough, chipped outline on open sides.
  ctx.fillStyle = css(band.back);
  const notch = (nx: number, ny: number, w: number, h: number) => ctx.fillRect(x + nx, y + ny, w, h);
  for (let i = 0; i < 4; i++) {
    const p = 3 + Math.floor(rand() * (TILE - 8));
    const w = 1 + Math.floor(rand() * 3);
    if (top) notch(p, 0, w, 1);
    if (bottom) notch(p, TILE - 1, w, 1);
    if (left) notch(0, p, 1, w);
    if (right) notch(TILE - 1, p, 1, w);
  }
  // Rounded corners where two open sides meet.
  const corner = (flipX: boolean, flipY: boolean) => {
    for (const [cx, cy] of [[0, 0], [1, 0], [2, 0], [3, 0], [0, 1], [1, 1], [0, 2], [0, 3]]) {
      notch(flipX ? TILE - 1 - cx : cx, flipY ? TILE - 1 - cy : cy, 1, 1);
    }
  };
  if (top && left) corner(false, false);
  if (top && right) corner(true, false);
  if (bottom && left) corner(false, true);
  if (bottom && right) corner(true, true);
}

function drawGrass(ctx: CanvasRenderingContext2D, x: number, y: number, rand: () => number) {
  ctx.fillStyle = css(0x3c7d2e);
  ctx.fillRect(x, y, TILE, 7);
  ctx.fillStyle = css(0x4c9a3b);
  ctx.fillRect(x, y, TILE, 5);
  for (let gx = 0; gx < TILE; gx += 2) {
    const h = 1 + Math.floor(rand() * 3);
    ctx.fillStyle = css(rand() < 0.3 ? 0x6cc04a : 0x4c9a3b);
    ctx.fillRect(x + gx, y, 1, h);
    ctx.fillStyle = css(0x3c7d2e);
    ctx.fillRect(x + gx, y + 6 + Math.floor(rand() * 2), 1, 1);
  }
}

function drawBedrock(ctx: CanvasRenderingContext2D, x: number, y: number, rand: () => number) {
  ctx.fillStyle = css(0x24242a);
  ctx.fillRect(x, y, TILE, TILE);
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = css(rand() < 0.5 ? 0x34343c : 0x1a1a1f);
    ctx.fillRect(x + Math.floor(rand() * 26), y + Math.floor(rand() * 26), 6, 5);
  }
}

function drawPad(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, TILE, TILE);
  ctx.clip(); // hazard stripes run past the right edge
  ctx.fillStyle = css(0x8f9399);
  ctx.fillRect(x, y, TILE, TILE);
  ctx.fillStyle = css(0x7a7e84);
  ctx.fillRect(x, y + 12, TILE, 1);
  ctx.fillRect(x, y + 22, TILE, 1);
  ctx.fillStyle = css(0x6f737a);
  ctx.fillRect(x, y + TILE - 2, TILE, 2);
  ctx.fillRect(x + TILE - 1, y, 1, TILE);
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = i % 2 ? css(0x222222) : css(0xf2c200);
    ctx.beginPath();
    ctx.moveTo(x + i * 8, y + 6);
    ctx.lineTo(x + i * 8 + 4, y);
    ctx.lineTo(x + i * 8 + 12, y);
    ctx.lineTo(x + i * 8 + 8, y + 6);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// Per-metal touches: a body colour or seam tint if they differ from the ore colour,
// flecks (copper patina, iron rust) and how many white glints each lump gets.
interface MetalLook {
  body?: number;
  seam?: number;
  fleck?: number;
  glints: number;
}
const METAL_LOOK: Record<string, MetalLook> = {
  Copper: { fleck: 0x3fae8c, glints: 1 },
  Iron: { body: 0x9a8f86, seam: 0x8b4a2b, fleck: 0xa0522d, glints: 1 },
  Silver: { glints: 2 },
  Gold: { glints: 2 },
  Platinum: { glints: 1 },
};

function drawOre(ctx: CanvasRenderingContext2D, x: number, y: number, i: number, rand: () => number) {
  const ore = ORES[i];
  if (GEMS.has(ore.name)) drawGems(ctx, x, y, ore.color, rand);
  else drawVein(ctx, x, y, ore.color, METAL_LOOK[ore.name] ?? { glints: 1 }, rand);
}

// Metal runs in a vein: a faint mineral-stained seam crossing the tile, with
// lumps of mixed size spaced along it, so ore covers the tile without a grid look.
function drawVein(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  color: number,
  look: MetalLook,
  rand: () => number,
) {
  // A wobbly line through (near) the middle at a random angle, running past both edges.
  const angle = rand() * Math.PI;
  const [dx, dy] = [Math.cos(angle), Math.sin(angle)];
  const off = (rand() - 0.5) * 8;
  const [cx, cy] = [TILE / 2 - dy * off, TILE / 2 + dx * off];
  const pts: [number, number][] = [];
  for (let i = 0; i <= 8; i++) {
    const t = (i / 8 - 0.5) * 46;
    const j = (rand() - 0.5) * 5;
    pts.push([cx + dx * t - dy * j, cy + dy * t + dx * j]);
  }

  const seam = mix(look.seam ?? color, 0x000000, 0.6);
  for (let py = 0; py < TILE; py++) {
    for (let px = 0; px < TILE; px++) {
      let d = Infinity;
      for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, distToSegment(px + 0.5, py + 0.5, pts[i], pts[i + 1]));
      if (d < 1.4 + 0.8 * Math.sin(px * 0.9 + py * 0.7)) dot(ctx, ox + px, oy + py, css(seam, rand() < 0.25 ? 0.18 : 0.35));
    }
  }

  // Lumps spaced evenly along the vein, one of them big.
  const n = 5 + Math.floor(rand() * 2);
  const big = Math.floor(rand() * n);
  for (let i = 0; i < n; i++) {
    const at = ((i + 0.5) / n) * (pts.length - 1);
    const [a, b] = [pts[Math.floor(at)], pts[Math.min(pts.length - 1, Math.floor(at) + 1)]];
    const f = at % 1;
    const r = i === big ? 5.2 + rand() * 1.2 : 3 + rand() * 1.4;
    const x = Phaser.Math.Clamp(a[0] + (b[0] - a[0]) * f + (rand() - 0.5) * 3, r + 1.5, TILE - r - 1.5);
    const y = Phaser.Math.Clamp(a[1] + (b[1] - a[1]) * f + (rand() - 0.5) * 3, r + 1.5, TILE - r - 1.5);
    drawLump(ctx, ox, oy, x, y, r, look.body ?? color, look, rand);
  }
}

// Rounded, lumpy metal lump lit from the top left.
function drawLump(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  cx: number,
  cy: number,
  r: number,
  color: number,
  look: MetalLook,
  rand: () => number,
) {
  const k = 2 + Math.floor(rand() * 3);
  const phase = rand() * Math.PI * 2;
  const squash = 0.75 + rand() * 0.25;
  const inside = (x: number, y: number) => {
    const [dx, dy] = [x - cx, y - cy];
    return Math.hypot(dx, dy / squash) <= r * (1 + 0.14 * Math.sin(k * Math.atan2(dy, dx) + phase));
  };
  const outline = css(mix(color, 0x000000, 0.6));
  const shadow = css(mix(color, 0x000000, 0.3));
  const base = css(color);
  const light = css(mix(color, 0xffffff, 0.45));
  let glints = 0;
  pixelShape(ctx, ox, oy, inside, (x, y, edge) => {
    if (edge) return outline;
    const lit = -((x - cx) * 0.7 + (y - cy)) / r;
    if (lit > 0.55 && glints < look.glints) {
      glints++;
      return '#ffffff';
    }
    if (lit > 0.35) return light;
    if (lit < -0.45) return shadow;
    if (look.fleck !== undefined && rand() < 0.12) return css(look.fleck);
    return base;
  });
}

// Gems grow as 2-3 clusters of crystal shards, each fanning out of a dark pocket.
function drawGems(ctx: CanvasRenderingContext2D, ox: number, oy: number, color: number, rand: () => number) {
  const spots = [
    [7 + rand() * 4, 9 + rand() * 4],
    [20 + rand() * 5, 7 + rand() * 5],
    [11 + rand() * 8, 22 + rand() * 4],
  ].slice(0, rand() < 0.6 ? 3 : 2);
  for (const [cx, cy] of spots) {
    for (let y = -3; y <= 2; y++) {
      for (let x = -4; x <= 4; x++) {
        if ((x * x) / 16 + (y * y) / 6 < 1 && rand() < 0.9) dot(ctx, ox + Math.round(cx + x), oy + Math.round(cy + y + 3), 'rgba(0,0,0,0.35)');
      }
    }
    const n = 2 + Math.floor(rand() * 2);
    for (let i = 0; i < n; i++) {
      const spread = i - (n - 1) / 2;
      drawShard(ctx, ox, oy, cx + spread * 2, cy + 5, spread * 0.55 + (rand() - 0.5) * 0.3, 8 + rand() * 4, 4 + rand() * 1.5, color);
    }
  }
}

// One crystal: a prism from (bx, by) leaning by `angle`, with a pointed tip.
// Lit facet on the left, dark at the base, white glint near the tip.
function drawShard(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  bx: number,
  by: number,
  angle: number,
  len: number,
  width: number,
  color: number,
) {
  const [s, c] = [Math.sin(angle), Math.cos(angle)];
  const along = (x: number, y: number) => (x - bx) * s - (y - by) * c;
  const across = (x: number, y: number) => (x - bx) * c + (y - by) * s;
  const inside = (x: number, y: number) => {
    const u = along(x, y);
    if (u < 0 || u > len) return false;
    const half = u < len * 0.7 ? width / 2 : ((width / 2) * (len - u)) / (len * 0.3);
    return Math.abs(across(x, y)) <= half;
  };
  const outline = css(mix(color, 0x000000, 0.6));
  const dark = css(mix(color, 0x000000, 0.3));
  const base = css(color);
  const light = css(mix(color, 0xffffff, 0.5));
  pixelShape(ctx, ox, oy, inside, (x, y, edge) => {
    if (edge) return outline;
    const [u, v] = [along(x, y), across(x, y)];
    if (u > len * 0.72 && Math.abs(v) < 1) return '#ffffff';
    if (v < 0) return light;
    return u < len * 0.35 ? dark : base;
  });
}

// An irregular chunk of rock: a jittered 7-9 sided outline, faces shaded by
// which way they point (lit from the top left), a lit rim on top and a crack or two.
function drawBoulder(ctx: CanvasRenderingContext2D, ox: number, oy: number, rand: () => number) {
  const n = 7 + Math.floor(rand() * 3);
  const cx = TILE / 2 + (rand() - 0.5) * 2;
  const cy = TILE / 2 + 1 + (rand() - 0.5) * 2;
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (rand() - 0.5) * 0.5;
    const r = 11.5 + rand() * 3.5;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.88]);
  }
  const inside = (x: number, y: number) => {
    let hit = false;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const [xi, yi] = pts[i];
      const [xj, yj] = pts[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  };

  // Faces fan out from a peak up and left of centre; each takes the tone of the
  // way its outer edge points.
  const peakX = cx - 3 + (rand() - 0.5) * 3;
  const peakY = cy - 4 + (rand() - 0.5) * 3;
  const faceAngles = pts.map(([px, py], i) => {
    const [qx, qy] = pts[(i + 1) % n];
    return Math.atan2((py + qy) / 2 - peakY, (px + qx) / 2 - peakX);
  });
  const faceLight = faceAngles.map((a) => -(Math.cos(a) * 0.6 + Math.sin(a)) / Math.hypot(0.6, 1));
  const faceAt = (x: number, y: number) => {
    const a = Math.atan2(y - peakY, x - peakX);
    let best = 0;
    let bestD = Infinity;
    faceAngles.forEach((fa, i) => {
      const d = Math.abs(((a - fa + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (d < bestD) [best, bestD] = [i, d];
    });
    return best;
  };
  const tones = ['#4a4a52', '#66666e', '#8a8a93', '#b4b4bc'];

  const cracks = new Set<string>();
  const crackCount = 1 + Math.floor(rand() * 2);
  for (let c = 0; c < crackCount; c++) {
    let [x, y] = [cx + (rand() - 0.5) * 10, cy + (rand() - 0.5) * 8];
    const a = rand() * Math.PI * 2;
    for (let s = 0; s < 6; s++) {
      cracks.add(`${Math.round(x)},${Math.round(y)}`);
      x += Math.cos(a + (rand() - 0.5) * 1.2) * 1.2;
      y += Math.sin(a + (rand() - 0.5) * 1.2) * 1.2;
    }
  }

  pixelShape(ctx, ox, oy, inside, (x, y, edge) => {
    if (edge) return (x - cx) * 0.6 + (y - cy) < -6 ? '#9a9aa2' : '#2a2a30';
    if (cracks.has(`${Math.floor(x)},${Math.floor(y)}`)) return '#3d3d44';
    if (Math.hypot(x - peakX, y - peakY) < 3.2) return tones[2];
    const l = faceLight[faceAt(x, y)];
    return tones[l > 0.55 ? 3 : l > 0.05 ? 2 : l > -0.5 ? 1 : 0];
  });
}

// Rasterise a shape into crisp pixels within one tile: inside(x, y) says if a
// point (tile px) is in it, paint(x, y, edge) picks the colour of a pixel
// (edge = on the outline). Adds a one-pixel drop shadow down and right.
function pixelShape(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  inside: (x: number, y: number) => boolean,
  paint: (x: number, y: number, edge: boolean) => string,
) {
  const mask = new Uint8Array(TILE * TILE);
  for (let py = 0; py < TILE; py++) for (let px = 0; px < TILE; px++) mask[py * TILE + px] = inside(px + 0.5, py + 0.5) ? 1 : 0;
  const isIn = (px: number, py: number) => px >= 0 && py >= 0 && px < TILE && py < TILE && mask[py * TILE + px] === 1;
  for (let py = 0; py < TILE; py++) {
    for (let px = 0; px < TILE; px++) {
      if (!isIn(px, py) && isIn(px - 1, py - 1)) dot(ctx, ox + px, oy + py, 'rgba(0,0,0,0.35)');
    }
  }
  for (let py = 0; py < TILE; py++) {
    for (let px = 0; px < TILE; px++) {
      if (!isIn(px, py)) continue;
      const edge = !isIn(px - 1, py) || !isIn(px + 1, py) || !isIn(px, py - 1) || !isIn(px, py + 1);
      dot(ctx, ox + px, oy + py, paint(px + 0.5, py + 0.5, edge));
    }
  }
}

function distToSegment(x: number, y: number, a: [number, number], b: [number, number]): number {
  const [vx, vy] = [b[0] - a[0], b[1] - a[1]];
  const t = Phaser.Math.Clamp(((x - a[0]) * vx + (y - a[1]) * vy) / (vx * vx + vy * vy), 0, 1);
  return Math.hypot(x - a[0] - vx * t, y - a[1] - vy * t);
}

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, 1, 1);
}
