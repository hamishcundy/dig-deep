import Phaser from 'phaser';
import { ECONOMY, ITEMS, MAX_ITEM_SLOTS, METRES_PER_TILE, ORES, UPGRADES, type BuildingKind, type ItemKey, type UpgradeKey } from '../config';
import { sound } from '../audio/sound';
import { Joystick } from '../input/Joystick';
import { Hud } from '../ui/Hud';
import { ItemBar } from '../ui/ItemBar';
import { markReleasesSeen, RELEASES, unseenReleases, type Release } from '../changelog';
import { installOption, onInstallChange, showInstallPrompt } from '../pwa';
import { Panel, type PanelButton, type PanelSpec } from '../ui/Panel';
import { textStyle } from '../ui/theme';
import type { GameScene } from './GameScene';

const PAUSED = 'Paused';
const TITLE = 'Dig Deep';

// Screen-space overlay: HUD, menus and touch controls, unaffected by camera zoom.
export class UIScene extends Phaser.Scene {
  joystick!: Joystick;
  private hud!: Hud;
  private panel!: Panel;
  private glow!: Phaser.GameObjects.Image;
  private itemBar!: ItemBar;
  private checkedWhatsNew = false;

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
    this.makeGlow();
    this.itemBar = new ItemBar(this, (slot) => this.gameScene.useItem(slot));

    const kb = this.input.keyboard!;
    kb.on('keydown-ESC', () => (this.panel.open ? this.panel.cancel() : this.gameScene.pause()));
    kb.on('keydown-P', () => (this.panel.title === PAUSED ? this.panel.cancel() : this.gameScene.pause()));
    ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'].slice(0, MAX_ITEM_SLOTS).forEach((k, slot) => kb.on(`keydown-${k}`, () => this.gameScene.useItem(slot)));
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

