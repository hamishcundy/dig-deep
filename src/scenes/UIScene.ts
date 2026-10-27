import Phaser from 'phaser';
import { ECONOMY, METRES_PER_TILE, ORES, UPGRADES, type BuildingKind, type UpgradeKey } from '../config';
import { Joystick } from '../input/Joystick';
import { Hud } from '../ui/Hud';
import { Panel, type PanelButton, type PanelSpec } from '../ui/Panel';
import type { GameScene } from './GameScene';

const PAUSED = 'Paused';

// Screen-space overlay: HUD, menus and touch controls, unaffected by camera zoom.
export class UIScene extends Phaser.Scene {
  joystick!: Joystick;
  private hud!: Hud;
  private panel!: Panel;

  constructor() {
    super('ui');
  }

  private get gameScene(): GameScene {
    return this.scene.get('game') as GameScene;
  }

  create(): void {
    this.input.addPointer(2);
    this.joystick = new Joystick(this);
    this.hud = new Hud(this);
    this.panel = new Panel(this);
    this.makePauseButton();

    const kb = this.input.keyboard!;
    kb.on('keydown-ESC', () => (this.panel.open ? this.panel.cancel() : this.gameScene.pause()));
    kb.on('keydown-P', () => (this.panel.title === PAUSED ? this.panel.cancel() : this.gameScene.pause()));
  }

  // Top right, under the cash. Mostly for touch; desktop also has Esc and P.
  private makePauseButton(): void {
    const button = this.add.container(0, 0, [
      this.add.rectangle(0, 0, 36, 36, 0x000000, 0.45).setStrokeStyle(1, 0xffffff, 0.4),
      this.add.rectangle(-5, 0, 4, 14, 0xffffff),
      this.add.rectangle(5, 0, 4, 14, 0xffffff),
    ]);
    button.setSize(36, 36).setInteractive({ useHandCursor: true }).on('pointerup', () => this.gameScene.pause());
    const layout = () => button.setPosition(this.scale.width - 30, 58);
    layout();
    this.scale.on('resize', layout);
  }

  update(time: number, delta: number): void {
    const { pod, world, stats } = this.gameScene;
    const depth = Math.max(0, pod.row - world.surfaceRow + 1);
    this.hud.update(stats, depth * METRES_PER_TILE, time, delta / 1000);
  }

  toast(message: string, color?: number, hold?: number): void {
    this.hud.toast(message, color, hold);
  }

  // World position (px) of a just-collected ore, for the fly-to-cargo effect.
  oreCollected(oreIndex: number, worldX: number, worldY: number): void {
    const cam = this.gameScene.cameras.main;
    const x = (worldX - cam.worldView.x) * cam.zoom;
    const y = (worldY - cam.worldView.y) * cam.zoom;
    this.hud.flyToCargo(`ore${oreIndex}`, x, y);
  }

  private showPanel(spec: PanelSpec): void {
    this.panel.show(spec);
    this.joystick.setEnabled(false);
  }

  private hidePanel(): void {
    this.panel.hide();
    this.joystick.setEnabled(true);
  }

