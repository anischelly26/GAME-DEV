# It Takes One (working title)

A single-player, story-driven 3D adventure. Mara Venn, a tide-engine mechanic, refused to sign off
a flood diversion that would drown her district. She fell asleep over her drawings and woke up in
Breakwater, an island prison that runs on the sea.

The current build is **Chapter One, *The Quiet Cell***, a short escape from the cell block:

- a skippable story opening (Mara wakes up on the cell floor);
- the pressure-hatch puzzle and the maintenance shaft;
- a parkour practice route through the turbine hall;
- *The Breathing Engine* ride and the split-feed puzzle at the breach;
- the chapter ending, which points to Chapter Two (the hangar cell and an old aircraft, not built
  yet).

First-play length has not been measured with a player yet. The autopilot, which never hesitates,
plays the route in about a minute; the opening adds about 30 seconds unless it is skipped.

- Creative direction and chapter plan: [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md)
- What works, what doesn't, what's temporary: [docs/STATUS.md](docs/STATUS.md)
- Test route and acceptance checks: [docs/TESTING.md](docs/TESTING.md)
- Asset sources and licences: [docs/ASSETS.md](docs/ASSETS.md)
- Independent reviews (Codex): [docs/reviews/](docs/reviews/)

## Requirements

- Node.js 20 or newer (tested with Node 22.13)
- A desktop browser with WebGL 2: current Chrome, Edge or Firefox. A dedicated graphics card is not
  required. The **Auto** graphics setting (the default) picks Low on integrated graphics: on an
  Intel UHD laptop GPU, Low runs the route at about 49 FPS and High at about 9 FPS (see
  [docs/STATUS.md](docs/STATUS.md)).

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173 and click **Begin**. Click the game view to capture the mouse
(Esc releases it and pauses).

Production build (static files in `dist/`, servable from any static host or sub-path):

```bash
npm run build
npm run preview      # serves dist/ at http://localhost:4173
```

## Controls

| Action | Keyboard / mouse | Gamepad (standard mapping) |
| --- | --- | --- |
| Move | W A S D or arrow keys (physical keys: Z Q S D on AZERTY) | Left stick |
| Look | Mouse (click the view to capture; drag also works) | Right stick |
| Jump | Space (hold for a higher jump) | A / Cross |
| Interact | E (also F, Enter) | X / Square (B / Circle also works) |
| Recenter camera | C or middle mouse | R3 / L3 |
| Pause / settings | Esc or P | Start / Options |
| Skip a cinematic beat | Space or E (prompt bottom right) | A / Cross |

The pause menu has a **Hint** button, restart options, mouse sensitivity, invert-Y, volume and
graphics quality (Auto, High, Low). Settings are remembered in the browser.

## Development tools

In `npm run dev`, or with `?dev=1` on any build:

| Key | Effect |
| --- | --- |
| `` ` `` or F3 | Debug overlay (position, state, camera zone, puzzle state, flags) |
| T | Physics collider overlay |
| R | Respawn at the current checkpoint |
| 1 – 9 | Jump to checkpoint: cell, landing, lookout, tier one, collapse, engine gantry, upper gantry, breach, exit (world state is made consistent) |
| 0 | Restart the section |

URL parameters:

- `?start=landing`: start at a checkpoint (no opening).
- `?intro=0` / `?intro=1`: skip or force the story opening. It plays by default in normal play, and
  is off in `?test=1` and `?autoplay=1` runs.
- `?autoplay=1`: watch the scripted route play itself through the real input pipeline.
- `?quality=low` or `?quality=high`: override the graphics setting.
- `?viewer=mara`: turntable of the character model. Drag to orbit, wheel to zoom, number keys
  cycle the animation clips.
- `?test=1`: automation mode. No title screen, and the simulation advances only when a test calls
  `__GAME.step()`.

## Tests

```bash
npm run check        # typecheck + unit tests + production build
npx playwright install chromium   # once
npm run test:e2e     # browser tests (starts its own dev server on port 5199)
```

`PW_CHANNEL=msedge` or `PW_CHANNEL=chrome` uses an installed browser instead of Playwright's
bundled Chromium. Review captures (with `npm run dev` running in another terminal), each taking
`--channel msedge` and, where relevant, `--quality high|low`:

- `node scripts/capture.mjs`: fixed viewpoints.
- `node scripts/capture-opening.mjs`: the story opening, beat by beat.
- `node scripts/capture-character.mjs`: character turntable.
- `node scripts/capture-video.mjs`: real-time movement clips.
- `node scripts/normal-mode-run.mjs`: plays the whole route in normal mode.

Performance tools (after `npm run build`; headed Edge, real GPU, normal real-time loop):

- `node scripts/trace-stalls.mjs`: route frame times, and the slow WebGL calls inside any frame
  over 100 ms.
- `node scripts/profile-render.mjs`: frame times at fixed viewpoints with rendering features
  switched off one at a time.

See [docs/TESTING.md](docs/TESTING.md).

## Technology

TypeScript, [three.js](https://threejs.org) for rendering, [Rapier](https://rapier.rs) for
collision and the character controller, and Vite for development and builds. The game runs in
the browser, so testers need nothing beyond Node and a browser, and the same build runs in
headless Chromium for automated checks. Levels are authored in code, surfaced with photographed
CC0 textures. Mara is assembled from CC0 Quaternius character and animation packs into one glTF
file (`npm run import:mara`; see [docs/ASSETS.md](docs/ASSETS.md)).

```
src/
  core/        loop, input, events, maths
  physics/     Rapier wrapper and collision layers
  player/      character controller (feel tuning in MOVEMENT), traversal, avatar animation, scarf, drop shadow
  camera/      third-person camera with collision and camera zones
  gameplay/    interaction, progression/checkpoints/triggers, dialogue, puzzle logic
  levels/      level interface and the Breakwater slice (layout, turbine hall, quiet cell, story beats)
  render/      post-processing and quality presets
  world/       surface textures, materials, geometry helpers, props, atmosphere
  ui/          HUD and menus
  audio/       procedural sound
  dev/         autopilot used by tests and ?autoplay; character viewer
tools/         character assembly and animation retargeting (run in the browser by import-mara)
```

## Licence

No licence has been chosen yet. All rights reserved by the project owner until they choose one.
Third-party libraries keep their own licences (see [docs/ASSETS.md](docs/ASSETS.md)).
