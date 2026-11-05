import { BUILDINGS, GEN, GORLAB, ORES, SKY, WORLD } from '../config';
import { Tile, oreTile } from './tiles';

// Small, fast seeded RNG (mulberry32) so a seed always builds the same world.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Gorlab's cavern, in tiles: columns c0..c1 and rows r0..r1 inclusive.
export interface Cavern {
  c0: number;
  c1: number;
  r0: number;
  r1: number;
}

export class World {
  readonly cols = WORLD.width;
  readonly surfaceRow = WORLD.skyRows;
  readonly rows = WORLD.skyRows + WORLD.depth + 1; // +1 bedrock floor
  readonly cells: Uint8Array;
  readonly cavern: Cavern;
  ceilingRow: number; // the pod can't fly above this row until the sky opens

  constructor(readonly seed: number) {
    this.cells = new Uint8Array(this.cols * this.rows);
    const c0 = Math.floor((this.cols - GORLAB.cavernWidth) / 2);
    const r1 = this.rows - 2; // just above the bedrock floor
    this.cavern = { c0, c1: c0 + GORLAB.cavernWidth - 1, r0: r1 - GORLAB.cavernHeight + 1, r1 };
    this.ceilingRow = this.surfaceRow - SKY.lockedRows;
    this.generate();
  }

  // Outside the map counts as bedrock, so the edges, floor and sky ceiling are walls.
  get(col: number, row: number): number {
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return Tile.Bedrock;
    return this.cells[row * this.cols + col];
  }

  set(col: number, row: number, tile: number): void {
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return;
    this.cells[row * this.cols + col] = tile;
  }

  depthOf(row: number): number {
    return row - this.surfaceRow;
  }

  openSky(): void {
    this.ceilingRow = 0;
  }

