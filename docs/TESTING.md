# Testing: Chapter One, *The Quiet Cell*

## Automated checks

| Command | What it checks |
| --- | --- |
| `npm run typecheck` | TypeScript strict type-check |
| `npm test` | Unit tests (Vitest): puzzle rules (pressure hatch, split feed), progression/checkpoints/triggers, level dimensions vs movement capability, traversal eligibility against a real Rapier world, every camera-assist condition, the spring arm and framing, the subtitle queue, the settings migration |
| `npm run build` | Production bundle builds |
| `npm run check` | All three above |
| `npm run test:e2e` | Browser tests (Playwright) against a dev server it starts on port 5199. Set `PW_CHANNEL=msedge` to use installed Edge (GPU). The default is Playwright's bundled Chromium, which renders in software at roughly 2 s per frame for this game; its time limits are four times longer, and the real-time movement check skips itself there |

With `?test=1` the simulation advances only when a test calls `__GAME.step(n)`, so results don't
depend on the machine's frame rate. Inputs go through the real input pipeline (virtual stick and
button presses, or real browser mouse/keyboard events where stated), not through teleports, except
where a test deliberately places the player. Test mode starts on Low quality, and without the story
opening unless the URL has `&intro=1`.

### `tests/e2e/jumps.spec.ts`: every route jump with the real keyboard (20)

Real key events (`page.keyboard`), deterministic stepping. Each jump is played twice:

- **camera still:** set once, then not touched;
- **camera rotating:** the right mouse button drags it sideways throughout, about 15° a second.

Where the space allows, each mode is also played with W, and with W+D on a 20° approach. The
jumps:

- the shaft's girder: a running vault, ending between the girder and the railing, never in the
  channel;
- the 2 m drainage gap, from the lit crossing;
- tier one's broken walkway;
- the barrier vault;
- the gantry ledge catch and climb;
- the broad jump from the raised ram to the exit gantry.

Every case must land with no fall. While airborne, the direction the held keys ask for must not
change by more than 6°. Without the airborne yaw latch, 6 of the 10 rotating cases bend 6.5–8°
and fail.

### `tests/e2e/story.spec.ts`: Chapter One opening (2)

1. **Watched.** Mara starts lying on the cell floor (pelvis under 0.35 m above her feet) with
   control locked, the first card on screen, no objective and the skip prompt visible. Every
   narration card, Mara's lines and the chapter title appear. Control returns after 27–32 s with
   the objective "Open the service hatch", the cell checkpoint, the camera released, the cards
   gone and Mara standing.
2. **Skipped.** Space half a second in gives the same end state at once. The skip press neither
   jumps nor moves her, skipped narration is not queued, and the gameplay line ("Fresh copper…")
   plays exactly once.

### `tests/e2e/slice.spec.ts`: first slice (8)

1. **Boot and render.** Playing state, objective visible, the canvas isn't black, no console errors.
2. **Movement and jump.** The stick moves the player more than 1.5 m in 0.5 s, releasing stops
   within 0.2 s, a jump rises more than 1.2 m and lands.
3. **Wrong-state lever.** The lever with the bypass open hisses, counts a failed pull and leaves
   the hatch closed.
4. **Full route (autopilot, real physics).** Cell puzzle → shaft → lookout → reveal → the whole
   increment → exit gantry → completion. Requires zero falls and all story flags.
5. **Fall recovery.** Dropping into the drainage channel recovers at the landing with the hatch
   still open and flags intact.
6. **Restart after completion.** "Restart section" gives a fresh puzzle.
7. **Pause.** The simulation does not advance while paused, and resumes.
8. **Jump measurement.** Reports running-jump distance and apex, and fails if the distance drops
   below 3.0 m.

The full route ends on the completion card "Chapter One complete".

### `tests/e2e/engine.spec.ts`: practice route and The Breathing Engine (8)

1. **Increment route (autopilot).** Drops → gap → vault (a real vault) → ledge catch and pull-up →
   shuttle → brake → collar ride → set the ram catch → feed the ram → cross → release on the deck
   → ride → broad jump → exit. Zero falls.