  // Red glow around the screen edges, pulsing while fuel is critical.
  private makeGlow(): void {
    const size = 64;
    const tex = this.textures.createCanvas('glow', size, size)!;
    const ctx = tex.getContext();
    const grad = ctx.createRadialGradient(size / 2, size / 2, size * 0.4, size / 2, size / 2, size * 0.62);
    grad.addColorStop(0, 'rgba(255,40,40,0)');
    grad.addColorStop(1, 'rgba(255,40,40,0.6)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    tex.refresh();
    tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.glow = this.add.image(0, 0, 'glow').setOrigin(0).setDepth(-1).setVisible(false);
    const layout = () => this.glow.setDisplaySize(this.scale.width, this.scale.height);
    layout();
    this.scale.on('resize', layout);
  }

  update(time: number, delta: number): void {
    const { pod, world, stats, fuelMark, fuelState } = this.gameScene;
    const depth = Math.max(0, pod.row - world.surfaceRow + 1);
    this.hud.update(stats, fuelMark, fuelState, depth * METRES_PER_TILE, time, delta / 1000);
    this.itemBar.update(stats.items, stats.itemSlots);
    this.glow.setVisible(fuelState === 'critical').setAlpha(0.7 + 0.3 * Math.sin(time / 180));
  }

  // A big flashing "!" and a message, while the game camera shakes.
  earthquake(): void {
    const { width, height } = this.scale;
    const mark = this.add.text(width / 2, height / 2 - 40, '!', textStyle(160, '#ff3b3b')).setOrigin(0.5).setStroke('#ffffff', 10).setDepth(90);
    this.tweens.add({
      targets: mark,
      alpha: { from: 1, to: 0.15 },
      duration: 160,
      yoyo: true,
      repeat: 4,
      onComplete: () => mark.destroy(),
    });
    this.toast('Earthquake! Tunnels shifted', 0xff6b6b, 2500);
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
        const label = q.litres < need - 0.05 ? `Buy ${q.litres.toFixed(1)} L` : 'Fill up';
        buy = { label, detail: `$${q.cost}`, onClick: () => (s.buyFuel(), sound.fill(), refresh()) };
      }
      this.showPanel({
        title: 'Fuel',
        lines: [['Tank', `${s.fuel.toFixed(1)} / ${s.fuelCapacity} L`], ['Price', `$${ECONOMY.fuelPrice} per litre`], ['Cash', `$${s.money.toLocaleString()}`]],
        buttons: [buy, closeButton],
        onCancel: close,
      });
    } else if (kind === 'sell') {
      const lines = ORES.flatMap((ore, i): [string, string][] => {
        const n = s.cargo[i];
        return n ? [[`${ore.name} x${n}`, `$${(n * ore.price).toLocaleString()}`]] : [];
      });
      const value = s.cargoValue;
      this.showPanel({
        title: 'Sell',
        lines: lines.length ? [...lines, ['Total', `$${value.toLocaleString()}`]] : ['Cargo bay is empty'],
        buttons: [
          value > 0
            ? { label: 'Sell all', detail: `$${value.toLocaleString()}`, onClick: () => (s.sellAll(), sound.coin(), this.toast(`+$${value}`, 0xffe066), refresh()) }
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
        if (price === null) return { label: `${name} ${current}`, detail: 'max', disabled: true };
        const label = `${name} ${current} → ${format(s.value(key, s.levels[key] + 1))}`;
        const detail = `$${price.toLocaleString()}`;
        if (price > s.money) return { label, detail, disabled: true };
        return { label, detail, onClick: () => (s.buyUpgrade(key), sound.upgrade(), this.toast(`${name} upgraded`, 0xc39bff), refresh()) };
      });
      this.showPanel({
        title: 'Shop',
        lines: [['Cash', `$${s.money.toLocaleString()}`]],
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
        const label = q.points < need - 0.05 ? 'Repair some' : 'Repair';
        fix = { label, detail: `$${q.cost}`, onClick: () => (s.repair(), sound.repair(), refresh()) };
      }
      // Supplies: single-use items for the slots on the item bar.
      const keys = Object.keys(ITEMS) as ItemKey[];
      const supplies = keys.map((key): PanelButton => {
        const price = s.itemPrice(key);
        const detail = `$${price.toLocaleString()}`;
        const { name, icon } = ITEMS[key];
        const disabled = s.itemSlotsFull || price > s.money;
        return { label: name, detail, icon, disabled, onClick: () => (s.buyItem(key), sound.coin(), refresh()) };
      });
      this.showPanel({
        title: 'Repair',
        lines: [
          ['Hull', `${Math.ceil(s.hull)} / ${s.maxHull}`],
          ['Cash', `$${s.money.toLocaleString()}`],
          ['Item slots', `${s.items.length} / ${s.itemSlots} used`],
        ],
        buttons: [fix, ...supplies, closeButton],
        onCancel: close,
        plain: fix.disabled, // only highlight (and Enter) the repair itself, never a purchase
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
      lines: touch ? ['Drag on the left to move'] : [['Move', 'arrows or WASD'], ['Pause', 'Esc or P']],
      buttons: [
        { label: 'Resume', onClick: resume },
        this.soundButton(() => this.showPause()),
        { label: 'New game', onClick: () => this.confirmNewGame(() => this.showPause()) },
      ],
      onCancel: resume,
    });
  }

  // Shown on load, over the surface. Enter or the first button starts play.
  showTitle(resumed: boolean): void {
    // After an update, a returning player sees what's new first (once per load).
    if (!this.checkedWhatsNew) {
      this.checkedWhatsNew = true;
      const unseen = unseenReleases(resumed);
      markReleasesSeen();
      if (unseen.length) return this.showWhatsNew(unseen, () => this.showTitle(resumed));
    }
    const play = () => {
      this.hidePanel();
      this.gameScene.startPlaying();
    };
    const back = () => this.showTitle(resumed);
    // The install button comes and goes as the browser offers it.
    onInstallChange(() => this.panel.title === TITLE && back());
    const install = installOption();
    this.showPanel({
      title: TITLE,
      big: true,
      lines: [resumed ? 'Welcome back.' : 'Dig for ore. Sell it. Go deeper.'],
      buttons: [
        { label: resumed ? 'Continue' : 'Play', onClick: play },
        { label: 'How to play', onClick: () => this.showHowTo(back) },
        ...(resumed ? [{ label: "What's new", onClick: () => this.showWhatsNew(RELEASES.slice(0, 3), back) }] : []),
        ...(resumed ? [{ label: 'New game', onClick: () => this.confirmNewGame(back) }] : []),
        this.soundButton(back),
        ...(install === 'prompt' ? [{ label: 'Install app', onClick: () => showInstallPrompt() }] : []),
        ...(install === 'ios' ? [{ label: 'Install app', onClick: () => this.showIosInstall(back) }] : []),
      ],
    });
  }

  // Toggles sound, then redraws the menu it is on.
  private soundButton(redraw: () => void): PanelButton {
    return { label: sound.muted ? 'Sound: off' : 'Sound: on', onClick: () => (sound.toggleMute(), redraw()) };
  }

  private showIosInstall(back: () => void): void {
    this.showPanel({
      title: 'Install app',
      lines: ['Tap Share in your browser', '(in Safari it may be under ···),', 'then Add to Home Screen.'],
      buttons: [{ label: 'Got it', onClick: back }],
      onCancel: back,
    });
  }

  // Release notes, newest first. With more than one release, each gets its title.
  private showWhatsNew(releases: Release[], back: () => void): void {
    const lines = releases.flatMap((r) => [...(releases.length > 1 ? [r.title] : []), ...r.notes.map((n) => `- ${n}`)]);
    this.showPanel({
      title: "What's new",
      lines,
      buttons: [{ label: 'Got it', onClick: back }],
      onCancel: back,
    });
  }

  private showHowTo(back: () => void): void {
    const touch = this.sys.game.device.input.touch;
    this.showPanel({
      title: 'How to play',
      lines: [
        'Drill down and collect ore.',
        'Sell it at the surface, then',
        'buy upgrades at the shop.',
        'Watch your fuel and hull:',
        'refuel and repair up top.',
        'Buy items at the repair shop;',
        touch ? 'tap one to use it.' : 'number keys use them.',
        touch ? 'Drag on the left to move.' : 'Move with arrows or WASD.',
      ],
      buttons: [{ label: 'Got it', onClick: back }],
      onCancel: back,
    });
  }

  private confirmNewGame(back: () => void): void {
    this.showPanel({
      title: 'New game?',
      lines: ['Cash, upgrades and this', 'world will be lost.'],
      buttons: [
        { label: 'Start new game', onClick: () => this.gameScene.newGame() },
        { label: 'Back', onClick: back },
      ],
      onCancel: back,
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