  // Open Gorlab's cavern: a dome with a flat floor on the bedrock, its edge a
  // little ragged. Also run on loaded saves from before the cavern existed.
  carveCavern(): void {
    const { c0, c1, r0, r1 } = this.cavern;
    const cx = (c0 + c1) / 2;
    const halfW = (c1 - c0) / 2;
    const h = r1 - r0 + 1;
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const ragged = 1 + 0.12 * Math.sin(c * 1.3 + r * 0.7);
        if (((c - cx) / halfW) ** 2 + ((r1 + 0.5 - r) / h) ** 2 < ragged) this.set(c, r, Tile.Empty);
      }
    }
  }

  // Earthquake: split the ground below the surface into layers of layerMin-layerMax
  // rows and slide each one a tile left, right or not at all. The column that
  // opens at one edge gets fresh ground; the one pushed off the other edge is lost.
  // Gorlab's cavern and everything below it stay put.
  quake(layerMin: number, layerMax: number, rand: () => number = Math.random): void {
    const floor = this.cavern.r0;
    let row = this.surfaceRow + 1;
    while (row < floor) {
      const height = layerMin + Math.floor(rand() * (layerMax - layerMin + 1));
      const shift = Math.floor(rand() * 3) - 1;
      for (let r = row; r < Math.min(floor, row + height); r++) if (shift !== 0) this.shiftRow(r, shift, rand);
      row += height;
    }
  }

  private shiftRow(row: number, shift: number, rand: () => number): void {
    const old = this.cells.slice(row * this.cols, (row + 1) * this.cols);
    for (let col = 0; col < this.cols; col++) {
      const from = col - shift;
      this.set(col, row, from >= 0 && from < this.cols ? old[from] : this.pickTile(this.depthOf(row), rand));
    }
  }

  private generate(): void {
    const rand = mulberry32(this.seed);
    for (let row = this.surfaceRow; row < this.rows; row++) {
      const depth = this.depthOf(row);
      for (let col = 0; col < this.cols; col++) {
        this.set(col, row, this.pickTile(depth, rand));
      }
    }
    for (const b of BUILDINGS) {
      for (let col = b.col; col < b.col + b.width; col++) this.set(col, this.surfaceRow, Tile.Pad);
    }
    this.carveCavern();
    this.generateSky();
  }

  // Floating islands: wherever smooth noise is high enough. Patches of blast and
  // crumbling cloud come from noise of their own, so they clump. Uses its own random
  // stream, so a seed's underground is the same with or without the sky.
  private generateSky(): void {
    const rand = mulberry32(this.seed ^ 0x51c0);
    const broad = valueNoise(rand, 9, 5);
    const fine = valueNoise(rand, 4, 3);
    const blast = valueNoise(rand, 3, 3); // small patches, so one fuse doesn't take a whole island
    const crumble = valueNoise(rand, 5, 3);
    const span = SKY.islandsTo - SKY.islandsFrom;
    for (let height = SKY.islandsFrom; height <= SKY.islandsTo; height++) {
      const row = this.surfaceRow - height;
      const up = (height - SKY.islandsFrom) / span;
      const blastAbove = SKY.blastThreshold.low + (SKY.blastThreshold.high - SKY.blastThreshold.low) * up;
      for (let col = 0; col < this.cols; col++) {
        if (0.65 * broad(col, row) + 0.35 * fine(col, row) < SKY.islandThreshold) continue;
        this.set(col, row, this.pickSkyTile(height, blast(col, row) > blastAbove, crumble(col, row) > SKY.crumbleThreshold, rand));
      }
    }
  }

  private pickSkyTile(height: number, inBlast: boolean, inCrumble: boolean, rand: () => number): number {
    if (inBlast) return Tile.Blast;
    if (rand() < SKY.oreChance) {
      const unlocked = ORES.map((ore, i) => ({ ore, i })).filter(({ ore }) => ore.sky && height >= ore.minDepth);
      return oreTile(weightedPick(unlocked, rand));
    }
    if (inCrumble) return Tile.Crumble;
    return rand() < SKY.bounceChance ? Tile.Bounce : Tile.Cloud;
  }

  private pickTile(depth: number, rand: () => number): number {
    if (depth === 0) return Tile.Topsoil;
    if (depth === WORLD.depth) return Tile.Bedrock;

    if (depth >= GEN.boulderStartDepth) {
      const ramp = Math.min(1, (depth - GEN.boulderStartDepth) / (GEN.boulderRampDepth - GEN.boulderStartDepth));
      if (rand() < GEN.boulderChanceMax * ramp) return Tile.Boulder;
    }

    if (rand() < GEN.oreChance) {
      const unlocked = ORES.map((ore, i) => ({ ore, i })).filter(({ ore }) => !ore.sky && depth >= ore.minDepth);
      return oreTile(weightedPick(unlocked, rand));
    }

    return Tile.Dirt;
  }
}

function weightedPick(options: { ore: { weight: number }; i: number }[], rand: () => number): number {
  const total = options.reduce((sum, { ore }) => sum + ore.weight, 0);
  let pick = rand() * total;
  for (const { ore, i } of options) {
    pick -= ore.weight;
    if (pick <= 0) return i;
  }
  return options[options.length - 1].i;
}

// Smooth noise (0..1): random values on a lattice cellW by cellH tiles, blended between.
function valueNoise(rand: () => number, cellW: number, cellH: number): (col: number, row: number) => number {
  const values = new Map<number, number>();
  const at = (i: number, j: number) => {
    const key = j * 4096 + i;
    let v = values.get(key);
    if (v === undefined) {
      v = rand();
      values.set(key, v);
    }
    return v;
  };
  const smooth = (t: number) => t * t * (3 - 2 * t);
  return (col, row) => {
    const [fx, fy] = [col / cellW, row / cellH];
    const [ix, iy] = [Math.floor(fx), Math.floor(fy)];
    const [tx, ty] = [smooth(fx - ix), smooth(fy - iy)];
    const top = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * tx;
    const bottom = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * tx;
    return top + (bottom - top) * ty;
  };
}
