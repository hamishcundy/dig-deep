import Phaser from 'phaser';
import { BUILDINGS, FALL, FUEL, ORES, PHYSICS, SPAWN_COL, TILE, VIEW, type BuildingDef } from '../config';
import { PodStats } from '../game/PodStats';
import { Controls } from '../input/Controls';
import { Pod, type DugTile } from '../pod/Pod';
import { World } from '../world/World';
import { isOre, oreIndex, Tile } from '../world/tiles';
import { makeTextures, POD_ORIGIN_Y } from './textures';
import type { UIScene } from './UIScene';

const SKY = 0x7ec8e3;
const TUNNEL = 0x24160c;
const PAD_STOP_SPEED = 1.5; // tiles/s; slower than this on a pad opens the building

type Mode = 'play' | 'menu' | 'dead';

// What we roll back to when the pod is lost: the last time it stood on the surface.
interface Snapshot {
  cells: Uint8Array;
  stats: PodStats;
  col: number;
}

export class GameScene extends Phaser.Scene {
  world!: World;
  pod!: Pod;
  stats!: PodStats;
  private mode: Mode = 'play';
  private layer!: Phaser.Tilemaps.TilemapLayer;
  private podSprite!: Phaser.GameObjects.Image;
  private flames!: Phaser.GameObjects.Image[];
  private controls!: Controls;
  private ui!: UIScene;
  private snapshot!: Snapshot;
  private wasAtSurface = true;
  private usedPad: BuildingDef | null = null;

  constructor() {
    super('game');
  }

  create(): void {
    makeTextures(this);
    this.world = new World(readSeed());
    this.stats = new PodStats();
    console.log(`seed ${this.world.seed} (add ?seed=${this.world.seed} to the URL to replay this world)`);

    const { cols, rows, surfaceRow } = this.world;
    this.cameras.main.setBackgroundColor(TUNNEL);
    this.add.rectangle(0, 0, cols * TILE, surfaceRow * TILE, SKY).setOrigin(0, 0);
    BUILDINGS.forEach((b) => this.drawBuilding(b));

    const data: number[][] = [];
    for (let r = 0; r < rows; r++) {
      const row: number[] = [];
      for (let c = 0; c < cols; c++) {
        const t = this.world.get(c, r);
        row.push(t === Tile.Empty ? -1 : t);
      }
      data.push(row);
    }
    const map = this.make.tilemap({ data, tileWidth: TILE, tileHeight: TILE });
    const tileset = map.addTilesetImage('tiles', 'tiles', TILE, TILE, 0, 0)!;
    this.layer = map.createLayer(0, tileset, 0, 0) as Phaser.Tilemaps.TilemapLayer;

    this.pod = new Pod(this.world, SPAWN_COL, surfaceRow - 1);
    this.flames = [this.add.image(0, 0, 'flame'), this.add.image(0, 0, 'flame')];
    this.podSprite = this.add.image(0, 0, 'pod').setOrigin(0.5, POD_ORIGIN_Y);
    this.takeSnapshot();

    const cam = this.cameras.main;
    cam.setBounds(0, 0, cols * TILE, rows * TILE);
    cam.startFollow(this.podSprite, true, 0.15, 0.15);
    this.fitCamera();
    this.scale.on('resize', this.fitCamera, this);

    this.scene.launch('ui');
    this.ui = this.scene.get('ui') as UIScene;
    this.ui.events.once('create', () => (this.controls = new Controls(this, this.ui.joystick)));
  }

  private drawBuilding(b: BuildingDef): void {
    const x = b.col * TILE;
    const w = b.width * TILE;
    const h = 2.5 * TILE;
    const y = this.world.surfaceRow * TILE - h;
    this.add.rectangle(x + 4, y + 8, w - 8, h - 8, b.color).setOrigin(0, 0);
    this.add.rectangle(x, y, w, 10, 0x3a3f47).setOrigin(0, 0);
    this.add.rectangle(x + w / 2 - 18, y + h - 34, 36, 34, 0x1b1f24).setOrigin(0, 0);
    this.add
      .text(x + w / 2, y + 14, b.label, { fontFamily: 'monospace', fontSize: '13px', fontStyle: 'bold', color: '#ffffff' })
      .setOrigin(0.5, 0)
      .setResolution(3);
  }

  private fitCamera(): void {
    const { width, height } = this.scale;
    this.cameras.main.setZoom(Math.max(1, Math.min(width, height) / (VIEW.minTilesAcross * TILE)));
  }

  update(_time: number, delta: number): void {
    if (!this.controls) return;
    if (this.mode === 'play') this.step(Math.min(delta / 1000, 0.05));
    this.drawPod();
  }

