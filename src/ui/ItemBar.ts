import Phaser from 'phaser';
import { ITEMS, MAX_ITEM_SLOTS, type ItemKey } from '../config';
import { textStyle } from './theme';

const SIZE = 52;
const GAP = 8;
const MARGIN = 12;

interface Slot {
  bg: Phaser.GameObjects.Rectangle;
  icon: Phaser.GameObjects.Image;
  auto: Phaser.GameObjects.Text;
}

// The item slots at the bottom right, clear of the joystick on the left.
// Shows the slots the pod has (more come with the Item slots upgrade). Tap a
// slot to use its item; items that work by themselves are marked AUTO.
export class ItemBar {
  private slots: Slot[] = [];
  private shown = '';
  private count = 0; // slots shown

  constructor(
    private scene: Phaser.Scene,
    onUse: (slot: number) => void,
  ) {
    for (let i = 0; i < MAX_ITEM_SLOTS; i++) {
      const bg = scene.add.rectangle(0, 0, SIZE, SIZE, 0x000000, 0.5).setStrokeStyle(1, 0xffffff, 0.4);
      bg.setInteractive({ useHandCursor: true }).on('pointerup', () => onUse(i));
      const icon = scene.add.image(0, 0, '__DEFAULT').setScale(2);
      const auto = scene.add.text(0, 0, 'AUTO', textStyle(14, '#ffc531')).setOrigin(0.5, 0).setStroke('#000000', 3);
      this.slots.push({ bg, icon, auto });
    }
    this.layout();
    scene.scale.on('resize', this.layout, this);
  }

  private layout(): void {
    const { width, height } = this.scene.scale;
    this.slots.forEach(({ bg, icon, auto }, i) => {
      const x = width - MARGIN - SIZE / 2 - (this.count - 1 - i) * (SIZE + GAP);
      const y = height - MARGIN - SIZE / 2;
      bg.setPosition(x, y);
      icon.setPosition(x, y + 2);
      auto.setPosition(x, y - SIZE / 2 + 1);
    });
    this.shown = ''; // redo the per-item icon offsets at the new position
  }

  update(items: readonly ItemKey[], slots: number): void {
    const count = Math.max(slots, items.length);
    const key = `${count}:${items.join()}`;
    if (key === this.shown) return;
    if (count !== this.count) {
      this.count = count;
      this.layout(); // clears `shown`
    }
    this.shown = key;
    this.slots.forEach(({ bg, icon, auto }, i) => {
      const item = items[i];
      bg.setVisible(i < count);
      bg.setFillStyle(0x000000, item ? 0.5 : 0.2).setStrokeStyle(1, 0xffffff, item ? 0.4 : 0.15);
      icon.setVisible(!!item);
      if (item) icon.setTexture(ITEMS[item].icon);
      const isAuto = !!item && !!ITEMS[item].auto;
      auto.setVisible(isAuto);
      icon.y = bg.y + (isAuto ? 6 : 2); // room for the AUTO label
    });
  }
}
