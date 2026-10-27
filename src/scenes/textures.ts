import Phaser from 'phaser';
import { TILE } from '../config';
import { makeTerrainTexture } from './terrainArt';

// Placeholder art, drawn in code.

export function makeTextures(scene: Phaser.Scene): void {
  makeTerrainTexture(scene);
  makePod(scene);
  makeParticles(scene);
  makeIcons(scene);
}

// Pod body fills the top 24px (the hitbox); the drill bit hangs below it.
export const POD_ORIGIN_Y = 12 / TILE;
export const DRILL_FRAMES = 3;
export const podFrame = (drill: number, tread: number) => tread * DRILL_FRAMES + drill;

// Spritesheet: 3 drill-bit frames × 2 tread frames, facing right.
function makePod(scene: Phaser.Scene): void {
  const frames = DRILL_FRAMES * 2;
  const tex = scene.textures.createCanvas('pod', TILE * frames, TILE)!;
  const ctx = tex.getContext();
  const rect = (x: number, y: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, w, h);
  };

  for (let tread = 0; tread < 2; tread++) {
    for (let drill = 0; drill < DRILL_FRAMES; drill++) {
      const f = podFrame(drill, tread);
      const ox = f * TILE;
      ctx.save();
      ctx.translate(ox, 0);

      // drill bit: grey cone with a spiral that moves between frames
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(10, 23);
      ctx.lineTo(22, 23);
      ctx.lineTo(16, 32);
      ctx.closePath();
      ctx.clip();
      rect(8, 23, 16, 9, '#a3a3ab');
      rect(16, 23, 8, 9, '#7c7c84');
      ctx.fillStyle = '#55555c';
      for (let s = -2; s < 4; s++) {
        const y = 23 + s * 3 + drill;
        ctx.beginPath();
        ctx.moveTo(8, y + 2);
        ctx.lineTo(24, y - 1);
        ctx.lineTo(24, y);
        ctx.lineTo(8, y + 3);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

      // treads
      rect(3, 18, 26, 6, '#2b2b30');
      rect(4, 19, 24, 4, '#3d3d44');
      for (let w = 0; w < 4; w++) {
        rect(6 + w * 6, 20, 3, 2, '#77777f');
      }
      for (let s = 0; s < 7; s++) rect(4 + s * 4 + tread * 2, 18, 1, 1, '#55555c');
      for (let s = 0; s < 7; s++) rect(4 + s * 4 + (1 - tread) * 2, 23, 1, 1, '#55555c');

      // body
      rect(5, 6, 22, 12, '#f2b705');
      rect(5, 6, 22, 1, '#ffd84d');
      rect(5, 15, 22, 3, '#c99400');
      rect(14, 7, 1, 8, '#c99400');
      rect(6, 7, 1, 1, '#8a6a00');
      rect(6, 13, 1, 1, '#8a6a00');
      rect(4, 8, 1, 8, '#b38300');

      // cockpit, at the front (right) so flipping shows facing
      rect(17, 7, 9, 7, '#2b4a5e');
      rect(18, 8, 7, 5, '#8fd3ff');
      rect(19, 8, 2, 2, '#ffffff');
      rect(18, 11, 7, 2, '#6ab8e8');

      // headlight and antenna
      rect(27, 10, 2, 3, '#fff6b0');
      rect(9, 1, 1, 5, '#55555c');
      rect(8, 0, 3, 2, '#ff4d4d');

      ctx.restore();
      tex.add(f, 0, ox, 0, TILE, TILE);
    }
  }
  tex.refresh();
}

function makeParticles(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  g.fillStyle(0xffffff);
  g.fillRect(0, 0, 2, 2);
  g.generateTexture('px', 2, 2);
  g.clear();

  g.fillStyle(0xffffff);
  g.fillRect(0, 0, 4, 4);
  g.generateTexture('chunk', 4, 4);
  g.clear();

  g.fillStyle(0xffffff, 0.35);
  g.fillCircle(4, 4, 4);
  g.fillStyle(0xffffff, 0.7);
  g.fillCircle(4, 4, 2.5);
  g.generateTexture('puff', 8, 8);
  g.clear();

  // four-point sparkle
  g.fillStyle(0xffffff);
  g.fillRect(3, 0, 1, 7);
  g.fillRect(0, 3, 7, 1);
  g.fillRect(2, 2, 3, 3);
  g.generateTexture('sparkle', 7, 7);
  g.destroy();
}