  private step(dt: number): void {
    const { pod, stats, world } = this;
    const power = {
      thrust: stats.enginePower * (1 - (stats.cargoCount / stats.cargoCapacity) * PHYSICS.fullCargoThrustPenalty),
      speed: stats.enginePower,
      drill: stats.drillSpeed,
    };
    const dug = pod.update(dt, this.controls.read(), power);
    if (dug) this.onDug(dug);

    stats.fuel -= (FUEL.idle + (pod.thrusting ? FUEL.thrust : 0) + (pod.drill ? FUEL.drill : 0)) * dt;
    if (stats.fuel <= 0) {
      stats.fuel = 0;
      return this.die('Out of fuel');
    }

    const impact = pod.landingSpeed / TILE;
    if (impact > FALL.safeSpeed) {
      const damage = (impact - FALL.safeSpeed) * FALL.damagePerSpeed;
      stats.hull -= damage;
      this.cameras.main.shake(150, 0.004 + damage * 0.002);
      if (stats.hull <= 0) {
        stats.hull = 0;
        return this.die('Hull destroyed');
      }
    }

    const atSurface = pod.grounded && !pod.drill && pod.row === world.surfaceRow - 1;
    if (atSurface && !this.wasAtSurface) this.takeSnapshot();
    this.wasAtSurface = atSurface;

    // Open a building when the pod stops on its pad (driving across doesn't count).
    // Leave the pad to use it again.
    const pad = atSurface ? padAt(pod.col) : null;
    if (!pad) this.usedPad = null;
    else if (pad !== this.usedPad && Math.abs(pod.vx) < PAD_STOP_SPEED * TILE) {
      this.usedPad = pad;
      this.openBuilding(pad);
    }
  }

  private onDug(dug: DugTile): void {
    this.layer.removeTileAt(dug.col, dug.row);
    if (!isOre(dug.tile)) return;
    const i = oreIndex(dug.tile);
    const ore = ORES[i];
    if (this.stats.cargoFull) {
      this.ui.toast(`Cargo full: ${ore.name} lost`, 0xff6b6b);
    } else {
      this.stats.cargo[i]++;
      this.ui.toast(`+${ore.name}`, ore.color);
    }
  }

  private openBuilding(b: BuildingDef): void {
    this.mode = 'menu';
    this.pod.vx = 0;
    this.pod.thrusting = false;
    this.ui.showBuilding(b.kind);
  }

  closeMenu(): void {
    this.mode = 'play';
    this.takeSnapshot();
  }

  private die(reason: string): void {
    this.mode = 'dead';
    this.pod.thrusting = false;
    this.cameras.main.shake(300, 0.012);
    this.ui.showDeath(reason);
  }

  continueAfterDeath(): void {
    const { world, layer, snapshot } = this;
    world.cells.set(snapshot.cells);
    for (let r = 0; r < world.rows; r++) {
      for (let c = 0; c < world.cols; c++) {
        const t = world.get(c, r);
        if (t === Tile.Empty) layer.removeTileAt(c, r);
        else layer.putTileAt(t, c, r);
      }
    }
    this.stats = snapshot.stats.clone();
    this.pod.placeAt(snapshot.col, world.surfaceRow - 1);
    this.wasAtSurface = true;
    this.usedPad = padAt(snapshot.col);
    this.mode = 'play';
  }

  newGame(): void {
    const url = new URL(location.href);
    url.searchParams.delete('seed');
    location.href = url.toString();
  }

  private takeSnapshot(): void {
    this.snapshot = { cells: this.world.cells.slice(), stats: this.stats.clone(), col: this.pod.col };
  }

  private drawPod(): void {
    const pod = this.pod;
    const cx = pod.x + pod.w / 2;
    const cy = pod.y + pod.h / 2;
    const dir = pod.drillDir;
    const shake = dir && this.mode === 'play' ? (Math.random() - 0.5) * 1.5 : 0;
    this.podSprite
      .setPosition(cx + shake, cy + shake)
      .setAngle(dir === 'right' ? -90 : dir === 'left' ? 90 : 0)
      .setFlipX(pod.facing < 0)
      .setTint(this.mode === 'dead' ? 0xff5050 : 0xffffff);

    const flicker = 0.8 + Math.random() * 0.4;
    this.flames.forEach((f, i) => {
      f.setVisible(pod.thrusting && this.mode === 'play');
      f.setPosition(cx + (i === 0 ? -9 : 9), pod.y + pod.h + 4).setScale(1, flicker);
    });
  }
}

function padAt(col: number): BuildingDef | null {
  return BUILDINGS.find((b) => col >= b.col && col < b.col + b.width) ?? null;
}

function readSeed(): number {
  const param = new URLSearchParams(location.search).get('seed');
  const seed = param ? parseInt(param, 10) : NaN;
  return Number.isFinite(seed) ? seed : Math.floor(Math.random() * 1e9);
}
