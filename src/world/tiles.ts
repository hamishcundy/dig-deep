import { ORES } from '../config';

// Tile ids double as tileset frame indexes.
export const Tile = {
  Empty: 0,
  Dirt: 1,
  Topsoil: 2,
  Boulder: 3,
  Bedrock: 4,
  FirstOre: 5, // ORES[i] is tile FirstOre + i
} as const;

export const TILE_COUNT = Tile.FirstOre + ORES.length;

export function oreTile(oreIndex: number): number {
  return Tile.FirstOre + oreIndex;
}

export function isOre(tile: number): boolean {
  return tile >= Tile.FirstOre;
}

export function isSolid(tile: number): boolean {
  return tile !== Tile.Empty;
}

export function isDrillable(tile: number): boolean {
  return tile !== Tile.Empty && tile !== Tile.Boulder && tile !== Tile.Bedrock;
}
