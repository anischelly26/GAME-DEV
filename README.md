# It Takes One (working title)

A single-player, story-driven 3D adventure. Mara Venn, a tide-engine mechanic, escapes Breakwater,
an island prison that runs on the sea. The current build is the **first playable section** of
Chapter 1, *The Quiet Cell*: about 3–6 minutes of play, not a whole chapter.

- Creative direction and chapter plan: [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md)
- What works, what doesn't, what's temporary: [docs/STATUS.md](docs/STATUS.md)
- Test route and acceptance checks: [docs/TESTING.md](docs/TESTING.md)
- Asset sources and licences: [docs/ASSETS.md](docs/ASSETS.md)
- Independent reviews (Codex): [docs/reviews/](docs/reviews/)

## Requirements

- Node.js 20 or newer (tested with Node 22.13)
- A desktop browser with WebGL 2: current Chrome, Edge or Firefox. A dedicated GPU is not required,
  but integrated graphics may need **Pause → Graphics → Low**.

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

The pause menu has a **Hint** button, restart options, mouse sensitivity, invert-Y, volume and a
graphics quality switch. Settings are remembered in the browser.

## Development tools

In `npm run dev`, or with `?dev=1` on any build:

| Key | Effect |
| --- | --- |
| `` ` `` or F3 | Debug overlay (position, state, camera zone, puzzle state, flags) |
| T | Physics collider overlay |
| R | Respawn at the current checkpoint |
| 1 / 2 / 3 | Jump to checkpoint: cell, maintenance landing, lookout (world state is made consistent) |
| 0 | Restart the section |

URL parameters: `?start=landing` (start at a checkpoint), `?autoplay=1` (watch the scripted
route play itself through the real input pipeline), `?quality=low`, and `?test=1` (automation
mode: no title screen, and the simulation advances only when a test calls `__GAME.step()`).

## Tests

```bash
npm run check        # typecheck + unit tests + production build
npx playwright install chromium   # once
npm run test:e2e     # browser tests (starts its own dev server on port 5199)
```

`PW_CHANNEL=msedge` or `PW_CHANNEL=chrome` uses an installed browser instead of Playwright's
bundled Chromium. Screenshots of fixed viewpoints for review: `npm run dev` in one terminal, then
`node scripts/capture.mjs` (written to `artifacts/shots/`).

## Technology

TypeScript, [three.js](https://threejs.org) for rendering, [Rapier](https://rapier.rs) for
collision and the character controller, and Vite for development and builds. The game runs in
the browser, so testers need nothing beyond Node and a browser, and the same build runs in
headless Chromium for automated checks. Levels are currently authored in code. A Blender/glTF
asset pipeline is planned once art moves beyond procedural proxies.

```
src/
  core/        loop, input, events, maths
  physics/     Rapier wrapper and collision layers
  player/      character controller (feel tuning in MOVEMENT), procedural avatar, scarf
  camera/      third-person camera with collision and camera zones
  gameplay/    interaction, progression/checkpoints/triggers, dialogue, puzzle logic
  levels/      level interface and the Breakwater slice (layout, turbine hall, quiet cell)
  world/       procedural textures, materials, geometry helpers, props, atmosphere
  ui/          HUD and menus
  audio/       procedural sound
  dev/         autopilot used by tests and ?autoplay
```

## Licence

No licence has been chosen yet. All rights reserved by the project owner until they choose one.
Third-party libraries keep their own licences (see [docs/ASSETS.md](docs/ASSETS.md)).
