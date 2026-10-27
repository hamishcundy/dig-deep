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

// Per-metal touches: a body colour if it differs from the ore colour, patina
// patches (copper), rust specks (iron) and how often a pixel catches a glint.
interface MetalLook {
  body?: number;
  patina?: number;
  rust?: number;
  glint: number;
}
const METAL_LOOK: Record<string, MetalLook> = {
  Copper: { patina: 0x3fae8c, glint: 0.08 },
  Iron: { body: 0x9a8f86, rust: 0xa0522d, glint: 0.04 },
  Silver: { glint: 0.2 },
  Gold: { glint: 0.2 },
  Platinum: { glint: 0.16 },
};

function drawOre(ctx: CanvasRenderingContext2D, x: number, y: number, i: number, rand: () => number) {
  const ore = ORES[i];
  if (GEMS.has(ore.name)) drawGems(ctx, x, y, ore.color, rand);
  else drawGrains(ctx, x, y, ore.color, METAL_LOOK[ore.name] ?? { glint: 0.1 }, rand);
}

// Metal ore as grains packed through the rock: up to 22 small lumpy grains over
// the whole tile, denser where a smooth noise field is high, so they clump
// naturally. Each grain is lit on its top-left edge and shaded on its bottom-right.
function drawGrains(ctx: CanvasRenderingContext2D, ox: number, oy: number, color: number, look: MetalLook, rand: () => number) {
  const field = valueNoise(rand, 9);
  const fine = valueNoise(rand, 3);
  interface Grain {
    x: number;
    y: number;
    r: number;
    k: number;
    phase: number;
  }
  const grains: Grain[] = [];
  for (let tries = 0; grains.length < 22 && tries < 600; tries++) {
    const x = 1.5 + rand() * (TILE - 3);
    const y = 1.5 + rand() * (TILE - 3);
    if (rand() > 0.25 + field(x, y) * 0.9) continue;
    const r = 1.3 + rand() * 1.9 * (0.6 + field(x, y));
    if (grains.some((g) => Math.hypot(g.x - x, g.y - y) < g.r + r + 0.6)) continue;
    grains.push({ x, y, r, k: 2 + Math.floor(rand() * 3), phase: rand() * Math.PI * 2 });
  }

  // Which grain (index) covers each pixel, or -1.
  const owner = new Int16Array(TILE * TILE).fill(-1);
  grains.forEach((g, i) => {
    for (let py = 0; py < TILE; py++) {
      for (let px = 0; px < TILE; px++) {
        const [dx, dy] = [px + 0.5 - g.x, py + 0.5 - g.y];
        if (owner[py * TILE + px] < 0 && Math.hypot(dx, dy) <= g.r * (1 + 0.22 * Math.sin(g.k * Math.atan2(dy, dx) + g.phase))) {
          owner[py * TILE + px] = i;
        }
      }
    }
  });
  const at = (px: number, py: number) => (px < 0 || py < 0 || px >= TILE || py >= TILE ? -1 : owner[py * TILE + px]);

  const body = look.body ?? color;
  const dark = css(mix(body, 0x000000, 0.5));
  const shade = css(mix(body, 0x000000, 0.25));
  const base = css(body);
  const light = css(mix(body, 0xffffff, 0.45));
  for (let py = 0; py < TILE; py++) {
    for (let px = 0; px < TILE; px++) {
      const i = at(px, py);
      if (i < 0) {
        // shadow under each grain, and the rock a touch darker where grains cluster
        if (at(px - 1, py - 1) >= 0) dot(ctx, ox + px, oy + py, 'rgba(0,0,0,0.3)');
        else if (field(px, py) > 0.55 && rand() < 0.5) dot(ctx, ox + px, oy + py, 'rgba(0,0,0,0.12)');
        continue;
      }
      const g = grains[i];
      const bottomRight = at(px + 1, py) !== i || at(px, py + 1) !== i;
      const topLeft = at(px - 1, py) !== i || at(px, py - 1) !== i;
      const lit = -((px + 0.5 - g.x) * 0.7 + (py + 0.5 - g.y)) / g.r;
      let c = base;
      if (bottomRight && !topLeft) c = dark;
      else if (topLeft && !bottomRight) c = light;
      else if (bottomRight && topLeft) c = lit > 0 ? light : dark;
      else if (lit > 0.35) c = light;
      else if (lit < -0.35) c = shade;
      if (!bottomRight) {
        if (lit > 0.3 && rand() < look.glint) c = '#ffffff';
        if (look.patina !== undefined && fine(px, py) < 0.35 && rand() < 0.4) c = css(look.patina);
        if (look.rust !== undefined && rand() < 0.12) c = css(look.rust);
      }
      dot(ctx, ox + px, oy + py, c);
    }
  }
}

