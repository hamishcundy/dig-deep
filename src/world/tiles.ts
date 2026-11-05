import { ORES } from '../config';

// Tile ids are stored in saves, so existing ones must not change.
export const Tile = {
  Empty: 0,
  Dirt: 1,
  Topsoil: 2,
  Boulder: 3,
  Bedrock: 4,
  Pad: 5, // concrete under a building
  FirstOre: 6, // ORES[i] is tile FirstOre + i
  Cloud: 64, // sky blocks; ore ids must stay below these
  Blast: 65, // can't be drilled: touching it lights the fuse
  Bounce: 66,
  Crumble: 67,
} as const;

export function oreTile(oreIndex: number): number {
  return Tile.FirstOre + oreIndex;
}

export function isOre(tile: number): boolean {
  return tile >= Tile.FirstOre && tile < Tile.Cloud;
}

export function oreIndex(tile: number): number {
  return tile - Tile.FirstOre;
}

export function isSolid(tile: number): boolean {
  return tile !== Tile.Empty;
}

export function isDrillable(tile: number): boolean {
  return tile !== Tile.Empty && tile !== Tile.Boulder && tile !== Tile.Bedrock && tile !== Tile.Pad && tile !== Tile.Blast;
}

// Sky blocks and sky ore: soft enough to drill from below.
export function isSky(tile: number): boolean {
  return tile >= Tile.Cloud || (isOre(tile) && !!ORES[oreIndex(tile)].sky);
}
