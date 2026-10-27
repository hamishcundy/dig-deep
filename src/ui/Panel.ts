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
    kb.on('keydown-ENTER', () => this.spec?.buttons.find((b) => !b.disabled)?.onClick?.());
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
    const px = Math.round((width - pw) / 2);
    const py = Math.round((height - ph) / 2);

    const items: Phaser.GameObjects.GameObject[] = [
      s.add.rectangle(0, 0, width, height, 0x000000, 0.55).setOrigin(0).setInteractive(), // blocks input behind
      s.add.rectangle(px, py, pw, ph, 0x1d2330).setOrigin(0).setStrokeStyle(2, 0x4a5568),
      s.add.text(px + PAD, py + PAD, spec.title, { fontFamily: 'monospace', fontSize: '22px', fontStyle: 'bold', color: '#ffffff' }),
    ];

    let y = py + PAD + 32;
    for (const line of spec.lines) {
      items.push(s.add.text(px + PAD, y, line, { fontFamily: 'monospace', fontSize: '17px', color: '#d6dbe4' }));
      y += LINE_H;
    }
    y += GAP;

    const primary = spec.buttons.find((b) => !b.disabled);
    for (const b of spec.buttons) {
      const fill = b.disabled ? 0x2d3340 : b === primary ? 0x2f6fde : 0x4a5568;
      const rect = s.add.rectangle(px + PAD, y, pw - PAD * 2, BUTTON_H, fill).setOrigin(0);
      const text = s.add
        .text(px + pw / 2, y + BUTTON_H / 2, b.label, {
          fontFamily: 'monospace',
          fontSize: '18px',
          color: b.disabled ? '#7a8394' : '#ffffff',
        })
        .setOrigin(0.5);
      if (!b.disabled && b.onClick) rect.setInteractive({ useHandCursor: true }).on('pointerup', b.onClick);
      items.push(rect, text);
      y += BUTTON_H + GAP;
    }

    this.root = s.add.container(0, 0, items).setDepth(100);
  }

  hide(): void {
    this.root?.destroy();
    this.root = null;
    this.spec = null;
  }
}
