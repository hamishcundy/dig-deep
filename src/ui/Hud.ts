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
  private shownMoney = -1; // counts up toward the real amount

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

  update(stats: PodStats, depthMetres: number, time: number, dt: number): void {
    const fuelShare = stats.fuel / stats.fuelCapacity;
    const low = fuelShare < FUEL.lowWarning;
    const flash = low && Math.floor(time / 300) % 2 === 0;
    this.fuel.set(fuelShare, flash ? 0xff3b3b : low ? 0xff8a3b : 0xffc531);
    const hullShare = stats.hull / stats.maxHull;
    this.hull.set(hullShare, hullShare < 0.3 ? 0xff3b3b : 0x4ade80);
    // Full bay: a flashing badge. Nearly full: amber.
    const full = stats.cargoFull;
    const blink = full && Math.floor(time / 400) % 2 === 0;
    this.cargo.setText(full ? ' CARGO FULL ' : `Cargo ${stats.cargoCount}/${stats.cargoCapacity}`);
    this.cargo.setBackgroundColor(blink ? '#d9480f' : 'rgba(0,0,0,0)');
    this.cargo.setColor(full ? '#ffffff' : stats.cargoCount >= stats.cargoCapacity * 0.8 ? '#ffc531' : '#ffffff');
    this.depth.setText(`Depth ${depthMetres} m`);
    this.updateMoney(stats.money, dt);
  }

  private updateMoney(money: number, dt: number): void {
    if (this.shownMoney < 0 || money < this.shownMoney) this.shownMoney = money; // spending shows at once
    if (this.shownMoney < money) {
      const step = Math.max(1, Math.round((money - this.shownMoney) * Math.min(1, dt * 6)));
      this.shownMoney = Math.min(money, this.shownMoney + step);
    }
    this.money.setText(`$${this.shownMoney.toLocaleString()}`);
    this.money.setScale(this.shownMoney < money ? 1.15 : 1); // swells while counting up
  }

  // An ore icon flies from where it was dug (screen px) to the cargo counter.
  flyToCargo(frame: string, x: number, y: number): void {
    const icon = this.scene.add.image(x, y, 'terrain', frame).setScale(0.9).setDepth(50);
    this.scene.tweens.add({
      targets: icon,
      x: this.cargo.x + this.cargo.width + 10,
      y: this.cargo.y + this.cargo.height / 2,
      scale: 0.4,
      duration: 450,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        icon.destroy();
        this.cargo.setScale(1.25);
        this.scene.tweens.add({ targets: this.cargo, scale: 1, duration: 150 });
      },
    });
  }

  // hold: ms the message stays fully visible before fading.
  toast(message: string, color = 0xffffff, hold = 600): void {
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
    this.scene.tweens.add({ targets: text, y: 90, alpha: 0, delay: hold, duration: 700, onComplete: () => text.destroy() });
  }
}
