import Phaser from 'phaser';
import { ORES, TILE } from '../config';
import { mulberry32 } from '../world/World';
import { TILE_COUNT, Tile } from '../world/tiles';

// Placeholder art, drawn in code. Swap for a sprite sheet later.

const DIRT = '#8a5a35';
const DIRT_SPECK = '#6e4528';

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

export function makeTextures(scene: Phaser.Scene): void {
  makeTiles(scene);
  makePod(scene);
  makeFlame(scene);
}

function makeTiles(scene: Phaser.Scene): void {
  const tex = scene.textures.createCanvas('tiles', TILE * TILE_COUNT, TILE)!;
  const ctx = tex.getContext();
  const rand = mulberry32(7);

  const dirt = (ox: number) => {
    ctx.fillStyle = DIRT;
    ctx.fillRect(ox, 0, TILE, TILE);
    ctx.fillStyle = DIRT_SPECK;
    for (let i = 0; i < 10; i++) ctx.fillRect(ox + rand() * (TILE - 3), rand() * (TILE - 3), 3, 3);
  };

  for (let t = 1; t < TILE_COUNT; t++) {
    const ox = t * TILE;
    if (t === Tile.Bedrock) {
      ctx.fillStyle = '#2b2b30';
      ctx.fillRect(ox, 0, TILE, TILE);
      ctx.fillStyle = '#3a3a42';
      for (let i = 0; i < 6; i++) ctx.fillRect(ox + rand() * (TILE - 6), rand() * (TILE - 4), 6, 4);
      continue;
    }
    dirt(ox);
    if (t === Tile.Topsoil) {
      ctx.fillStyle = '#4c9a3b';
      ctx.fillRect(ox, 0, TILE, 6);
      ctx.fillStyle = '#3c7d2e';
      ctx.fillRect(ox, 6, TILE, 2);
    } else if (t === Tile.Boulder) {
      ctx.fillStyle = '#6d6d74';
      ctx.beginPath();
      ctx.roundRect(ox + 2, 3, TILE - 4, TILE - 5, 8);
      ctx.fill();
      ctx.fillStyle = '#8c8c94';
      ctx.fillRect(ox + 8, 8, 8, 5);
    } else if (t >= Tile.FirstOre) {
      const color = hex(ORES[t - Tile.FirstOre].color);
      const nuggets = [
        [6, 7],
        [18, 5],
        [12, 16],
        [22, 19],
        [7, 22],
      ];
      for (const [nx, ny] of nuggets) {
        ctx.fillStyle = '#00000055';
        ctx.fillRect(ox + nx + 1, ny + 1, 6, 6);
        ctx.fillStyle = color;
        ctx.fillRect(ox + nx, ny, 6, 6);
        ctx.fillStyle = '#ffffff88';
        ctx.fillRect(ox + nx, ny, 2, 2);
      }
    }
  }
  tex.refresh();
}

// Pod body fills the top 24px (the hitbox); the drill bit hangs below it.
export const POD_ORIGIN_Y = 12 / TILE;

function makePod(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  // tracks
  g.fillStyle(0x333333);
  g.fillRect(3, 19, 26, 5);
  // body
  g.fillStyle(0xf2b705);
  g.fillRect(4, 4, 24, 16);
  g.fillStyle(0xc99400);
  g.fillRect(4, 16, 24, 4);
  // cockpit, offset to the front (right) so flipping shows facing
  g.fillStyle(0x8fd3ff);
  g.fillRect(17, 6, 8, 7);
  g.fillStyle(0xffffff);
  g.fillRect(18, 7, 2, 2);
  // drill bit
  g.fillStyle(0x9a9aa2);
  g.fillTriangle(10, 24, 22, 24, 16, 32);
  g.fillStyle(0x6c6c74);
  g.fillTriangle(16, 24, 22, 24, 16, 32);
  g.generateTexture('pod', TILE, TILE);
  g.destroy();
}

function makeFlame(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  g.fillStyle(0xff7a00);
  g.fillTriangle(0, 0, 6, 0, 3, 10);
  g.fillStyle(0xffe066);
  g.fillTriangle(1.5, 0, 4.5, 0, 3, 5);
  g.generateTexture('flame', 6, 10);
  g.destroy();
}
