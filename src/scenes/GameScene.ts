import Phaser from 'phaser';
import { BUILDINGS, FALL, FUEL, ORES, PHYSICS, SPAWN_COL, TILE, VIEW, type BuildingDef } from '../config';
import { PodStats } from '../game/PodStats';
import { Controls } from '../input/Controls';
import { Pod, type DugTile } from '../pod/Pod';
import { World } from '../world/World';
import { isOre, oreIndex } from '../world/tiles';
import { PodView } from './PodView';
import { Terrain } from './Terrain';
import { makeTextures } from './textures';
import type { UIScene } from './UIScene';

const SKY = 0x7ec8e3;
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
  private terrain!: Terrain;
  private podView!: PodView;
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
    this.add.rectangle(0, 0, cols * TILE, surfaceRow * TILE, SKY).setOrigin(0, 0);
    BUILDINGS.forEach((b) => this.drawBuilding(b));

    this.terrain = new Terrain(this, this.world);

    this.pod = new Pod(this.world, SPAWN_COL, surfaceRow - 1);
    this.podView = new PodView(this, this.pod);
    this.takeSnapshot();

    const cam = this.cameras.main;
    cam.setBounds(0, 0, cols * TILE, rows * TILE);
    cam.startFollow(this.podView.sprite, true, 0.15, 0.15);
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
    const dt = Math.min(delta / 1000, 0.05);
    if (this.mode === 'play') this.step(dt);
    const d = this.pod.drill;
    this.podView.update(dt, this.mode === 'dead', d ? this.terrain.colorAt(d.col, d.row, this.world.get(d.col, d.row)) : 0, this.stats.cargoFull);
    this.terrain.updateSparkles(dt, this.cameras.main.worldView);
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
    if (impact > 0) this.podView.landed(impact);
    if (impact > FALL.safeSpeed) {
      const damage = (impact - FALL.safeSpeed) * FALL.damagePerSpeed;
      stats.hull -= damage;
      this.podView.hit();
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
    this.podView.burst(dug.col, dug.row, this.terrain.colorAt(dug.col, dug.row, dug.tile));
    this.terrain.dug(dug.col, dug.row);
    if (!isOre(dug.tile)) return;
    const i = oreIndex(dug.tile);
    const ore = ORES[i];
    if (this.stats.cargoFull) {
      this.ui.toast(`Cargo full: ${ore.name} lost`, 0xff6b6b);
    } else {
      this.stats.cargo[i]++;
      this.ui.oreCollected(i, (dug.col + 0.5) * TILE, (dug.row + 0.5) * TILE);
      if (this.stats.cargoFull) this.ui.toast('Cargo full: sell at the surface', 0xff8a3b, 2000);
      else this.ui.toast(`+${ore.name}`, ore.color);
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
    const { world, snapshot } = this;
    world.cells.set(snapshot.cells);
    this.terrain.redrawAll();
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

}

function padAt(col: number): BuildingDef | null {
  return BUILDINGS.find((b) => col >= b.col && col < b.col + b.width) ?? null;
}

function readSeed(): number {
  const param = new URLSearchParams(location.search).get('seed');
  const seed = param ? parseInt(param, 10) : NaN;
  return Number.isFinite(seed) ? seed : Math.floor(Math.random() * 1e9);
}
