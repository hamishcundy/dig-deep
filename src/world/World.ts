import { BUILDINGS, GEN, ORES, WORLD } from '../config';
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

export class World {
  readonly cols = WORLD.width;
  readonly surfaceRow = WORLD.skyRows;
  readonly rows = WORLD.skyRows + WORLD.depth + 1; // +1 bedrock floor
  readonly cells: Uint8Array;

  constructor(readonly seed: number) {
    this.cells = new Uint8Array(this.cols * this.rows);
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

  // Earthquake: split the ground below the surface into layers of layerMin-layerMax
  // rows and slide each one a tile left, right or not at all. The column that
  // opens at one edge gets fresh ground; the one pushed off the other edge is lost.
  quake(layerMin: number, layerMax: number, rand: () => number = Math.random): void {
    const floor = this.rows - 1; // bedrock row stays
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
  }

  private pickTile(depth: number, rand: () => number): number {
    if (depth === 0) return Tile.Topsoil;
    if (depth === WORLD.depth) return Tile.Bedrock;

    if (depth >= GEN.boulderStartDepth) {
      const ramp = Math.min(1, (depth - GEN.boulderStartDepth) / (GEN.boulderRampDepth - GEN.boulderStartDepth));
      if (rand() < GEN.boulderChanceMax * ramp) return Tile.Boulder;
    }

    if (rand() < GEN.oreChance) {
      const unlocked = ORES.map((ore, i) => ({ ore, i })).filter(({ ore }) => depth >= ore.minDepth);
      const total = unlocked.reduce((sum, { ore }) => sum + ore.weight, 0);
      let pick = rand() * total;
      for (const { ore, i } of unlocked) {
        pick -= ore.weight;
        if (pick <= 0) return oreTile(i);
      }
    }

    return Tile.Dirt;
  }
}
