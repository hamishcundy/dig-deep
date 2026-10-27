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
  boulder: (v: number) => 2 * NB * VARIANTS + 2 * VARIANTS + 1 + ORES.length * VARIANTS + (v % 2),
  // mask bits: 1 top, 2 right, 4 bottom, 8 left are open
  edge: (band: number, mask: number) => 2 * NB * VARIANTS + 2 * VARIANTS + 3 + ORES.length * VARIANTS + band * 16 + mask,
};

const FRAME_COUNT = Frame.edge(NB - 1, 15) + 1;
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
  for (let v = 0; v < VARIANTS; v++) {
    const [x, y] = at(Frame.topsoil(v));
    drawDirt(ctx, x, y, BANDS[0], mulberry32(900 + v));
    drawGrass(ctx, x, y, mulberry32(950 + v));
    drawBedrock(ctx, ...at(Frame.bedrock(v)), mulberry32(990 + v));
  }
  drawPad(ctx, ...at(Frame.pad()));
  ORES.forEach((ore, i) => {
    for (let v = 0; v < VARIANTS; v++) {
      const [x, y] = at(Frame.ore(i, v));
      drawOre(ctx, x, y, ore.color, GEMS.has(ore.name), mulberry32(1200 + i * 10 + v));
    }
    const [x, y] = at(Frame.ore(i, 0));
    tex.add(`ore${i}`, 0, x, y, TILE, TILE); // for HUD icons
  });
  for (let v = 0; v < 2; v++) drawBoulder(ctx, ...at(Frame.boulder(v)), mulberry32(1500 + v));
  tex.refresh();
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

// Ore spots spread evenly over the tile: a 3x3 grid of cells, most of which
// get one spot placed at random inside it, so spots never overlap or clump.
function drawOre(ctx: CanvasRenderingContext2D, x: number, y: number, color: number, gem: boolean, rand: () => number) {
  const cells = Array.from({ length: 9 }, (_, i) => i);
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  const count = gem ? 4 + Math.floor(rand() * 2) : 6 + Math.floor(rand() * 2);
  const cs = TILE / 3;
  for (const cell of cells.slice(0, count)) {
    const r = gem ? 3.8 + rand() * 0.7 : 3 + rand() * 1.2;
    const room = Math.max(0, cs - 2 * r - 2);
    const cx = (cell % 3) * cs + r + 1 + rand() * room;
    const cy = Math.floor(cell / 3) * cs + r + 1 + rand() * room;
    if (gem) drawCrystal(ctx, x, y, cx, cy, r, color, rand);
    else drawNugget(ctx, x, y, cx, cy, r, color, rand);
  }
}

// Rasterise a shape into crisp pixels: fill(dx, dy) says if a pixel centre is inside,
// paint(dx, dy, edge) picks its colour (edge = on the outline).
function pixelShape(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  cx: number,
  cy: number,
  r: number,
  inside: (dx: number, dy: number) => boolean,
  paint: (dx: number, dy: number, edge: boolean) => string,
) {
  const x0 = Math.floor(cx - r - 1);
  const y0 = Math.floor(cy - r - 1);
  const x1 = Math.ceil(cx + r + 1);
  const y1 = Math.ceil(cy + r + 1);
  const test = (px: number, py: number) => inside(px + 0.5 - cx, py + 0.5 - cy);
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; // drop shadow, down and right
  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      if (!test(px, py) && test(px - 1, py - 1)) ctx.fillRect(ox + px, oy + py, 1, 1);
    }
  }
  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      if (!test(px, py)) continue;
      const edge = !test(px - 1, py) || !test(px + 1, py) || !test(px, py - 1) || !test(px, py + 1);
      ctx.fillStyle = paint(px + 0.5 - cx, py + 0.5 - cy, edge);
      ctx.fillRect(ox + px, oy + py, 1, 1);
    }
  }
}

// Rounded, lumpy metal nugget lit from the top left.
function drawNugget(ctx: CanvasRenderingContext2D, ox: number, oy: number, cx: number, cy: number, r: number, color: number, rand: () => number) {
  const k = 2 + Math.floor(rand() * 2);
  const phase = rand() * Math.PI * 2;
  const squash = 0.8 + rand() * 0.2;
  const inside = (dx: number, dy: number) => {
    const a = Math.atan2(dy, dx);
    const edge = r * (1 + 0.1 * Math.sin(k * a + phase));
    return Math.hypot(dx, dy / squash) <= edge;
  };
  const outline = css(mix(color, 0x000000, 0.55));
  const shadow = css(mix(color, 0x000000, 0.25));
  const base = css(color);
  const light = css(mix(color, 0xffffff, 0.45));
  let spec = false;
  pixelShape(ctx, ox, oy, cx, cy, r, inside, (dx, dy, edge) => {
    if (edge) return outline;
    // light falls on a small crescent at the top left, shade on the lower right
    const lit = -(dx * 0.7 + dy) / r;
    if (lit > 0.6 && !spec) {
      spec = true;
      return '#ffffff';
    }
    if (lit > 0.45) return light;
    if (lit < -0.5) return shadow;
    return base;
  });
}

// Faceted crystal: a tall diamond, light facet on the left, dark on the right.
function drawCrystal(ctx: CanvasRenderingContext2D, ox: number, oy: number, cx: number, cy: number, r: number, color: number, rand: () => number) {
  const wide = 0.7 + rand() * 0.15;
  const inside = (dx: number, dy: number) => Math.abs(dx) / (r * wide) + Math.abs(dy) / r <= 1;
  const outline = css(mix(color, 0x000000, 0.55));
  const dark = css(mix(color, 0x000000, 0.25));
  const base = css(color);
  const light = css(mix(color, 0xffffff, 0.5));
  pixelShape(ctx, ox, oy, cx, cy, r, inside, (dx, dy, edge) => {
    if (edge) return outline;
    if (dy < -r * 0.35 && Math.abs(dx) < 1) return '#ffffff';
    if (dx < 0) return dy < 0 ? light : base;
    return dy < 0 ? base : dark;
  });
}

function drawBoulder(ctx: CanvasRenderingContext2D, x: number, y: number, rand: () => number) {
  const inset = 1 + Math.floor(rand() * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.roundRect(x + inset, y + inset + 2, TILE - inset * 2, TILE - inset * 2 - 1, 9);
  ctx.fill();
  ctx.fillStyle = css(0x6d6d74);
  ctx.beginPath();
  ctx.roundRect(x + inset, y + inset, TILE - inset * 2, TILE - inset * 2 - 2, 9);
  ctx.fill();
  ctx.fillStyle = css(0x85858d);
  ctx.beginPath();
  ctx.roundRect(x + inset + 3, y + inset + 2, TILE - inset * 2 - 10, 10, 5);
  ctx.fill();
  ctx.fillStyle = css(0xa3a3ab);
  ctx.fillRect(x + inset + 6, y + inset + 4, 5, 2);
  ctx.fillStyle = css(0x4f4f56);
  for (let i = 0; i < 3; i++) ctx.fillRect(x + 8 + Math.floor(rand() * 14), y + 16 + Math.floor(rand() * 8), 3, 1);
}