// Gems as small faceted chips scattered over the tile, plus one or two raw
// crystal clusters growing out of the rock.
function drawGems(ctx: CanvasRenderingContext2D, ox: number, oy: number, color: number, rand: () => number) {
  const field = valueNoise(rand, 9);
  for (let py = 0; py < TILE; py++) {
    for (let px = 0; px < TILE; px++) if (field(px, py) > 0.6 && rand() < 0.6) dot(ctx, ox + px, oy + py, 'rgba(0,0,0,0.18)');
  }
  const chips: [number, number, number][] = [];
  for (let tries = 0; chips.length < 9 && tries < 400; tries++) {
    const x = 2.5 + rand() * (TILE - 5);
    const y = 2.5 + rand() * (TILE - 5);
    if (rand() > 0.3 + field(x, y) * 0.8) continue;
    const r = 1.8 + rand() * 1.6;
    if (chips.some(([cx, cy, cr]) => Math.hypot(cx - x, cy - y) < cr + r + 1.5)) continue;
    chips.push([x, y, r]);
  }
  for (const [x, y, r] of chips) drawChip(ctx, ox, oy, x, y, r, color);

  const clusters = rand() < 0.6 ? 2 : 1;
  for (let c = 0; c < clusters; c++) {
    const [cx, cy] = [7 + rand() * 18, 10 + rand() * 14];
    const n = 3 + Math.floor(rand() * 2);
    const tilt = (rand() - 0.5) * 0.6;
    for (let i = 0; i < n; i++) {
      const k = i - (n - 1) / 2;
      const len = 9 + rand() * 4 - Math.abs(k) * 2;
      drawCrystal(ctx, ox, oy, cx + k * 2.6, cy + 5, tilt + k * 0.42 + (rand() - 0.5) * 0.15, len, 3.6 + rand() * 1.4, color);
    }
  }
}

// A small diamond-shaped chip with a lit top-left facet and a glint.
function drawChip(ctx: CanvasRenderingContext2D, ox: number, oy: number, cx: number, cy: number, r: number, color: number) {
  const outline = css(mix(color, 0x000000, 0.5));
  const dark = css(mix(color, 0x000000, 0.3));
  const base = css(color);
  const light = css(mix(color, 0xffffff, 0.5));
  const inside = (x: number, y: number) => Math.abs(x - cx) + Math.abs(y - cy) * 1.2 <= r;
  pixelShape(ctx, ox, oy, inside, (x, y, edge) => {
    const [dx, dy] = [x - cx, y - cy];
    if (edge) return dx + dy > 0 ? outline : light;
    if (dx + dy < -r * 0.5) return '#ffffff';
    if (dx < 0) return light;
    return dy > 0 ? dark : base;
  }, false);
}

// One raw crystal: a prism from (bx, by) leaning by `angle`, with a pointed tip.
// Lit face on the left, dark on the right, a bright ridge and a glint at the tip.
function drawCrystal(
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
  const tip = width * 0.9;
  const inside = (x: number, y: number) => {
    const u = along(x, y);
    if (u < 0 || u > len) return false;
    const half = u < len - tip ? width / 2 : ((width / 2) * (len - u)) / tip;
    return Math.abs(across(x, y)) <= half;
  };
  const outline = css(mix(color, 0x000000, 0.55));
  const dark = css(mix(color, 0x000000, 0.3));
  const lit = css(mix(color, 0xffffff, 0.2));
  const light = css(mix(color, 0xffffff, 0.5));
  pixelShape(ctx, ox, oy, inside, (x, y, edge) => {
    if (edge) return outline;
    const [u, v] = [along(x, y), across(x, y)];
    if (Math.abs(v) < 0.6 && u > len * 0.5) return light;
    if (u > len - tip) return v < 0 ? '#ffffff' : light;
    return v < 0 ? lit : dark;
  }, false);
}

// Smooth value noise over one tile: random values on a lattice `cell` px apart,
// blended smoothly between. Returns 0..1.
function valueNoise(rand: () => number, cell: number): (x: number, y: number) => number {
  const n = Math.ceil(TILE / cell) + 2;
  const grid = Array.from({ length: n * n }, () => rand());
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const at = (i: number, j: number) => grid[(j + 1) * n + i + 1];
  return (x, y) => {
    const [fx, fy] = [x / cell, y / cell];
    const [ix, iy] = [Math.floor(fx), Math.floor(fy)];
    const [tx, ty] = [smooth(fx - ix), smooth(fy - iy)];
    const top = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * tx;
    const bottom = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * tx;
    return top + (bottom - top) * ty;
  };
}

// An irregular chunk of rock filling most of the tile: a jittered 8-11 sided outline, faces shaded by
// which way they point (lit from the top left), a lit rim on top and a crack or two.
function drawBoulder(ctx: CanvasRenderingContext2D, ox: number, oy: number, rand: () => number) {
  const n = 8 + Math.floor(rand() * 4);
  const cx = TILE / 2 + (rand() - 0.5) * 1.5;
  const cy = TILE / 2 + (rand() - 0.5) * 1.5;
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (rand() - 0.5) * 0.5;
    const r = 13 + rand() * 2.8;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.95]);
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
// (edge = on the outline). Adds a one-pixel drop shadow down and right unless told not to.
function pixelShape(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  inside: (x: number, y: number) => boolean,
  paint: (x: number, y: number, edge: boolean) => string,
  shadow = true,
) {
  const mask = new Uint8Array(TILE * TILE);
  for (let py = 0; py < TILE; py++) for (let px = 0; px < TILE; px++) mask[py * TILE + px] = inside(px + 0.5, py + 0.5) ? 1 : 0;
  const isIn = (px: number, py: number) => px >= 0 && py >= 0 && px < TILE && py < TILE && mask[py * TILE + px] === 1;
  for (let py = 0; shadow && py < TILE; py++) {
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

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, 1, 1);
}
