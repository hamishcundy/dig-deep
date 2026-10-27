import Phaser from 'phaser';
import { FUEL } from '../config';
import type { PodStats } from '../game/PodStats';

const TEXT = { fontFamily: 'monospace', fontSize: '16px', color: '#ffffff' };
const BAR_W = 110;
const BAR_H = 10;

class Bar {
  private fill: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene, x: number, y: number, label: string) {
    scene.add.text(x, y - 4, label, TEXT).setStroke('#000000', 4);
    scene.add.rectangle(x + 52, y, BAR_W, BAR_H, 0x000000, 0.6).setOrigin(0).setStrokeStyle(1, 0xffffff, 0.5);
    this.fill = scene.add.rectangle(x + 52, y, BAR_W, BAR_H, 0xffffff).setOrigin(0);
  }

  set(share: number, color: number): void {
    this.fill.width = BAR_W * Phaser.Math.Clamp(share, 0, 1);
    this.fill.fillColor = color;
  }
}

// Fuel, hull, cargo, cash and depth readouts, plus short pop-up messages.
export class Hud {
  private depth: Phaser.GameObjects.Text;
  private money: Phaser.GameObjects.Text;
  private cargo: Phaser.GameObjects.Text;
  private fuel: Bar;
  private hull: Bar;
  private toastText: Phaser.GameObjects.Text | null = null;

  constructor(private scene: Phaser.Scene) {
    this.fuel = new Bar(scene, 12, 18, 'Fuel');
    this.hull = new Bar(scene, 12, 40, 'Hull');
    this.cargo = scene.add.text(12, 56, '', TEXT).setStroke('#000000', 4);
    this.depth = scene.add.text(12, 78, '', TEXT).setStroke('#000000', 4);
    this.money = scene.add.text(0, 12, '', { ...TEXT, fontSize: '20px', color: '#ffe066' }).setStroke('#000000', 4).setOrigin(1, 0);
    this.layout();
    scene.scale.on('resize', this.layout, this);
  }

  private layout(): void {
    this.money.x = this.scene.scale.width - 12;
  }

  update(stats: PodStats, depthMetres: number, time: number): void {
    const fuelShare = stats.fuel / stats.fuelCapacity;
    const low = fuelShare < FUEL.lowWarning;
    const flash = low && Math.floor(time / 300) % 2 === 0;
    this.fuel.set(fuelShare, flash ? 0xff3b3b : low ? 0xff8a3b : 0xffc531);
    const hullShare = stats.hull / stats.maxHull;
    this.hull.set(hullShare, hullShare < 0.3 ? 0xff3b3b : 0x4ade80);
    this.cargo.setText(`Cargo ${stats.cargoCount}/${stats.cargoCapacity}`);
    this.cargo.setColor(stats.cargoFull ? '#ff8a3b' : '#ffffff');
    this.depth.setText(`Depth ${depthMetres} m`);
    this.money.setText(`$${stats.money.toLocaleString()}`);
  }

  toast(message: string, color = 0xffffff): void {
    if (this.toastText) {
      this.scene.tweens.killTweensOf(this.toastText);
      this.toastText.destroy();
    }
    const { width } = this.scene.scale;
    const text = this.scene.add
      .text(width / 2, 120, message, { ...TEXT, fontSize: '20px', fontStyle: 'bold', color: '#' + color.toString(16).padStart(6, '0') })
      .setStroke('#000000', 5)
      .setOrigin(0.5);
    this.toastText = text;
    this.scene.tweens.add({ targets: text, y: 90, alpha: 0, delay: 600, duration: 700, onComplete: () => text.destroy() });
  }
}