  showBuilding(kind: BuildingKind): void {
    const game = this.gameScene;
    const s = game.stats;
    const close = () => {
      this.hidePanel();
      game.closeMenu();
    };
    const closeButton: PanelButton = { label: 'Close', onClick: close };
    const refresh = () => this.showBuilding(kind);

    if (kind === 'fuel') {
      const need = s.fuelCapacity - s.fuel;
      const q = s.fuelQuote();
      let buy: PanelButton;
      if (need < 0.05) buy = { label: 'Tank is full', disabled: true };
      else if (q.litres <= 0) buy = { label: 'Not enough cash', disabled: true };
      else {
        const label = q.litres < need - 0.05 ? `Buy ${q.litres.toFixed(1)} L: $${q.cost}` : `Fill up: $${q.cost}`;
        buy = { label, onClick: () => (s.buyFuel(), refresh()) };
      }
      this.showPanel({
        title: 'Fuel',
        lines: [`Tank  ${s.fuel.toFixed(1)} / ${s.fuelCapacity} L`, `Price $${ECONOMY.fuelPrice} per litre`, `Cash  $${s.money}`],
        buttons: [buy, closeButton],
        onCancel: close,
      });
    } else if (kind === 'sell') {
      const lines = ORES.flatMap((ore, i) => {
        const n = s.cargo[i];
        return n ? [`${ore.name} x${n}`.padEnd(13) + `$${n * ore.price}`] : [];
      });
      const value = s.cargoValue;
      this.showPanel({
        title: 'Sell',
        lines: lines.length ? [...lines, `Total`.padEnd(13) + `$${value}`] : ['Cargo bay is empty'],
        buttons: [
          value > 0
            ? { label: `Sell all: $${value}`, onClick: () => (s.sellAll(), this.toast(`+$${value}`, 0xffe066), refresh()) }
            : { label: 'Nothing to sell', disabled: true },
          closeButton,
        ],
        onCancel: close,
      });
    } else if (kind === 'shop') {
      const keys = Object.keys(UPGRADES) as UpgradeKey[];
      const buttons = keys.map((key): PanelButton => {
        const { name, format } = UPGRADES[key];
        const price = s.upgradePrice(key);
        const current = format(s.value(key));
        if (price === null) return { label: `${name.padEnd(7)}${current}  max`, disabled: true };
        const label = `${name.padEnd(7)}${current}→${format(s.value(key, s.levels[key] + 1))}`.padEnd(17) + `$${price.toLocaleString()}`;
        if (price > s.money) return { label, disabled: true };
        return { label, onClick: () => (s.buyUpgrade(key), this.toast(`${name} upgraded`, 0xc39bff), refresh()) };
      });
      this.showPanel({
        title: 'Shop',
        lines: [`Cash  $${s.money.toLocaleString()}`],
        buttons: [...buttons, closeButton],
        onCancel: close,
        plain: true,
      });
    } else {
      const need = s.maxHull - s.hull;
      const q = s.repairQuote();
      let fix: PanelButton;
      if (need < 0.05) fix = { label: 'Hull is fine', disabled: true };
      else if (q.points <= 0) fix = { label: 'Not enough cash', disabled: true };
      else {
        const label = q.points < need - 0.05 ? `Repair some: $${q.cost}` : `Repair: $${q.cost}`;
        fix = { label, onClick: () => (s.repair(), refresh()) };
      }
      this.showPanel({
        title: 'Repair',
        lines: [`Hull  ${Math.ceil(s.hull)} / ${s.maxHull}`, `Price $${ECONOMY.repairPrice} per point`, `Cash  $${s.money}`],
        buttons: [fix, closeButton],
        onCancel: close,
      });
    }
  }

  showPause(): void {
    const game = this.gameScene;
    const resume = () => {
      this.hidePanel();
      game.resume();
    };
    const touch = this.sys.game.device.input.touch;
    this.showPanel({
      title: PAUSED,
      lines: touch ? ['Drag on the left to move'] : ['Move   arrows or WASD', 'Pause  Esc or P'],
      buttons: [
        { label: 'Resume', onClick: resume },
        { label: 'New game', onClick: () => this.confirmNewGame() },
      ],
      onCancel: resume,
    });
  }

  private confirmNewGame(): void {
    this.showPanel({
      title: 'New game?',
      lines: ['Cash, upgrades and this', 'world will be lost.'],
      buttons: [
        { label: 'Start new game', onClick: () => this.gameScene.newGame() },
        { label: 'Back', onClick: () => this.showPause() },
      ],
      onCancel: () => this.showPause(),
    });
  }

  showDeath(reason: string): void {
    const game = this.gameScene;
    this.showPanel({
      title: reason,
      lines: ['Back to your last stop', 'on the surface. Anything', 'mined since is lost.'],
      buttons: [
        { label: 'Continue', onClick: () => (this.hidePanel(), game.continueAfterDeath()) },
        { label: 'New game', onClick: () => game.newGame() },
      ],
    });
  }
}
