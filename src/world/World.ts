import { GEN, ORES, WORLD } from '../config';
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

  private generate(): void {
    const rand = mulberry32(this.seed);
    for (let row = this.surfaceRow; row < this.rows; row++) {
      const depth = this.depthOf(row);
      for (let col = 0; col < this.cols; col++) {
        this.set(col, row, this.pickTile(depth, rand));
      }
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