2. **Steam curtain.** Walking into it pushes Mara back without a fall. After the feed goes to the
   ram, the same walk passes.
3. **Collar is reversible.** Brake → held → ride up → top → call down → held.
4. **Recovery on the upper route.** A fall recovers at the upper gantry; the collar stays at the top.
5. **Split feed, wrong order then recovery.** Feeding the ram first stops the steam but sends the
   ram up empty (and Mara says so). Venting brings it down; catch + feed primes it (gauge strain,
   ram held down, steam off). Standing on the deck offers "Release the catch"; a real **E** key
   press carries her up 2.4 m.
6. **Catch at the top.** A catch set with the ram up holds it there even when venting; freeing it
   lets the ram follow the feed.
7. **Checkpoint reload and missed jump.** The "Breach" checkpoint reloads with the ram primed. After
   riding up, a fall recovers at "Breach" with the ram primed again.
8. **Restart** resets the split feed to its initial state.

### `tests/e2e/input.spec.ts`: controls with real browser events (10)

Look, menus and pacing (review `4979589` findings R1, R2, R3, R7), driven by Playwright's real
mouse and keyboard. The two normal-play tests (4 and 11) load with `?intro=0`, since the opening
deliberately locks control. There are 11 tests:

1. 100 px of drag-look turns the camera by `(setting / 25) × 0.0022 rad/px` at horizontal
   sensitivity 25, 5 and 75, set through the real pause-menu slider.
2. Vertical sensitivity (50) is independent of horizontal, and invert-X flips only the yaw.
3. One pixel is a tiny change; the pitch clamps at its limits; invert-Y (via the checkbox) flips it.
4. Pointer-locked look in normal play mode (not test mode) uses the same scale.
5. Space, E, Enter and F pressed while paused do nothing after Resume (standing at the lever).
6. Space that activates the focused Resume button does not also jump.
7. Pausing mid-jump and resuming continues that jump without a second one.
8. The lookout reveal holds control for at most 3.5 s, and pausing during it keeps the lock.
9. Space skips the reveal into the same valid state, without duplicated lines or a jump.
10. Five idle minutes never reveal or repeat the solution; requested hints escalate to the explicit
    one exactly once.
11. Holding W in real time (normal mode) moves Mara.

### `tests/e2e/parkour.spec.ts`: imperfect approach angles (13)

Runs with a real jump press, not the autopilot's square lines. Tests 1–10 steer: the stick input
is recomputed from the live camera each step. Tests 11–13 hold one fixed input:

1–3. **Vault** the barrier beam square-on, 25° and −40° off square.
4–7. **Ledge catch** the gantry's end edge square-on, −20°, −35° and −45°. Angled approaches come
   from the hall side, because the wall is on the other side.
8–10. **First gap** square-on and ±20°. While airborne the drop shadow sits on the landing surface.
11–13. **First gap with one fixed direction** at 20°, −20° and −30° (review `492bce4` R3). The
   camera is square to the gap and the stick input is held unchanged from start to landing. All
   land, and the camera's yaw does not change while airborne. A +30° start point 3 m back stands
   against the hall-side railing, so that side stops at 20°.

## Review captures

All of these need `npm run dev` running in another terminal. Output goes to `artifacts/` (ignored by git).

