import Phaser from 'phaser';
import { BANDS, ORES, TILE } from '../config';
import { World } from '../world/World';
import { isOre, oreIndex, Tile } from '../world/tiles';
import { BLEND_LEVELS, Frame, VARIANTS } from './terrainArt';

const TRANSITION = 10; // rows over which one ground layer blends into the next

type Layer = Phaser.Tilemaps.TilemapLayer;

// Draws the world as four tilemap layers: tunnel back wall, ground, ore and
// boulders on top, then carved edges where a tile borders open space.
export class Terrain {
  private back: Layer;
  private ground: Layer;
  private features: Layer;
  private edges: Layer;
  private layer: Uint8Array; // ground layer (the upper one, when blending)
  private mixLevel: Uint8Array; // 0 = pure layer, 1..BLEND_LEVELS = blending into the next layer down
  private variants: Uint8Array;

  private sparkleClock = 0;

  constructor(private scene: Phaser.Scene, private world: World) {
    const { cols, rows } = world;
    const map = scene.make.tilemap({ tileWidth: TILE, tileHeight: TILE, width: cols, height: rows });
    const tileset = map.addTilesetImage('terrain', 'terrain', TILE, TILE, 0, 0)!;
    const layer = (name: string) => map.createBlankLayer(name, tileset, 0, 0, cols, rows) as Layer;
    this.back = layer('back');
    this.ground = layer('ground');
    this.features = layer('features');
    this.edges = layer('edges');

    // Layer, blend and look variant per cell. Around each layer boundary the
    // ground blends over TRANSITION rows; the boundary waves and is jittered.
    this.layer = new Uint8Array(cols * rows);
    this.mixLevel = new Uint8Array(cols * rows);
    this.variants = new Uint8Array(cols * rows);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const h = hash(c, r, world.seed);
        const depth = world.depthOf(r) + 2 * Math.sin(c * 0.37 + (world.seed % 7)) + (((h >>> 8) % 5) - 2) * 0.6;
        let band = 0; // deepest layer whose transition zone has started
        while (band + 1 < BANDS.length && depth >= BANDS[band + 1].from - TRANSITION / 2) band++;
        this.layer[i] = band;
        if (band > 0) {
          // 0 = still all the layer above, BLEND_LEVELS + 1 = all this layer
          const t = (depth - (BANDS[band].from - TRANSITION / 2)) / TRANSITION;
          const step = Math.round(Math.min(1, t) * (BLEND_LEVELS + 1));
          if (step <= BLEND_LEVELS) {
            this.layer[i] = band - 1;
            this.mixLevel[i] = step;
          }
        }
        this.variants[i] = h % VARIANTS;
      }
    }
    this.redrawAll();
  }

  redrawAll(): void {
    for (let r = 0; r < this.world.rows; r++) {
      for (let c = 0; c < this.world.cols; c++) this.drawCell(c, r);
    }
  }

  // The layer a cell mostly looks like, for edges and particle colour.
  private nearest(i: number): number {
    return this.layer[i] + (this.mixLevel[i] > BLEND_LEVELS / 2 ? 1 : 0);
  }

  // After a tile is dug: redraw it and the edges of its neighbours.
  dug(col: number, row: number): void {
    this.drawCell(col, row);
    this.drawEdge(col, row - 1);
    this.drawEdge(col + 1, row);
    this.drawEdge(col, row + 1);
    this.drawEdge(col - 1, row);
  }

  // Now and then, glint a random ore tile on screen. Gems glint more often than metals.
  updateSparkles(dt: number, view: Phaser.Geom.Rectangle): void {
    this.sparkleClock -= dt;
    if (this.sparkleClock > 0) return;
    this.sparkleClock = 0.12;
    for (let tries = 0; tries < 8; tries++) {
      const c = Math.floor((view.x + Math.random() * view.width) / TILE);
      const r = Math.floor((view.y + Math.random() * view.height) / TILE);
      const t = this.world.get(c, r);
      if (!isOre(t)) continue;
      const ore = ORES[oreIndex(t)];
      if (ore.price < 2000 && Math.random() < 0.7) continue;
      const img = this.scene.add
        .image(c * TILE + 6 + Math.random() * 20, r * TILE + 6 + Math.random() * 20, 'sparkle')
        .setScale(0)
        .setDepth(6); // above the darkness, so gems glint even out of the headlight
      this.scene.tweens.add({ targets: img, scale: 1, angle: 45, duration: 220, yoyo: true, onComplete: () => img.destroy() });
      return;
    }
  }

  // Colour for dirt particles from this cell.
  colorAt(col: number, row: number, tile: number): number {
    if (isOre(tile) && Math.random() < 0.5) return ORES[oreIndex(tile)].color;
    return BANDS[this.nearest(row * this.world.cols + col)].light; // lighter than the ground so it shows against it
  }

  private drawCell(c: number, r: number): void {
    const { world } = this;
    const i = r * world.cols + c;
    const band = this.layer[i];
    const mix = this.mixLevel[i];
    const v = this.variants[i];
    const t = world.get(c, r);
    const dirt = mix ? Frame.blendDirt(band, mix, v) : Frame.dirt(band, v);

    if (r >= world.surfaceRow) this.back.putTileAt(mix ? Frame.blendBack(band, mix, v) : Frame.back(band, v), c, r);

    let ground = -1;
    let feature = -1;
    if (t === Tile.Dirt) ground = dirt;
    else if (t === Tile.Topsoil) ground = Frame.topsoil(v);
    else if (t === Tile.Bedrock) ground = Frame.bedrock(v);
    else if (t === Tile.Pad) ground = Frame.pad();
    else if (t === Tile.Boulder || isOre(t)) {
      ground = dirt;
      feature = t === Tile.Boulder ? Frame.boulder(v) : Frame.ore(oreIndex(t), v);
    }
    put(this.ground, ground, c, r);
    put(this.features, feature, c, r);
    this.drawEdge(c, r);
  }

  private drawEdge(c: number, r: number): void {
    const { world } = this;
    if (c < 0 || c >= world.cols || r < 0 || r >= world.rows) return;
    const t = world.get(c, r);
    if (t === Tile.Empty || t === Tile.Bedrock || t === Tile.Pad) return put(this.edges, -1, c, r);
    const open = (cc: number, rr: number) => world.get(cc, rr) === Tile.Empty;
    let mask = (open(c, r - 1) ? 1 : 0) | (open(c + 1, r) ? 2 : 0) | (open(c, r + 1) ? 4 : 0) | (open(c - 1, r) ? 8 : 0);
    if (r === world.surfaceRow) mask &= ~1; // grass handles the top of the surface
    put(this.edges, mask ? Frame.edge(this.nearest(r * world.cols + c), mask) : -1, c, r);
  }
}

function put(layer: Layer, frame: number, c: number, r: number): void {
  if (frame < 0) layer.removeTileAt(c, r);
  else layer.putTileAt(frame, c, r);
}

function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2246822519) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}