// 16px HUD icons, drawn pixel by pixel from little maps ('.' is transparent).
function makeIcons(scene: Phaser.Scene): void {
  const icons: Record<string, { rows: string[]; colors: Record<string, string> }> = {
    'icon-fuel': {
      // jerry can
      rows: [
        '................',
        '.....kkkk.......',
        '....kyyyyk.kk...',
        '...kyyyyyykrrk..',
        '..krrrrrrrrrrrk.',
        '..krwwrrrrrrrrk.',
        '..krwrrrrrrrrrk.',
        '..krrrrrrrdrrrk.',
        '..krrrrrrdrrrrk.',
        '..krrrrrdrrrrrk.',
        '..krrrrdrrrrrrk.',
        '..krrrrrrrrrrrk.',
        '..krrrrrrrrrrrk.',
        '..kddddddddddddk',
        '...kkkkkkkkkkkk.',
        '................',
      ],
      colors: { k: '#2b1a12', r: '#e04a2f', d: '#a8321d', w: '#ff9a7a', y: '#ffd84d' },
    },
    'icon-hull': {
      // shield
      rows: [
        '................',
        '...kkkkkkkkkk...',
        '..kggggggggggk..',
        '..kgwwgggggggk..',
        '..kgwggggggddk..',
        '..kggggggggddk..',
        '..kggggggggddk..',
        '..kgggggggdddk..',
        '...kggggggddk...',
        '...kgggggdddk...',
        '....kgggdddk....',
        '.....kggddk.....',
        '......kgdk......',
        '.......kk.......',
        '................',
        '................',
      ],
      colors: { k: '#10301a', g: '#4ade80', d: '#2a9d55', w: '#c8ffd9' },
    },
    'icon-cargo': {
      // crate
      rows: [
        '................',
        '................',
        '..kkkkkkkkkkkk..',
        '..kllllllllllk..',
        '..kbbbbbbbbbbk..',
        '..kbdbbbbbbdbk..',
        '..kbbdbbbbdbbk..',
        '..kbbbdbbdbbbk..',
        '..kbbbbddbbbbk..',
        '..kbbbdbbdbbbk..',
        '..kbbdbbbbdbbk..',
        '..kbdbbbbbbdbk..',
        '..kbbbbbbbbbbk..',
        '..kkkkkkkkkkkk..',
        '................',
        '................',
      ],
      colors: { k: '#2b1a0e', b: '#b9824a', d: '#7a5128', l: '#e0b07a' },
    },
    'icon-depth': {
      // down arrow
      rows: [
        '................',
        '......kkkk......',
        '......kwwk......',
        '......kwwk......',
        '......kwwk......',
        '......kwwk......',
        '......kwwk......',
        '...kkkkwwkkkk...',
        '...kwwwwwwwwk...',
        '....kwwwwwwk....',
        '.....kwwwwk.....',
        '......kwwk......',
        '.......kk.......',
        '................',
        '................',
        '................',
      ],
      colors: { k: '#10202b', w: '#8fd3ff' },
    },
    'item-repair': {
      // repair kit
      rows: [
        '................',
        '.....kkkkkk.....',
        '.....k....k.....',
        '..kkkkkkkkkkkk..',
        '..kwwwwwwwwwwk..',
        '..kwwwwrrwwwwk..',
        '..kwwwwrrwwwwk..',
        '..kwwrrrrrrwwk..',
        '..kwwrrrrrrwwk..',
        '..kwwwwrrwwwwk..',
        '..kwwwwrrwwwwk..',
        '..kggggggggggk..',
        '..kkkkkkkkkkkk..',
        '................',
        '................',
        '................',
      ],
      colors: { k: '#2a2f3a', w: '#e8eef2', r: '#e0115f', g: '#b8c0cc' },
    },
    'item-dynamite': {
      // three sticks with a lit fuse
      rows: [
        '.........yoy....',
        '..........y.....',
        '.........f......',
        '........f.......',
        '...kkkkkfkkk....',
        '...kLrkLrkLrk...',
        '...kLrkLrkLrk...',
        '...kLrkLrkLrk...',
        '...kbbbbbbbbk...',
        '...kbbbbbbbbk...',
        '...kLrkLrkLrk...',
        '...kLrkLrkLrk...',
        '...kLrkLrkLrk...',
        '...kkkkkkkkkk...',
        '................',
        '................',
      ],
      colors: { k: '#3a1410', L: '#f27a66', r: '#d63a2b', b: '#3a2a20', f: '#c8b07a', y: '#ffd84d', o: '#ff8a3b' },
    },
    'item-teleport': {
      // portal with an up arrow
      rows: [
        '.......ww.......',
        '......wwww......',
        '.....wwwwww.....',
        '.......ww.......',
        '.......ww.......',
        '....kkkkkkkk....',
        '...kppppppppk...',
        '..kpPPPPPPPPpk..',
        '..kpPkkkkkkPpk..',
        '..kpPkkkkkkPpk..',
        '..kpPPPPPPPPpk..',
        '...kppppppppk...',
        '....kkkkkkkk....',
        '................',
        '................',
        '................',
      ],
      colors: { k: '#24123f', p: '#6b3fd1', P: '#a98bff', w: '#ffffff' },
    },
    'item-thrusters': {
      // two nozzles firing downward
      rows: [
        '................',
        '...kkkkkkkkkk...',
        '...kyyyyyyyyk...',
        '...kyyyyyyyyk...',
        '...kddddddddk...',
        '...kkkkkkkkkk...',
        '....kgk..kgk....',
        '....kgk..kgk....',
        '....ooo..ooo....',
        '....oYo..oYo....',
        '.....Y....Y.....',
        '.....r....r.....',
        '................',
        '................',
        '................',
        '................',
      ],
      colors: { k: '#2b2210', y: '#ffc531', d: '#a87a10', g: '#9aa4b2', o: '#ff8a3b', Y: '#ffd84d', r: '#ff3b3b' },
    },
    'icon-coin': {
      rows: [
        '................',
        '.....kkkkkk.....',
        '....kyyyyyyk....',
        '...kyywwyyyyk...',
        '..kyywyyyyyyok..',
        '..kywyyookyyok..',
        '..kyyyokyyyyok..',
        '..kyyyyookyyok..',
        '..kyyyyyykoyok..',
        '..kyyyookyyyok..',
        '..kyyyyyyyyook..',
        '...kyyyyyyook...',
        '....kooooooook...',
        '.....kkkkkk.....',
        '................',
        '................',
      ],
      colors: { k: '#3a2800', y: '#ffd84d', o: '#d9a400', w: '#fff6c0' },
    },
  };
  for (const [key, { rows, colors }] of Object.entries(icons)) {
    const tex = scene.textures.createCanvas(key, 16, 16)!;
    const ctx = tex.getContext();
    rows.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        const color = colors[ch];
        if (!color) return;
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 1, 1);
      });
    });
    tex.refresh();
  }
}
