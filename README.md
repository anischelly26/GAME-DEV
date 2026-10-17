# It Takes One (working title)

A single-player, story-driven 3D adventure. Mara Venn, a tide-engine mechanic, refused to sign off
a flood diversion that would drown her district. She fell asleep over her drawings and woke up in
Breakwater, an island prison that runs on the sea.

The current build has three chapters. Mara is an original toy-like hero with a living face (eyes,
lids, brows and mouth that blink, look and react).

**Chapter One, *The Quiet Cell***, a short escape from the cell block:

- a skippable story opening, played in the engine: Mara's workshop the night before, then she
  wakes up on the cell floor;
- the pressure-hatch puzzle and the maintenance shaft, where she finds Ivo's steam kicker (double
  jump, air dash, ground pound; a dash and sprint from the start);
- a parkour practice route through the turbine hall, entered by grinding a broken feed pipe (or by
  the scaffold);
- *The Breathing Engine* ride and the split-feed puzzle at the breach;
- five hidden chalk marks, boards to slam, a steam whistle to pull;
- a Watch automaton (a guard on rails with a searchlight) patrolling the Breathing Engine's collar:
  stay out of its lamp, keep the column between you, or knock it out with a ground pound;
- the chapter ending, which points to Chapter Two.

**Chapter Two, *The Warders' Green*** (`?chapter=2`, or the title screen's chapter buttons): dawn
on the spur behind the prison, where its keepers once raised their children:

- a stealth lane: a Watch on a rail down Cottage Lane; the hedged front gardens are the way past it;
- a sunken playground entered down a slide (a CC BY model Mara rides), with a second Watch on its
  rim that hears noise;
- a swing to pump high enough to leap onto the fallen sea wall, while the Watch listens for the
  creak;
- the hangar yard, and a lighthouse burning out on the water (Chapter Three's destination; a CC BY
  scan).

**Chapter Three, *The Low Tide*** (`?chapter=3`): late morning on the water between the spur and
Knoll Rock:

- swimming (a front crawl at the surface) out to a moored steam skiff;
- the skiff to the lagoon's mouth, where the bar is too shallow until Breakwater's engine sends a
  surge over it;
- a Watch on a patrol boat that listens for the engine;
- the lighthouse (the CC BY scan): dock at its stairs, climb to the gallery, find who lit the lamp.

**The movement lab** (`?lab=1`): a yard of stations outside the story for trying every move:
gaps, ledges, vaults, 3/6/10 m drops off a ramp tower, footstep pads for each material, a low
beam, a pound plate and a pool.

First-play length has not been measured with a player yet. The autopilot, which never hesitates,
plays the route in about a minute; the opening adds about 40 seconds unless it is skipped.

- Creative direction and chapter plan: [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md)
- The cinematic overhaul (2026-10-17): [audit](docs/OVERHAUL_AUDIT.md),
  [roadmap](docs/IMPLEMENTATION_ROADMAP.md), [movement](docs/MOVEMENT_2_0.md),
  [cinematic vision](docs/CINEMATIC_VISION.md), [characters](docs/CHARACTER_BIBLE.md),
  [story continuity](docs/STORY_CONTINUITY.md), [art direction](docs/VISUAL_ART_DIRECTION.md)
- What works, what doesn't, what's temporary: [docs/STATUS.md](docs/STATUS.md)
- Test route and acceptance checks: [docs/TESTING.md](docs/TESTING.md)
- Asset sources and licences: [docs/ASSETS.md](docs/ASSETS.md)
- Independent reviews (Codex): [docs/reviews/](docs/reviews/)

## Requirements

- Node.js 20 or newer (tested with Node 22.13)
- A desktop browser with WebGL 2: current Chrome, Edge or Firefox. A dedicated graphics card is not
  required. The **Auto** graphics setting (the default) picks Low on integrated graphics: on an
  Intel UHD laptop GPU, Low runs the route at about 45 FPS in Playwright's bundled Chromium (see
  [docs/STATUS.md](docs/STATUS.md)).

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173 and click **Begin** (or a chapter button). Click the game view to
capture the mouse (Esc releases it and pauses). http://localhost:5173/?chapter=2 opens Chapter Two
directly.

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
| Dash (a roll); hold to sprint | Shift | B / Circle |
| Double jump, air dash (after finding the steam kicker) | Space / Shift in the air | A / B in the air |
| Ground pound (after the kicker) | Ctrl in the air | RB or RT |
| Grind | Land on a pipe (the feed pipe from the lookout); Space jumps off | A jumps off |
| Interact | E (also F, Enter) | X / Square |
| Recenter camera | C or middle mouse | R3 / L3 |
| Pause / settings | Esc or P | Start / Options |
| Skip a cinematic beat | Space or E (prompt bottom right) | A / Cross |

The pause menu has a **Hint** button, restart options and these settings, remembered in the
browser:

| Setting | Range (default) | What it does |
| --- | --- | --- |
| Horizontal sensitivity | 1–100 (25) | Mouse and right-stick turn speed. 25 = 0.0022 rad per mouse pixel; 50 is twice that. |
| Vertical sensitivity | 1–100 (25) | Independent of horizontal. |
| Invert horizontal / vertical look | off | Separately. |
| Field of view | 70–110° horizontal (90) | Wider shows more around Mara. |
| Camera assist | Off / **Weak** / Strong | Lets the camera drift behind Mara when you run forward and leave the mouse alone (Weak after 1.5 s, Strong after 0.8 s and faster). It never turns in the air, on ledges, while vaulting or climbing, during an interaction or cinematic, or near a jump. |
| Camera shake | on | Hard landings and heavy machinery. |
| Volume | 0–1 (0.8) | |
| Graphics | **Auto** / High / Low | Auto picks Low on integrated GPUs (and checks High on the title screen). |

The camera always obeys the mouse or right stick immediately. It stays on Mara's side of walls
and machinery, looking under a low lintel or over her shoulder rather than passing through
anything.

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
- `?lab=1`: the movement lab instead of a chapter.
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
- `node scripts/capture-ending.mjs`: the ending, from the jump to the completion card.
- `node scripts/audit-route.mjs`: the whole chapter from the player's camera, every 2 s, with
  the camera zone, arm length and subtitle at each frame.
- `node scripts/capture-character.mjs`: character turntable.
- `node scripts/capture-video.mjs`: real-time movement clips.
- `node scripts/normal-mode-run.mjs`: plays the whole route in normal mode.
- `node scripts/capture-feel.mjs`: the game-feel poses in the lab (exact frames).

Performance tools (after `npm run build`; headed Edge, real GPU, normal real-time loop):

- `node scripts/trace-stalls.mjs`: route frame times, and the slow WebGL calls inside any frame
  over 100 ms.
- `node scripts/profile-render.mjs`: frame times at fixed viewpoints with rendering features
  switched off one at a time.
- `node scripts/count-draws.mjs`: draw calls and triangles per frame at each checkpoint (a
  deterministic cost proxy; `--root` compares another build).
- `node scripts/measure-frames.mjs`: frame times at every checkpoint of a chapter (or the lab)
  with the camera turning; `--uncapped 1` lifts the display's refresh-rate cap.

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
