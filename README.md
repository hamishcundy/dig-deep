# Dig Deep

A Motherload-style mining game. Phaser 4 + TypeScript + Vite; runs in the browser on desktop and phone.

```bash
npm install
npm run dev      # http://localhost:5173, plus a Network URL for phones on the same Wi-Fi
npm run build    # static site in dist/
```

Controls: arrows / WASD on desktop; on a phone, drag anywhere on the left of the screen.

What's in it: digging for ore across five ground layers, fuel, hull and cargo, surface buildings (fuel, sell, repair and supplies, upgrade shop), single-use items in upgradable slots, earthquakes, darkness with a headlight, Gorlab the boss at 600 m, and after beating him a sky level of floating islands with fragile ore, blast, bounce and crumbling clouds, topped by Guams the dragon asleep on his hoard.

Progress saves in the browser (localStorage) at each surface stop.

**Backward compatibility matters.** Players have long-running saves, and every update must load them and give them the new content without losing progress. A save that fails to load silently starts a new game. The rules (never bump the save version, default new fields, never renumber tiles or ores, how world layout changes load) are in `CLAUDE.md`.

Sound effects are synthesised in code (`src/audio/sound.ts`); there are no audio files.

Installable as an app: `public/manifest.webmanifest` and `public/sw.js` (offline cache). The worker only registers in production builds. Icons in `public/` were drawn from the game's own pod and terrain art.

Dev URL options: `?seed=123` plays a specific world (and ignores the save); `?timer` keeps the game loop running in a background tab.

Tuning numbers (physics, drill speed, ores, world size) are all in `src/config.ts`. Notes for working on the code, including how to test in the browser, are in `CLAUDE.md`.
