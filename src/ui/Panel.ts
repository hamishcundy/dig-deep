import Phaser from 'phaser';
import { sound } from '../audio/sound';
import { textStyle } from './theme';

export interface PanelButton {
  label: string;
  detail?: string; // right-aligned, e.g. a price
  icon?: string; // texture key, drawn left of the label
  onClick?: () => void;
  disabled?: boolean;
}

export interface PanelSpec {
  title: string;
  lines: (string | [string, string])[]; // a pair is a label and a right-aligned value
  buttons: PanelButton[];
  onCancel?: () => void; // Esc
  plain?: boolean; // no highlighted button, and Enter does nothing
  big?: boolean; // large logo-style title
}

const PAD = 20;
const LINE_H = 26;
const BUTTON_H = 48;
const GAP = 10;

// Centred modal with a title, text lines and big tappable buttons.
// Enter presses the first enabled button; cancel() (Esc, wired by the scene) calls onCancel.
export class Panel {
  private root: Phaser.GameObjects.Container | null = null;
  private spec: PanelSpec | null = null;

  constructor(private scene: Phaser.Scene) {
    scene.scale.on('resize', () => this.spec && this.show(this.spec));
    const kb = scene.input.keyboard!;
    kb.on('keydown-ENTER', () => {
      const b = this.spec?.plain ? undefined : this.spec?.buttons.find((b) => !b.disabled);
      if (b?.onClick) press(b.onClick);
    });
  }

  get open(): boolean {
    return this.spec !== null;
  }

  get title(): string | null {
    return this.spec?.title ?? null;
  }

  cancel(): void {
    this.spec?.onCancel?.();
  }

  show(spec: PanelSpec): void {
    this.hide();
    this.spec = spec;
    const s = this.scene;
    const { width, height } = s.scale;
    const pw = Math.min(360, width - 32);
    const titleH = spec.big ? 64 : 38;
    const ph = PAD * 2 + titleH + spec.lines.length * LINE_H + GAP + spec.buttons.length * (BUTTON_H + GAP);

    // Content is laid out from the panel's top-left, then scaled down if the screen is short (phone landscape).
    const content: Phaser.GameObjects.GameObject[] = [
      s.add.rectangle(0, 0, pw, ph, 0x1d2330).setOrigin(0).setStrokeStyle(2, 0x4a5568),
      spec.big
        ? s.add.text(pw / 2, PAD - 4, spec.title, textStyle(60, '#ffd84d')).setOrigin(0.5, 0).setStroke('#7a4a00', 6)
        : s.add.text(PAD, PAD, spec.title, textStyle(32)),
    ];

    let y = PAD + titleH;
    for (const line of spec.lines) {
      const [left, right] = typeof line === 'string' ? [line, ''] : line;
      content.push(s.add.text(PAD, y, left, textStyle(24, '#d6dbe4')));
      if (right) content.push(s.add.text(pw - PAD, y, right, textStyle(24)).setOrigin(1, 0));
      y += LINE_H;
    }
    y += GAP;

    const primary = spec.plain ? undefined : spec.buttons.find((b) => !b.disabled);
    for (const b of spec.buttons) {
      const fill = b.disabled ? 0x2d3340 : b === primary ? 0x2f6fde : 0x4a5568;
      const rect = s.add.rectangle(PAD, y, pw - PAD * 2, BUTTON_H, fill).setOrigin(0);
      const color = b.disabled ? '#7a8394' : '#ffffff';
      // With a detail the label sits left and the detail right; otherwise the label is centred.
      const labelX = b.icon ? PAD * 2 + 30 : PAD * 2;
      const text = b.detail
        ? s.add.text(labelX, y + BUTTON_H / 2, b.label, textStyle(26, color)).setOrigin(0, 0.5)
        : s.add.text(pw / 2, y + BUTTON_H / 2, b.label, textStyle(26, color)).setOrigin(0.5);
      if (!b.disabled && b.onClick) rect.setInteractive({ useHandCursor: true }).on('pointerup', () => press(b.onClick!));
      content.push(rect, text);
      if (b.icon) content.push(s.add.image(PAD * 2 + 12, y + BUTTON_H / 2, b.icon).setScale(1.5).setAlpha(b.disabled ? 0.4 : 1));
      if (b.detail) content.push(s.add.text(pw - PAD * 2, y + BUTTON_H / 2, b.detail, textStyle(26, color)).setOrigin(1, 0.5));
      y += BUTTON_H + GAP;
    }

    const scale = Math.min(1, (height - 16) / ph);
    const panel = s.add
      .container(Math.round((width - pw * scale) / 2), Math.round((height - ph * scale) / 2), content)
      .setScale(scale);
    const dim = s.add.rectangle(0, 0, width, height, 0x000000, 0.55).setOrigin(0).setInteractive(); // blocks input behind
    this.root = s.add.container(0, 0, [dim, panel]).setDepth(100);
  }

  hide(): void {
    this.root?.destroy();
    this.root = null;
    this.spec = null;
  }
}

function press(onClick: () => void): void {
  sound.tick();
  onClick();
}
