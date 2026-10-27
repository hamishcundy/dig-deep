import '@fontsource/jersey-10/latin-400.css';
import Phaser from 'phaser';
import { initPwa } from './pwa';
import { GameScene } from './scenes/GameScene';
import { UIScene } from './scenes/UIScene';

async function start(): Promise<void> {
  initPwa(); // early, so the browser's install offer isn't missed
  // Phaser draws text to canvas, so the font must be loaded before any text is made.
  try {
    await document.fonts.load('16px "Jersey 10"');
  } catch {
    // fall back to the default font
  }

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#000000',
    pixelArt: true,
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: '100%',
      height: '100%',
    },
    scene: [GameScene, UIScene],
    // ?timer in dev drives the loop with setTimeout, so it keeps running in a hidden/background tab.
    fps: { forceSetTimeOut: import.meta.env.DEV && new URLSearchParams(location.search).has('timer') },
  });

  // Handy for poking at the game from the browser console during development.
  if (import.meta.env.DEV) (window as unknown as { game: Phaser.Game }).game = game;
}

start();