| Command | Output |
| --- | --- |
| `node scripts/capture.mjs --channel msedge --size 1280x720 --quality high` (or `low`) | Fixed viewpoints 01–07 (slice), 09–19 (increment, junction, ram), c1–c7 (Mara in game lighting; c1 repeats the framing of Codex's `probe-character-front.png`) |
| `node scripts/capture-opening.mjs --channel msedge --size 1280x720` | The story opening at ten fixed story times: the three cards, Mara asleep, getting up, standing, looking around, recognising Breakwater, the chapter title, and control |
| `node scripts/capture-ending.mjs --channel msedge --size 1280x720` | The ending: out of the breach, over the shoulder, the hangar named and lit, Ivo, the completion card |
| `node scripts/audit-route.mjs --channel msedge` | The whole chapter from the normal gameplay camera, every 2 s (`--every`), with a log of checkpoint, objective, mode, camera zone, arm length and subtitle (see [CHAPTER_ONE_AUDIT.md](CHAPTER_ONE_AUDIT.md)) |
| `node scripts/capture-character.mjs --channel msedge` | Turntable of Mara in the dev viewer: front, three-quarter, side, back, face, hands, boots, walk, jog, jump, climb |
| `node scripts/capture-video.mjs --channel msedge --quality high` | Real-time WebM clips of the autopilot: cell and shaft, tier-one vault and climb, split feed and exit |
| `node scripts/normal-mode-run.mjs --channel msedge --quality high` (or `low`) | Plays the whole route in normal mode (title, Begin, real-time loop) and reports completion, falls, time and console errors |

Watch the scripted route live: open http://localhost:5173/?autoplay=1 and click **Begin**.

## Frame times and stalls

Frame rates are measured only in a **headed** browser on the GPU, with the production build and the
normal real-time loop. Test mode and deterministic stepping are never used for frame rates. Run
`npm run build` first. Both scripts serve `dist/` themselves, start each run in a fresh browser,
and load with `?intro=0`.

| Command | Output |
| --- | --- |
| `node scripts/trace-stalls.mjs --quality low --runs 3` (or `high`) | Plays the whole route with the autopilot through the input pipeline. Prints the GPU, frame count, mean, p95 and longest frame, plus every frame over 100 ms with the WebGL calls over 2 ms inside it (shader programs named), and three.js program and texture counts |
| `node scripts/trace-stalls.mjs --quality high --gpu discrete` | The same on the high-performance GPU of a dual-GPU laptop (`--force_high_performance_gpu`) |
| `node scripts/trace-stalls.mjs --channel chromium` | Playwright's bundled Chromium. Windows' per-app GPU setting does not cover it, so on the test laptop it runs on the integrated Intel GPU even when Edge is set to the NVIDIA one (`--force_low_power_gpu` does not override that setting) |
| `node scripts/count-draws.mjs [--root artifacts/base-xxxx]` | Draw calls and triangles per frame (all passes) at each checkpoint, from the player's camera: a deterministic cost proxy, independent of the machine's load. `--root` measures another build, e.g. an older commit built with `git archive <sha> \| tar -x -C artifacts/base-<sha>` and `vite build --base ./` inside it |
| `node scripts/profile-render.mjs --quality low` | Frame times at six checkpoints with one rendering feature off at a time (shadows, MSAA, AO, bloom, resolution 0.75, all post-processing). `--only name,name` picks configurations, and `--headless 1` runs without a window (it still renders on the GPU, and gave the same Low preset numbers here). The four `no-msaa+…` configurations have not been run yet |

Close other GPU work and keep the window in front: a hidden window is throttled. Edge on a
dual-GPU laptop uses the integrated GPU unless Windows is set to give it the high-performance
one. Codex's harness (`docs/reviews/benchmark-492bce4.mjs`) loads without `intro=0`, so on this
branch its route would start with the opening.

## Manual test route (about 12 minutes)

Run `npm run dev`, open http://localhost:5173, click **Begin**, then click the view to capture the
mouse.

| # | Do | Expect |
| --- | --- | --- |
| 0 | Watch the opening (do not skip) | Three cards over black explain who Mara is and how she fell asleep; she wakes on the cell floor, gets up, looks around and names Breakwater; the "Chapter One, The Quiet Cell" title; then control. About 30 s. Restart and press Space during it: the same end state at once |
| 1 | Look around the cell | Objective "Open the service hatch". Mara notices the fresh copper. Supply pipe, gauge, diagram, piston, hatch and LIFT lever all visible. Mouse look is smooth at sensitivity 1; the slider and invert-Y in the pause menu take effect at once |
| 2 | Walk to the scratched diagram, press **E** | Full-screen diagram; E or moving closes it |
| 2b | Read the notice on the cell door (right wall) | The warden's transfer order; Mara's line about being carried in asleep |
| 3 | Pull the lever (right of the hatch) | Hiss and steam at the piston top, hatch shudders, nothing opens |
| 4 | Turn the bypass valve (left, low) | Pointer bar goes across, vent goes quiet, the amber chevrons move from the vent branch to the piston branch, needle climbs into LIFT |
| 5 | Pull the lever | Hatch rises and latches |
| 6 | Go through the hatch, run at the girder and press Space; keep holding W | A vault over the girder; the railing along the channel stops you. Standing still at the girder for 7 s shows the jump key once |
| 6b | Walk to the lit crossing at the right (broken catwalk, striped lip) and jump the channel | Clean landing on the far side |
| 7 | Enter the lookout, light the lamp | Control returns after about 3 s (Space/E skips); lamps come on, the rope gate drops, the intercom plays while you move |
| 8 | Drop to the scaffold, then to tier 1 | Two safe drops; "Tier one" light |
| 9 | Jump the broken walkway | Striped lips mark takeoff and landing; drop shadow shows where you will land |
| 10 | Run at the striped barrier beam and press Space | Quick vault over it, also when approaching at an angle |
| 11 | At the spares rack, jump at the gantry's painted end edge while pushing toward it | Catch and pull-up, also from an angle; walk along it and drop beyond the rack |
| 12 | Shuttle, BRAKE, RIDE | As before: no timing needed |
| 13 | Walk into the steam on tier 3 | Pushed back at the hazard band; Mara says something feeds the line |
| 14 | Turn the feed to the ram | Steam stops; the chevrons leave the cracked main and run along the feed pipe round to the ram; the ram rises empty: "Without me." |
| 15 | Feed back to the vent, set the CATCH, feed to the ram | Ram drops, steam returns; then the ram waits, shuddering, RAM gauge in the red, steam off |
| 16 | Walk to the ram, stand on it, **E** "Release the catch" | Ram carries you up; jump to the exit gantry |
| 17 | On the exit gantry | Over the shoulder to sea; the intercom points left to the hangar on the spur, whose lights come up behind a floatplane; "Chapter One complete" over that view, with the choices fading in |

Also check: **Hint** in the pause menu three times while stuck in the cell, then three times at the
split feed (each escalates, nothing repeats automatically); pausing mid-jump; alt-tabbing;
interacting from slightly different angles; gamepad if available; the Graphics setting (Auto
names the choice it made; High and Low switch at once). Camera: with the mouse untouched and W
held, the camera drifts behind Mara on Weak, faster on Strong, never on Off, and never in the air;
jump a gap while turning the mouse (the jump keeps its line); stand against a wall or on the
gantry top (the camera looks under or over a shoulder instead of through anything).

## Acceptance criteria for this section

- Launches with the documented commands; no console errors on the tested route.
- After the opening, a first-time player can say who Mara is, where she is and what she wants.
  This needs a human tester.
- The objective is understood within the first minute without coaching. This needs a human
  tester: automated tests cannot establish it.
- Movement and interaction respond reliably. The camera never hides the hatch, the gap or the
  landing in a way that blocks progress.
- Both puzzles teach their rule, wrong states give readable feedback, and no state can trap the
  player.
- Falling recovers at a checkpoint without losing progress.
- A clear completion state with replay; restart gives a genuinely fresh run.

## Reporting format for reviews

Please put review findings in `docs/reviews/` (one file per tested commit), with: tested commit,
environment (OS, browser, GPU, resolution, quality setting), severity, reproduction steps,
expected vs actual, evidence, and acceptance criteria for the fix.

## Latest results

At commit `326114e`, on Windows 11 Pro with Node 22.13.1. Edge runs on the RTX 2050 through the
Windows setting.

- `npx vitest run`: **54/54** unit tests in 8 files.
- `PW_CHANNEL=msedge npm run test:e2e`: **62/62 passed in 9.3 min**:

  | Spec | Tests |
  | --- | ---: |
  | engine | 8 |
  | input | 11 |
  | jumps | 20 |
  | parkour | 13 |
  | slice | 8 |
  | story | 2 |

- Running jump measured at **3.39 m**, apex 1.38 m.
- Each commit on the branch type-checks.
- Not run at this commit: Playwright's bundled Chromium e2e suite (software rendering).
- Frame times and draw calls:
  [STATUS.md](STATUS.md#verification-this-pass).
