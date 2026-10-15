# Status

| | |
| --- | --- |
| **Branch** | `claude/polish-4979589`, stacked on `claude/breathing-engine` (PR #2), which is stacked on `claude/first-playable` (PR #1) |
| **Build** | Chapter One, *The Quiet Cell*: story opening → pressure-hatch puzzle → maintenance shaft → lookout → parkour practice route → *The Breathing Engine* and the split feed → chapter ending |
| **Reviews** | Codex reviewed `4979589` ([review](reviews/REVIEW-2026-10-15-4979589.md)) and `492bce4` ([review](reviews/REVIEW-2026-10-15-492bce4.md)). This branch responds to both. The work after `492bce4` (the Chapter One story and the R1–R4 fixes below) **has not been reviewed yet**. Codex's findings are preserved unchanged in those files. |

## Launch

```bash
npm install
npm run dev
```

Open http://localhost:5173, click **Begin**, then click the view to capture the mouse. The story
opening plays first (about 30 s; Space or E skips it). Production build: `npm run build`, then
`npm run preview` (http://localhost:4173). Character viewer: http://localhost:5173/?viewer=mara.

**Dual-GPU laptops.** Windows runs browsers on the integrated GPU unless told otherwise. On the
test laptop (Intel UHD plus NVIDIA RTX 2050), Edge used the Intel GPU. Settings → System →
Display → Graphics → Microsoft Edge (or Chrome) → **High performance** moves it to the NVIDIA
GPU, where Low measured about 104 FPS instead of about 49 (table below).

## Since `492bce4`

### Chapter One story (owner request, 2026-10-15)

The owner asked to complete the mini prison escape as Chapter One, with an intro and a short story
that makes the game understandable: Mara fell asleep and woke up in the prison. The airplane,
simulation and voxel-world ideas are Chapter Two (not built).

- **Opening** (`QuietCellLevel.playOpening`): three narration cards over black:
  1. Saltmere, the night before: Mara keeps the tide engines running, and was ordered to sign off
     a flood diversion that would drown her own district;
  2. she refused, went back to her workshop to prove the plan wrong, and fell asleep over the
     drawings;
  3. she woke up somewhere else.

  Then the cell: Mara lies on the floor in the moonlight, the Warden's horn sounds, she gets up,
  looks around, recognises Breakwater, and the chapter title plays. Control returns with the
  objective "Open the service hatch". About 29 s. Space, E or A skips. Skipping drops narration,
  lines and camera moves, and runs every step that sets state, so watching and skipping end the
  same way.
- **Ending.** The intercom exchange hands over to Chapter Two: "The only thing on Breakwater that
  still flies is in the hangar cell." Then an "End of Chapter One" card and the completion screen
  "Chapter One complete".
- **Animation.** Two more retargeted clips in `mara.glb`: getting up from lying down
  (`LayToIdle`) and looking around (`Idle_No_Loop`).
- **Commit.** `396cc75`.
- **Verification.**
  - `tests/e2e/story.spec.ts`, watched: Mara lies down (pelvis under 0.35 m), every card and line
    appears, the lock lasts 27–32 s, then control, the objective, the cell checkpoint and a
    standing pose.
  - `tests/e2e/story.spec.ts`, skipped: the same end state, no jump or movement from the skip
    press, no queued narration, and the gameplay line plays once.
  - Screenshots of each beat in [evidence/chapter-one/](evidence/chapter-one/).
- **Remaining.**
  - Whether a first-time player understands the story has not been tested with a person.
  - No voice acting and no music; the horn is a synthesised placeholder.
  - Mara gets up on the bare floor. There is no authored "asleep on the bunk" pose.

### Response to review `492bce4`, finding by finding

Commits on this branch, oldest first: `2842018` (Codex's review files, unchanged), `396cc75`
(story), `0ab810f` (R2), `6d63bc6` (R1), `4bd9d1b` (R3), and the documentation commit (R4).

#### R2: first traversal stalls for five to six seconds

- **Cause.** Found with `scripts/trace-stalls.mjs`. It times every WebGL call over 2 ms inside
  the page, and names programs by their shader. The first time the camera came close to Mara (at
  the landing's low ceiling), her near-camera fade switched her materials to `transparent`. That
  flag is part of three.js's shader key, so all eight of her programs were rebuilt in one frame.
  On the Intel UHD under ANGLE/D3D11 each link took about 0.5 s, inside `getProgramInfoLog`:
  4.1–4.3 s in total.
- **Change.** Fading materials use a dithered alpha hash that is always on, so the fade changes
  only a uniform and never a shader.
- **Commit.** `0ab810f`.
- **Verification.** Intel UHD 0x46A3, headed Edge, production build, fresh browser context,
  normal real-time loop, scripted route (autopilot through the input pipeline):

  | Preset | Run | Longest frame | Where |
  | --- | --- | --- | --- |
  | Low | 1 | 146 ms | cell, start of the route |
  | Low | 2 | 118 ms | cell |
  | Low | 3 | 146 ms | cell |
  | High | 1 | 312 ms | exit gantry (steady slow frames, no compile) |

  No shader program is created after load in any of these runs. Before the fix: 4,079 ms and
  4,343 ms (Low) at the landing, matching Codex's 5,029 ms (Low) and 6,217 ms (High).
- **Remaining.**
  - About 20 s of load on this GPU (shader compilation behind the loading screen) is unchanged.
  - The 118–146 ms frame at the cell happens without slow WebGL calls; its cause is not
    identified.

#### R1: High unresponsive; Low no longer a smooth fallback

- **Cause.** Measured with `scripts/profile-render.mjs`: frame times at six viewpoints, with each
  rendering feature turned off in turn. On Low, only the 4× multisampled half-float scene target
  made a large difference (about 29 FPS with it, 39–51 FPS without). Shadows and resolution scale
  moved the result much less. AO and bloom are already off on Low.
- **Change.**
  - Low renders without MSAA and smooths edges with FXAA on the final image. High keeps 4× MSAA,
    GTAO and bloom.
  - New graphics setting **Auto**, now the default. It picks Low on integrated, mobile and
    software GPUs by name. Otherwise it starts on High and measures the title screen; a median
    frame over 20 ms switches to Low before play begins. Shader recompiles never happen during
    play.
  - Saved settings from older builds, which stored "High" whenever anything was changed, move to
    Auto once.
  - The menu labels High as meant for a dedicated graphics card.
- **Commit.** `6d63bc6`.
- **Verification.** Same method as R2, one run per row, 1280×720, device scale 1:

  | GPU | Preset | Mean frame | Mean FPS | p95 | Longest |
  | --- | --- | ---: | ---: | ---: | ---: |
  | Intel UHD 0x46A3, before (at `0ab810f`, 3 runs) | Low | 32.4–33.7 ms | 30–31 | 41.7–41.9 ms | 118–146 ms |
  | Intel UHD 0x46A3 | **Low** | **20.4 ms** | **49** | **27.8 ms** | 97 ms |
  | Intel UHD 0x46A3 | High | 111.3 ms | 9.0 | 159.1 ms | 312 ms |
  | RTX 2050 (`--force_high_performance_gpu`) | Low | 9.6 ms | 104 | 14.5 ms | 49 ms |
  | RTX 2050 | High | 22.5 ms | 44 | 41.8 ms | 146 ms |

  For comparison, Codex measured Low at 28.92 FPS (p95 41.6 ms) at `492bce4`, on the same machine,
  with its own harness.

  Auto chose Low on the Intel GPU by name. On the RTX 2050 it started on High, measured the
  title screen, and switched to Low.

  Codex's proposed Low gate (route mean ≥ 30 FPS, p95 ≤ 33.3 ms, no freeze over 250 ms) is met on
  the Intel GPU. The 60 FPS aim is met only on the RTX.
- **Remaining.**
  - High stays unusable on the Intel GPU (about 9 FPS) and is not recommended there.
  - FXAA is softer than MSAA on fine detail such as railings. Its look has not been judged by the
    owner.
  - `profile-render.mjs` has four further configurations (`no-msaa+…`) that have not been run yet.
  - These are single runs on one machine. Codex's benchmark harness was not re-run. Its route
    now meets the story opening unless the URL adds `&intro=0`.

#### R3: automatic camera yaw during airborne travel

- **Cause.** The lazy follow, which drifts the camera behind the direction of travel, also ran
  in the air. Movement is camera-relative, so it bent the direction of a held key mid-jump.
- **Change.** Lazy follow runs only after 0.3 s on the ground: never while airborne, hanging,
  climbing or vaulting. On the ground it still drifts behind the direction of travel.
- **Commit.** `4bd9d1b`.
- **Verification.**
  - `tests/unit/camera.test.ts`: Codex's fixture (0.5 s sideways airborne at 4 m/s, no look
    input) now gives 0° of yaw, down from 24.3°. Ground follow still turns, and there is no turn
    in the first quarter second after landing.
  - `tests/e2e/parkour.spec.ts`: the first gap jumped at 20°, −20° and −30° off square, with the
    camera square to the gap and one stick input held unchanged from start to landing (no
    steering compensation). All land, with no change of camera yaw while airborne. The +30° start
    point stands against the hall-side railing, so that side stops at 20°.
- **Remaining.** On the ground, a held diagonal still curves slowly as the camera follows; that is
  the intended lazy follow. Deterministic stepping, not a human with a keyboard.

#### R4: status and testing documents mixed superseded work

- **Change.** This file, [TESTING.md](TESTING.md), [GAME_DESIGN.md](GAME_DESIGN.md), the
  [README](../README.md) and [ASSETS.md](ASSETS.md) describe the current build. Work on the
  code-sculpted Mara is marked as history below.
- **Commit.** The documentation commit.

## Verification summary

Environment: Windows 11 Pro 10.0.26200, Intel Core i7-12650H, 7.7 GiB RAM, Intel UHD Graphics
0x46A3 and NVIDIA GeForce RTX 2050 laptop GPUs, Node 22.13.1, Microsoft Edge (headless for the
e2e suite, headed for frame times).

**Verified by execution**

- `npm run check`: typecheck, **40/40** unit tests and the production build all pass. Each commit
  on this branch also type-checks on its own.
- `npm run test:e2e` in Edge: **41/41** in 7.0 min at `4bd9d1b` (engine 8, input 10, parkour 13,
  slice 8, story 2). An earlier run with only the story work had 36 passed and 2 failed. Both
  failures were normal-play tests that ran into the new opening; they now load with `?intro=0`.
- Frame times and stall traces: the tables above.
- The opening captured beat by beat (`scripts/capture-opening.mjs`).

**Reviewed in code only**

- Gamepad input, including menus and skip.
- Firefox and Safari.

**Not verified**

- **Any human playtest**: understanding the story, difficulty, fun, the feel of the controls and
  camera, the split-feed puzzle.
- Frame rates on any other machine. Headless numbers are not used for frame rates.
- The subjective quality of the animation and of FXAA versus MSAA.

## Remaining proxies and known issues

- **Proxies.** Sound (synthesised placeholders), most of the turbine hall outside the benchmark
  segment, steam as sprites, the harbour, crane and beacon silhouettes, and NPCs (voices only).
- **Load time.** About 18–21 s to the title on the Intel GPU (shader compilation); not measured
  on the RTX.
- **Moving platforms.** Body-less colliders repositioned after the player each step. Covered by
  tests; odd angles still worth trying by hand.
- **Bundle size.** About 5.3 MB of JavaScript (1.9 MB gzipped), mostly Rapier's inlined WASM, plus
  6.8 MB for `mara.glb` and about 12 MB of textures.
- **Not built yet.** Chapter Two; the express and timed side routes; sprint; persistent saves.

## Next

1. An uncoached first-time playtest of Chapter One, including the opening.
2. Codex's review of this branch.
3. Then, per the owner's direction, Chapter Two: the hangar cell and the aircraft. Its prompt
   lists It Takes Two–style camera settings (separate horizontal and vertical sensitivity,
   invert X and Y, chase assist, camera shake, FOV); those come first.

---

## History: response to review `4979589` (R1–R8)

Kept for the record. The commits are on this branch: `fee34a5`, `19fc380`, `08b59a9`, `a00f42b`,
`ac890cb`, `c37ea7a`, `8749553`, `ac97466` and `e2c6685`. Details are in
[the review](reviews/REVIEW-2026-10-15-4979589.md) and in those commit messages.

| Finding | What changed | Still true at `492bce4` and after? |
| --- | --- | --- |
| R1 mouse look ~57° per pixel | Look converted to radians once at the source (0.0022 rad/px × setting) | Yes. Codex verified it at `492bce4`. |
| R2 menu input fires after Resume | A menu boundary discards queued presses; the cinematic lock survives pause | Yes. Verified at `492bce4`. |
| R3 solution hints repeat | Automatic help stops at a gentle nudge; explicit hints only from the pause menu | Yes |
| R4 segmented Mara | A code-sculpted, skinned Mara (`a00f42b`, `8749553`, `ac97466`, `e2c6685`) | **Superseded.** `492bce4` replaced her with the CC0 Quaternius character and real animation, at the owner's request. The sculpting pipeline, its bake and its tests were removed. |
| R5 repeated masonry, simple obstacles | Metre-scaled UVs; a dressed cell; the spares rack and barrier beam | Partly. The procedural brick was replaced by photographed CC0 textures in `492bce4`. |
| R6 steam and water glare | Per-emitter steam opacity; a quarter of the glint energy | Yes |
| R7 lookout locks control 12 s | About 3.2 s lock; Space/E/A skips | Yes. Verified at `492bce4`. |
| R8 engine is a sequence | The split-feed puzzle at the breach | Yes. Not yet tried by a person. |
