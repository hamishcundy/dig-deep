import Phaser from 'phaser';

export interface PanelButton {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}

export interface PanelSpec {
  title: string;
  lines: string[];
  buttons: PanelButton[];
  onCancel?: () => void; // Esc
  plain?: boolean; // no highlighted button, and Enter does nothing
}

const PAD = 20;
const LINE_H = 26;
const BUTTON_H = 48;
const GAP = 10;

// Centred modal with a title, text lines and big tappable buttons.
// Enter presses the first enabled button; Esc calls onCancel.
export class Panel {
  private root: Phaser.GameObjects.Container | null = null;
  private spec: PanelSpec | null = null;

  constructor(private scene: Phaser.Scene) {
    scene.scale.on('resize', () => this.spec && this.show(this.spec));
    const kb = scene.input.keyboard!;
    kb.on('keydown-ESC', () => this.spec?.onCancel?.());
    kb.on('keydown-ENTER', () => !this.spec?.plain && this.spec?.buttons.find((b) => !b.disabled)?.onClick?.());
  }

  get open(): boolean {
    return this.spec !== null;
  }

  show(spec: PanelSpec): void {
    this.hide();
    this.spec = spec;
    const s = this.scene;
    const { width, height } = s.scale;
    const pw = Math.min(360, width - 32);
    const ph = PAD * 2 + 32 + spec.lines.length * LINE_H + GAP + spec.buttons.length * (BUTTON_H + GAP);

    // Content is laid out from the panel's top-left, then scaled down if the screen is short (phone landscape).
    const content: Phaser.GameObjects.GameObject[] = [
      s.add.rectangle(0, 0, pw, ph, 0x1d2330).setOrigin(0).setStrokeStyle(2, 0x4a5568),
      s.add.text(PAD, PAD, spec.title, { fontFamily: 'monospace', fontSize: '22px', fontStyle: 'bold', color: '#ffffff' }),
    ];

    let y = PAD + 32;
    for (const line of spec.lines) {
      content.push(s.add.text(PAD, y, line, { fontFamily: 'monospace', fontSize: '17px', color: '#d6dbe4' }));
      y += LINE_H;
    }
    y += GAP;

    const primary = spec.plain ? undefined : spec.buttons.find((b) => !b.disabled);
    for (const b of spec.buttons) {
      const fill = b.disabled ? 0x2d3340 : b === primary ? 0x2f6fde : 0x4a5568;
      const rect = s.add.rectangle(PAD, y, pw - PAD * 2, BUTTON_H, fill).setOrigin(0);
      const text = s.add
        .text(pw / 2, y + BUTTON_H / 2, b.label, {
          fontFamily: 'monospace',
          fontSize: '18px',
          color: b.disabled ? '#7a8394' : '#ffffff',
        })
        .setOrigin(0.5);
      if (!b.disabled && b.onClick) rect.setInteractive({ useHandCursor: true }).on('pointerup', b.onClick);
      content.push(rect, text);
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
