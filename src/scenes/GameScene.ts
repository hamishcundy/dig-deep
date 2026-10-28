import Phaser from 'phaser';
import { sound } from '../audio/sound';
import { BUILDINGS, DYNAMITE_RADIUS, EARTHQUAKE, FALL, FUEL, ORES, PHYSICS, SPAWN_COL, TILE, VIEW, WORLD, type BuildingDef, type ItemKey } from '../config';
import { PodStats } from '../game/PodStats';
import { clearSave, loadSave, writeSave } from '../game/save';
import { Controls } from '../input/Controls';
import { Pod, type DugTile, type Stick } from '../pod/Pod';
import { World } from '../world/World';
import { Tile, isDrillable, isOre, isSolid, oreIndex } from '../world/tiles';
import { Darkness } from './Darkness';
import { PodView } from './PodView';
import { Surface } from './Surface';
import { Terrain } from './Terrain';
import { makeTextures } from './textures';
import type { UIScene } from './UIScene';

export type FuelState = 'ok' | 'low' | 'critical';

const PAD_STOP_SPEED = 1.5; // tiles/s; slower than this on a pad opens the building
const NO_INPUT = { x: 0, y: 0 };

type Mode = 'title' | 'play' | 'menu' | 'dead';

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
  private mode: Mode = 'title'; // frozen behind the title screen until Play
  private surface!: Surface;
  private terrain!: Terrain;
  private podView!: PodView;
  private darkness!: Darkness;
  private controls!: Controls;
  private ui!: UIScene;
  private snapshot!: Snapshot;
  private wasAtSurface = true;
  private usedPad: BuildingDef | null = null;
  fuelMark = 0; // litres to get home with a margin; drawn as a tick on the fuel gauge
  fuelState: FuelState = 'ok';
  private braking = false; // landing thrusters firing

  constructor() {
    super('game');
  }

  create(): void {
    makeTextures(this);
    // Resume the saved game unless the URL asks for a specific world.
    const urlSeed = readUrlSeed();
    const save = urlSeed === null ? loadSave() : null;
    this.world = new World(save?.seed ?? urlSeed ?? Math.floor(Math.random() * 1e9));
    const resumed = save !== null && save.cells.length === this.world.cells.length;
    if (resumed) this.world.cells.set(save.cells);
    this.stats = resumed ? save.stats : new PodStats();
    console.log(`seed ${this.world.seed} (add ?seed=${this.world.seed} to the URL to replay this world)`);

    const { cols, rows, surfaceRow } = this.world;
    this.surface = new Surface(this, this.world);

    this.terrain = new Terrain(this, this.world);

    this.pod = new Pod(this.world, resumed ? save.col : SPAWN_COL, surfaceRow - 1);
    this.usedPad = padAt(this.pod.col); // don't pop a building open on load
    this.podView = new PodView(this, this.pod);
    this.darkness = new Darkness(this);
    this.takeSnapshot();

    const cam = this.cameras.main;
    cam.setBounds(0, 0, cols * TILE, rows * TILE);
    cam.startFollow(this.podView.sprite, true, 0.15, 0.15);
    this.fitCamera();
    this.scale.on('resize', this.fitCamera, this);

    this.scene.launch('ui');
    this.ui = this.scene.get('ui') as UIScene;
    this.ui.events.once('create', () => {
      this.controls = new Controls(this, this.ui.joystick);
      this.ui.showTitle(resumed);
    });
    this.game.events.on(Phaser.Core.Events.HIDDEN, () => this.pause()); // e.g. switching apps on a phone
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
    const playing = this.mode === 'play';
    this.updateFuelState(playing);
    sound.loops({
      engine: playing && this.pod.thrusting ? Phaser.Math.Clamp(-this.pod.vy / (PHYSICS.maxRise * TILE), 0, 1) : null,
      drill: playing && d ? this.world.depthOf(d.row) / WORLD.depth : null,
      lowFuel: this.fuelState !== 'ok' && this.stats.fuel > 0,
      cough: this.fuelState === 'critical' && this.stats.fuel > 0,
    });
    this.podView.update(dt, this.mode === 'dead', d ? this.terrain.colorAt(d.col, d.row, this.world.get(d.col, d.row)) : 0);
    this.terrain.updateSparkles(dt, this.cameras.main.worldView);
    this.surface.update(dt);
    this.darkness.update(dt, this.pod, this.world.depthOf(this.pod.row));
  }

  private step(dt: number): void {
    const { pod, stats, world } = this;
    const power = {
      thrust: this.thrustPower(),
      speed: stats.enginePower,
      drill: stats.drillSpeed,
    };
    // With an empty tank the engine is off: no steering, thrust or new drilling,
    // but the pod keeps its momentum, so it can still coast or fall onto the fuel pad.
    const hadFuel = stats.fuel > 0;
    const stick = hadFuel ? this.controls.read() : NO_INPUT;
    this.updateLandingThrusters(dt, stick, power.thrust);
    const dug = pod.update(dt, stick, power);
    if (dug) this.onDug(dug);

    stats.fuel = Math.max(0, stats.fuel - (FUEL.idle + (pod.thrusting ? FUEL.thrust : 0) + (pod.drill ? FUEL.drill : 0)) * dt);
    if (this.braking) pod.thrusting = true; // show the flame; the thrusters burn their own fuel
    if (hadFuel && stats.fuel === 0) {
      this.ui.toast('Out of fuel!', 0xff3b3b, 2000);
      sound.sputter();
    }

    const impact = pod.landingSpeed / TILE;
    if (impact > 0) {
      this.podView.landed(impact);
      sound.land(impact);
    }
    if (impact > FALL.safeSpeed) {
      const damage = (impact - FALL.safeSpeed) * FALL.damagePerSpeed;
      stats.hull -= damage;
      this.podView.hit();
      sound.clank();
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

    // Out of fuel is only over once the pod comes to rest (and hasn't just opened a building).
    if (stats.fuel === 0 && this.mode === 'play' && pod.grounded && !pod.drill && Math.abs(pod.vx) < 0.2 * TILE) {
      this.die('Out of fuel');
    }
  }

  // Low once fuel is below what it takes to get home with a margin; critical once
  // it is below the bare climb. Warnings only show during play.
  private updateFuelState(playing: boolean): void {
    const { stats, pod, world } = this;
    const need = this.fuelToGetHome();
    this.fuelMark = need * FUEL.homeMargin + FUEL.homeBuffer;
    const prev = this.fuelState;
    this.fuelState = !playing || stats.fuel > this.fuelMark ? 'ok' : stats.fuel > need ? 'low' : 'critical';
    if (prev === 'ok' && this.fuelState !== 'ok' && stats.fuel > 0) {
      this.ui.toast(pod.row < world.surfaceRow ? 'Low fuel: refuel' : 'Low fuel: head up', 0xff8a3b, 2000);
    }
  }

  // Litres to fly straight up to the surface and drive to the fuel pad, at full
  // speed with no margin. A fuller cargo bay accelerates slower.
  private fuelToGetHome(): number {
    const { pod, stats, world } = this;
    const climb = Math.max(0, pod.row - (world.surfaceRow - 1));
    const speed = PHYSICS.maxRise * stats.enginePower;
    const lift = PHYSICS.thrust * this.thrustPower() - PHYSICS.gravity;
    const climbTime = climb > 0 ? climb / speed + speed / (2 * lift) : 0;
    const pad = BUILDINGS.find((b) => b.kind === 'fuel')!;
    const drive = Math.abs(pod.col - (pad.col + pad.width / 2));
    const driveTime = drive / (PHYSICS.maxSpeedX * stats.enginePower);
    return climbTime * (FUEL.idle + FUEL.thrust) + driveTime * FUEL.idle;
  }

  // Landing thrusters fire by themselves on a big drop: when the pod would hit the
  // ground at FALL.thrusterMinImpact or more and braking has to start now. They
  // brake at full thrust, without using the tank, until the fall is safe.
  private updateLandingThrusters(dt: number, stick: Stick, thrust: number): void {
    const { pod, stats } = this;
    const fall = pod.vy / TILE; // tiles/s, down is positive
    const target = FALL.safeSpeed * 0.6;
    if (this.braking) {
      if (pod.grounded || fall <= target) this.braking = false;
      else pod.vy -= PHYSICS.thrust * TILE * dt;
      return;
    }
    const slot = stats.items.indexOf('thrusters');
    if (slot < 0 || fall <= FALL.safeSpeed || pod.drill) return;
    // Distance needed to slow from `fall` to `target`, plus a little for frame steps.
    const stopping = (decel: number) => (fall * fall - target * target) / (2 * decel) + fall * dt * 2 + 0.2;
    const gap = this.groundGap();
    if (gap > stopping(PHYSICS.thrust - PHYSICS.gravity)) return;
    const impact = Math.min(PHYSICS.maxFall, Math.sqrt(fall * fall + 2 * PHYSICS.gravity * gap));
    if (impact < FALL.thrusterMinImpact) return; // a small hop: not worth a thruster
    // Leave it to the player if their own thrust is already enough.
    const own = PHYSICS.thrust * thrust - PHYSICS.gravity;
    if (stick.y < -0.3 && stats.fuel > 0 && own > 0 && gap > stopping(own)) return;
    stats.items.splice(slot, 1);
    this.braking = true;
    this.ui.toast('Landing thrusters fired', 0xffc531);
    sound.thrusters();
  }

  // Tiles of open space between the bottom of the pod and the ground below it,
  // across its full width: the pod lands on any ledge it overlaps, even by a pixel.
  private groundGap(): number {
    const { pod, world } = this;
    const bottom = pod.y + pod.h;
    const c0 = Math.floor(pod.x / TILE);
    const c1 = Math.floor((pod.x + pod.w - 1) / TILE);
    for (let row = Math.floor(bottom / TILE); row < world.rows; row++) {
      for (let c = c0; c <= c1; c++) if (isSolid(world.get(c, row))) return Math.max(0, (row * TILE - bottom) / TILE);
    }
    return Infinity;
  }

  // Use the item in a slot (from the item bar or keys 1-3). An item that can't do
  // anything right now is kept.
  useItem(slot: number): void {
    const key = this.stats.items[slot];
    if (this.mode !== 'play' || !key) return;
    if (this.applyItem(key)) this.stats.items.splice(slot, 1);
  }

  private applyItem(key: ItemKey): boolean {
    const { stats, pod, world } = this;
    switch (key) {
      case 'fuel':
        if (stats.fuel >= stats.fuelCapacity - 0.05) return this.refuse('Tank is full');
        stats.fuel = stats.fuelCapacity;
        sound.fill();
        return true;
      case 'repair':
        if (stats.hull >= stats.maxHull - 0.05) return this.refuse('Hull is fine');
        stats.hull = stats.maxHull;
        sound.repair();
        return true;
      case 'dynamite':
        this.blast();
        return true;
      case 'teleport':
        if (pod.row < world.surfaceRow) return this.refuse('Already at the surface');
        this.teleportHome();
        return true;
      case 'thrusters':
        return false; // they fire by themselves
    }
  }

  private refuse(message: string): false {
    this.ui.toast(message, 0xff8a3b);
    sound.nope();
    return false;
  }

  // Clears the tiles around the pod, rocks included; ore caught in it is lost.
  // Bedrock and building pads survive.
  private blast(): void {
    const { pod, world } = this;
    for (let row = pod.row - DYNAMITE_RADIUS; row <= pod.row + DYNAMITE_RADIUS; row++) {
      for (let col = pod.col - DYNAMITE_RADIUS; col <= pod.col + DYNAMITE_RADIUS; col++) {
        const tile = world.get(col, row);
        if (!isDrillable(tile) && tile !== Tile.Boulder) continue;
        this.podView.burst(col, row, this.terrain.colorAt(col, row, tile));
        world.set(col, row, Tile.Empty);
        this.terrain.dug(col, row);
      }
    }
    pod.drill = null; // whatever it was drilling is gone
    pod.grounded = false;
    this.cameras.main.shake(300, 0.012);
    sound.boom();
  }

  // Back to the start point on the surface, with cargo and everything else kept.
  private teleportHome(): void {
    this.pod.placeAt(SPAWN_COL, this.world.surfaceRow - 1);
    this.pod.drill = null;
    this.braking = false;
    this.cameras.main.flash(300, 170, 140, 255);
    sound.teleport();
  }

  private thrustPower(): number {
    const { stats } = this;
    return stats.enginePower * (1 - (stats.cargoCount / stats.cargoCapacity) * PHYSICS.fullCargoThrustPenalty);
  }

  private onDug(dug: DugTile): void {
    this.podView.burst(dug.col, dug.row, this.terrain.colorAt(dug.col, dug.row, dug.tile));
    this.terrain.dug(dug.col, dug.row);
    sound.dig();
    if (!isOre(dug.tile)) return;
    const i = oreIndex(dug.tile);
    const ore = ORES[i];
    if (this.stats.cargoFull) {
      this.ui.toast(`Cargo full: ${ore.name} lost`, 0xff6b6b);
      sound.nope();
    } else {
      this.stats.cargo[i]++;
      this.ui.oreCollected(i, (dug.col + 0.5) * TILE, (dug.row + 0.5) * TILE);
      sound.ore(i);
      if (this.stats.cargoFull) {
        this.ui.toast('Cargo full: sell at the surface', 0xff8a3b, 2000);
        sound.nope(0.3);
      } else this.ui.toast(`+${ore.name}`, ore.color);
    }
  }

  private openBuilding(b: BuildingDef): void {
    this.mode = 'menu';
    this.pod.vx = 0;
    this.pod.thrusting = false;
    this.ui.showBuilding(b.kind);
  }

  // Freeze play and show the pause menu. Ignored while another menu is up.
  pause(): void {
    if (this.mode !== 'play' || !this.controls) return; // controls exist once the UI scene is up
    this.mode = 'menu';
    this.pod.thrusting = false;
    this.ui.showPause();
  }

  resume(): void {
    this.mode = 'play';
  }

  startPlaying(): void {
    this.mode = 'play';
  }

  // Leaving a building. Once enough has been earned, this can set off an earthquake.
  closeMenu(): void {
    this.mode = 'play';
    if (this.stats.earned >= EARTHQUAKE.minEarned && Math.random() < EARTHQUAKE.chance) this.earthquake();
    this.takeSnapshot();
  }

  // Only ever at the surface (the pod is on a pad), so the pod is never inside shifting ground.
  earthquake(): void {
    this.world.quake(EARTHQUAKE.layerMin, EARTHQUAKE.layerMax);
    this.terrain.redrawAll();
    this.cameras.main.shake(1400, 0.02);
    sound.quake();
    this.ui.earthquake();
  }

  private die(reason: string): void {
    this.mode = 'dead';
    this.pod.thrusting = false;
    this.cameras.main.shake(300, 0.012);
    sound.crash();
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
    clearSave();
    const url = new URL(location.href);
    url.searchParams.delete('seed');
    location.href = url.toString();
  }

  private takeSnapshot(): void {
    if (this.stats.fuel < FUEL.minSnapshot) return; // never roll back to a spot you can't leave
    this.snapshot = { cells: this.world.cells.slice(), stats: this.stats.clone(), col: this.pod.col };
    writeSave({ seed: this.world.seed, ...this.snapshot });
  }

}

function padAt(col: number): BuildingDef | null {
  return BUILDINGS.find((b) => col >= b.col && col < b.col + b.width) ?? null;
}

function readUrlSeed(): number | null {
  const param = new URLSearchParams(location.search).get('seed');
  const seed = param ? parseInt(param, 10) : NaN;
  return Number.isFinite(seed) ? seed : null;
}
