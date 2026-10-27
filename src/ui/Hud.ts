import Phaser from 'phaser';
import { FUEL } from '../config';
import type { PodStats } from '../game/PodStats';
import { textStyle } from './theme';

const BAR_W = 104;
const BAR_H = 10;
const ROW_H = 22;
const PANEL_X = 8;
const PANEL_Y = 8;
const BAR_X = PANEL_X + 32; // after the icon

// A framed gauge with a little shine.
class Bar {
  private fill: Phaser.GameObjects.Rectangle;
  readonly frame: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.frame = scene.add.rectangle(x, y, BAR_W, BAR_H, 0x0b0d12, 0.85).setOrigin(0, 0.5).setStrokeStyle(2, 0x000000, 0.9);
    this.fill = scene.add.rectangle(x + 1, y, BAR_W - 2, BAR_H - 4, 0xffffff).setOrigin(0, 0.5);
    scene.add.rectangle(x + 1, y - 2, BAR_W - 2, 1, 0xffffff, 0.25).setOrigin(0, 0.5);
  }

  set(share: number, color: number): void {
    this.fill.width = (BAR_W - 2) * Phaser.Math.Clamp(share, 0, 1);
    this.fill.fillColor = color;
  }
}

// Fuel, hull, cargo and depth on a panel at the top left; cash at the top
// right; short pop-up messages in the middle.
export class Hud {
  private fuel: Bar;
  private hull: Bar;
  private cargo: Bar;
  private cargoShare = 0;
  private cargoText: Phaser.GameObjects.Text;
  private cargoIcon: Phaser.GameObjects.Image;
  private depth: Phaser.GameObjects.Text;
  private money: Phaser.GameObjects.Text;
  private coin: Phaser.GameObjects.Image;
  private toastText: Phaser.GameObjects.Text | null = null;
  private shownMoney = -1; // counts up toward the real amount

  constructor(private scene: Phaser.Scene) {
    const rowY = (i: number) => PANEL_Y + 14 + i * ROW_H;
    scene.add
      .rectangle(PANEL_X, PANEL_Y, BAR_X - PANEL_X + BAR_W + 52, ROW_H * 4 + 6, 0x000000, 0.4)
      .setOrigin(0)
      .setStrokeStyle(1, 0xffffff, 0.15);
    const icon = (key: string, i: number) => scene.add.image(PANEL_X + 14, rowY(i), key).setScale(1.25);

    icon('icon-fuel', 0);
    this.fuel = new Bar(scene, BAR_X, rowY(0));
    icon('icon-hull', 1);
    this.hull = new Bar(scene, BAR_X, rowY(1));
    this.cargoIcon = icon('icon-cargo', 2);
    this.cargo = new Bar(scene, BAR_X, rowY(2));
    this.cargoText = scene.add.text(BAR_X + BAR_W + 6, rowY(2), '', textStyle(20)).setOrigin(0, 0.5).setStroke('#000000', 3);
    icon('icon-depth', 3);
    this.depth = scene.add.text(BAR_X, rowY(3), '', textStyle(22)).setOrigin(0, 0.5).setStroke('#000000', 3);

    this.money = scene.add.text(0, 10, '', textStyle(30, '#ffe066')).setStroke('#000000', 4).setOrigin(1, 0);
    this.coin = scene.add.image(0, 24, 'icon-coin').setScale(1.4);
    this.layout();
    scene.scale.on('resize', this.layout, this);
  }

  private layout(): void {
    this.money.x = this.scene.scale.width - 12;
    this.coin.x = this.money.x - this.money.displayWidth - 14;
  }

  update(stats: PodStats, depthMetres: number, time: number, dt: number): void {
    const fuelShare = stats.fuel / stats.fuelCapacity;
    const low = fuelShare < FUEL.lowWarning;
    const flash = low && Math.floor(time / 300) % 2 === 0;
    this.fuel.set(fuelShare, flash ? 0xff3b3b : low ? 0xff8a3b : 0xffc531);
    const hullShare = stats.hull / stats.maxHull;
    this.hull.set(hullShare, hullShare < 0.3 ? 0xff3b3b : 0x4ade80);

    // Full bay: the gauge and count flash orange. Nearly full: amber.
    const full = stats.cargoFull;
    const blink = full && Math.floor(time / 400) % 2 === 0;
    const nearly = stats.cargoCount >= stats.cargoCapacity * 0.8;
    this.cargoShare = stats.cargoCount / stats.cargoCapacity;
    this.cargo.set(this.cargoShare, blink ? 0xff6a1a : full ? 0xd9480f : nearly ? 0xffc531 : 0x5ab4ff);
    this.cargoText.setText(full ? 'FULL' : `${stats.cargoCount}/${stats.cargoCapacity}`);
    this.cargoText.setColor(full ? (blink ? '#ff8a3b' : '#ffffff') : nearly ? '#ffc531' : '#ffffff');

    this.depth.setText(`${depthMetres} m`);
    this.updateMoney(stats.money, dt);
  }

  private updateMoney(money: number, dt: number): void {
    if (this.shownMoney < 0 || money < this.shownMoney) this.shownMoney = money; // spending shows at once
    if (this.shownMoney < money) {
      const step = Math.max(1, Math.round((money - this.shownMoney) * Math.min(1, dt * 6)));
      this.shownMoney = Math.min(money, this.shownMoney + step);
    }
    this.money.setText(this.shownMoney.toLocaleString());
    this.money.setScale(this.shownMoney < money ? 1.15 : 1); // swells while counting up
    this.layout();
  }

  // An ore icon flies from where it was dug (screen px) to the end of the cargo gauge.
  flyToCargo(frame: string, x: number, y: number): void {
    const bar = this.cargo.frame;
    const icon = this.scene.add.image(x, y, 'terrain', frame).setScale(0.9).setDepth(50);
    this.scene.tweens.add({
      targets: icon,
      x: bar.x + BAR_W * this.cargoShare,
      y: bar.y,
      scale: 0.4,
      duration: 450,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        icon.destroy();
        this.cargoIcon.setScale(1.6);
        this.scene.tweens.add({ targets: this.cargoIcon, scale: 1.25, duration: 150 });
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
      .text(width / 2, 130, message, textStyle(30, '#' + color.toString(16).padStart(6, '0')))
      .setStroke('#000000', 5)
      .setOrigin(0.5);
    this.toastText = text;
    this.scene.tweens.add({ targets: text, y: 100, alpha: 0, delay: hold, duration: 700, onComplete: () => text.destroy() });
  }
}
