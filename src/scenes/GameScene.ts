import Phaser from 'phaser';
import { TILE, VIEW } from '../config';
import { Controls } from '../input/Controls';
import { Pod } from '../pod/Pod';
import { World } from '../world/World';
import { Tile } from '../world/tiles';
import { makeTextures, POD_ORIGIN_Y } from './textures';
import type { UIScene } from './UIScene';

const SKY = 0x7ec8e3;
const TUNNEL = 0x24160c;

export class GameScene extends Phaser.Scene {
  world!: World;
  pod!: Pod;
  private layer!: Phaser.Tilemaps.TilemapLayer;
  private podSprite!: Phaser.GameObjects.Image;
  private flames!: Phaser.GameObjects.Image[];
  private controls!: Controls;

  constructor() {
    super('game');
  }

  create(): void {
    makeTextures(this);
    this.world = new World(readSeed());
    console.log(`seed ${this.world.seed} (add ?seed=${this.world.seed} to the URL to replay this world)`);

    const { cols, rows, surfaceRow } = this.world;
    this.cameras.main.setBackgroundColor(TUNNEL);
    this.add.rectangle(0, 0, cols * TILE, surfaceRow * TILE, SKY).setOrigin(0, 0);

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

    this.pod = new Pod(this.world, Math.floor(cols / 2), surfaceRow - 1);
    this.flames = [this.add.image(0, 0, 'flame'), this.add.image(0, 0, 'flame')];
    this.podSprite = this.add.image(0, 0, 'pod').setOrigin(0.5, POD_ORIGIN_Y);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, cols * TILE, rows * TILE);
    cam.startFollow(this.podSprite, true, 0.15, 0.15);
    this.fitCamera();
    this.scale.on('resize', this.fitCamera, this);

    this.scene.launch('ui');
    const ui = this.scene.get('ui') as UIScene;
    ui.events.once('create', () => (this.controls = new Controls(this, ui.joystick)));
  }

  private fitCamera(): void {
    const { width, height } = this.scale;
    this.cameras.main.setZoom(Math.max(1, Math.min(width, height) / (VIEW.minTilesAcross * TILE)));
  }

  update(_time: number, delta: number): void {
    if (!this.controls) return;
    const dt = Math.min(delta / 1000, 0.05);
    const dug = this.pod.update(dt, this.controls.read());
    if (dug) this.layer.removeTileAt(dug.col, dug.row);
    this.drawPod();
  }

  private drawPod(): void {
    const pod = this.pod;
    const cx = pod.x + pod.w / 2;
    const cy = pod.y + pod.h / 2;
    const dir = pod.drillDir;
    const shake = dir ? (Math.random() - 0.5) * 1.5 : 0;
    this.podSprite
      .setPosition(cx + shake, cy + shake)
      .setAngle(dir === 'right' ? -90 : dir === 'left' ? 90 : 0)
      .setFlipX(pod.facing < 0);

    const flicker = 0.8 + Math.random() * 0.4;
    this.flames.forEach((f, i) => {
      f.setVisible(pod.thrusting);
      f.setPosition(cx + (i === 0 ? -9 : 9), pod.y + pod.h + 4).setScale(1, flicker);
    });
  }
}

function readSeed(): number {
  const param = new URLSearchParams(location.search).get('seed');
  const seed = param ? parseInt(param, 10) : NaN;
  return Number.isFinite(seed) ? seed : Math.floor(Math.random() * 1e9);
}
