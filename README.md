# Dig Deep

A Motherload-style mining game. Phaser 4 + TypeScript + Vite; runs in the browser on desktop and phone.

```bash
npm install
npm run dev      # http://localhost:5173, plus a Network URL for phones on the same Wi-Fi
npm run build    # static site in dist/
```

Controls: arrows / WASD on desktop; on a phone, drag anywhere on the left of the screen.

Progress saves in the browser (localStorage) at each surface stop.

Dev URL options: `?seed=123` plays a specific world (and ignores the save); `?timer` keeps the game loop running in a background tab.

Tuning numbers (physics, drill speed, ores, world size) are all in `src/config.ts`.
