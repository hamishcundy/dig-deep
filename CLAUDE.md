# Dig Deep: notes for working on this repo

Motherload-style mining game. Phaser 4.2 + TypeScript + Vite, deployed to GitHub Pages by `.github/workflows/deploy.yml` on every push to `main` (live at https://hamishcundy.github.io/dig-deep/). Public repo: commits use the owner's GitHub noreply address from the repo-local git config, never a personal email or hostname.

## How the owner wants work done

- **Design first, then wait for a go.** Show a scope and get approval before building a feature.
- **Visual changes get a rendered mockup,** not a prose description. Check the mockup renders well yourself before showing it.
- **Research Motherload first** when a feature exists there (earthquakes, boss, items). Follow its approach unless it clashes with this game, and say where you changed it.
- **Weigh options and check the numbers against `src/config.ts` before proposing.** Push back on ideas, including the owner's, when the numbers say so. Never change tuning (prices, rates, thresholds) without offering options first.
- **Every update players would notice** gets a new entry, with the next id, at the top of `RELEASES` in `src/changelog.ts`. That drives the What's New panel.
- Plain, short UI copy.

## Map of the code

- `src/config.ts`: every tuning number (physics, fuel, upgrades, ores, items, earthquakes, Gorlab, sky).
- `src/world/`: `World` (cells, generation, Gorlab's cavern, earthquakes, sky islands) and `tiles` (tile ids; **ids are stored in saves, so never renumber them**).
- `src/pod/Pod.ts`: movement, drilling (down, sideways, and up on sky blocks), bounce clouds.
- `src/game/`: `PodStats` (money, cargo, upgrades, items, shattering), `save.ts` (the surface snapshot, rolled back on death), `progress.ts` (per-world state that survives death: Gorlab's wounds, sky open, totals).
- `src/boss/Gorlab.ts` + `src/scenes/GorlabView.ts` / `gorlabArt.ts`: the boss at 600 m.
- `src/boss/Guams.ts` + `guamsShape.ts` (pose geometry shared by art and hit boxes) + `guamsLines.ts` (his lines and the weak-spot tips), `src/scenes/GuamsView.ts` / `guamsArt.ts`: the dragon on his hoard at the top of the sky. His lair is built into the top rows by `World.buildLair`, and stamped onto saves without the `lair` flag.
- `src/scenes/SkyEffects.ts`: blast-cloud fuses and chains, crumbling clouds, loose ore.
- `src/scenes/terrainArt.ts`: the whole tileset drawn in code (dirt bands, ore grains, rocks, cloud styles).
- `src/ui/`: HUD, panels, item bar. Buttons use `onTap` (`src/ui/tap.ts`), which needs press and release on the button: a finger lifted off the joystick must never press one.
- `src/audio/sound.ts`: all sound, synthesised with Web Audio.
- `public/sw.js` + `src/pwa.ts`: offline cache and home-screen install.

## Saves

- `digdeep-save` (surface snapshot, version 1), `digdeep-progress` (per seed), `digdeep-muted`, `digdeep-seen` (What's New).
- `?seed=123` ignores the save (progress still loads for that seed).

## Backward compatibility: players' saves must survive every update

The game has loyal players with long-running saves. Every update must load their existing save and give them the new content without breaking it or losing progress. Anything that can't load a save today **silently starts a new game**, so a mistake here wipes people's progress with no error.

- **Never bump `VERSION` in `save.ts`.** `loadSave` returns null for any other version, which wipes every save. Add fields instead.
- **New fields get defaults on load** (`?? 0`, merge over `new PodStats()`), the way `deepest`, `levels`, `items` and the sky ore cargo are handled. Never assume a field exists.
- **Never renumber or reuse tile ids or ore order.** Cells and cargo are stored by index. Add new tiles and ores at the end.
- **World layout:** the column count can't change. Rows can only be added, and loading lines old cells up with the bottom of the world (see `GameScene.create`). If the cell count doesn't fit, the save is dropped, so test any layout change against an old save.
- **New world features in old worlds:** a saved world keeps its saved cells, so anything generated into the world (like Gorlab's cavern, `carveCavern`) has to be stamped onto loaded saves too, or old players never see it.
- **Removed items or upgrades:** loading filters out unknown keys. Removing one takes it from players: decide what they get back.
- **Test every save-touching change** by loading a save written by the live build (copy `digdeep-save` and `digdeep-progress` from the live site's localStorage) and checking money, upgrades, items, cargo and the dug world all survive.

## Testing in the Claude browser pane

- The pane is usually hidden, so requestAnimationFrame stops. Load with `?timer`, then call `game.loop.sleep()` and drive frames with `game.step(t, 16.7)`. `window.game` exists in dev only. Remove the auto-pause with `game.events.off('hidden')`.
- Pane screenshots go stale. Use `game.renderer.snapshot()` (call it, then step one frame), and POST the image to a small local receiver to view it. Recreate the receiver script in the scratchpad if it's gone.
- At desktop widths the pane has no touch input: use `MouseEvent`s on the canvas. Phone emulation (width under 768) uses touch, and touches need `pageX`/`pageY`.
- Don't stub `Math.random` around game code: Phaser names text textures with it and breaks.
- After hot reload, import a module through its `?t=` URL (from `performance.getEntriesByType('resource')`) to get the app's instance.
- The pane can't run service workers: test offline play with headless Chrome over CDP (`--remote-debugging-port`, `Network.emulateNetworkConditions`).
- Sound can't be heard in the pane: render it with an `OfflineAudioContext`.
- Gorlab and the sky need `digdeep-progress` set (`gorlabDefeated: true`) for a seed. Guams' state is in the same key (`guamsStirs`, `guamsAwake`, `guamsHits`, `guamsDefeated`). Leaving a page can write its own progress over a value you just set: also set it on the running scene (`game.scene.getScene('game').progress`) before reloading.
- Tweens time themselves with the real clock, so when stepping frames by hand, fades and tweens barely move. Check them with the loop running in real time.
