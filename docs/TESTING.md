# Testing: Chapters One to Three, and the movement lab

## Automated checks

| Command | What it checks |
| --- | --- |
| `npm run typecheck` | TypeScript strict type-check |
| `npm test` | Unit tests (Vitest): puzzle rules (pressure hatch, split feed), progression/checkpoints/triggers, level dimensions vs movement capability, traversal eligibility against a real Rapier world, every camera-assist condition, the spring arm and framing (including the fall framing and the per-mode framing), the subtitle queue, the settings migration, and game feel (`feel.test.ts`: air poses, landing tiers, the squash-and-stretch spring) |
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

1. **Watched.** Mara starts sitting at her bench in the workshop (far from the prison; pelvis
   0.3–0.8 m above her feet), control locked, letterboxed, the first caption ("Saltmere…") on
   screen, no objective, the skip prompt visible. Every caption appears (the tide engines, the
   flood diversion, staying up to prove it wrong, "She woke up somewhere else.", the chapter
   title), she is seen lying on the cell floor after the cut (pelvis under 0.35 m), and Mara's
   lines play. Control returns after 37–41 s with the objective "Open the service hatch", the cell
   checkpoint, the camera released, the captions and letterbox gone, Mara standing, and the
   workshop struck: hidden, the cell lamp's light back in its fixture, the sky light restored.
2. **Skipped.** Space half a second in (in the workshop) gives the same end state at once, at the
   cell spawn. The skip press neither jumps nor moves her, skipped narration is not queued, and
   the gameplay line ("Fresh copper…") plays exactly once.

### `tests/e2e/moves.spec.ts`: dash, sprint and the steam kicker (6)

Before the kit there is no double jump or air dash, and picking it up enables them. The ground dash
covers its distance; holding it sprints. The double jump adds height once per airtime and refills on
landing. The air dash is a horizontal burst that holds height, once per airtime. The ground pound
hovers, slams at speed and reports where it landed, but not right above the floor.

### `tests/e2e/audio.spec.ts`: sound wiring (1)

A real click unlocks audio; the samples load; every music and ambience bed decodes (and the
workshop's generated rain is an 8 s loop); the title, cell and hall themes follow the place.

### `tests/e2e/sequence.spec.ts`: no shortcuts past the route (5)

Each test tries a shortcut with the real controller (run, jump, double jump, air dash) and checks
that it fails: walking tier one the long way round (from the scaffold, and past the engine); walking
tier three back round to the far side of the breach; reaching the exit gantry without riding the ram
(from two spots, with double jump, double jump + dash, dash + double jump); jumping over the steam
curtain; clearing the lookout's rope gate before the reveal. Without the fixes in `a957412` the
first three fail.

### `tests/e2e/secrets.spec.ts`: secrets and toys (5)

The cell, lookout and bent-bar cell marks are found by going to them (not from the spawn or the way
in); the bent-bar cell is walked into on its own floor. The shelf mark: a single jump lands back on
the landing, a double jump lands on the shelf. The boards: standing and jumping on them does
nothing (Mara notices them), a ground pound breaks them and the mark beneath is found. The whistle
blows, ignores a second pull while blowing, and the third pull gets the Watch's line. Area titles,
the end card's mark count ("2/5"), and "Restart section" puts every secret back.

### `tests/e2e/grind.spec.ts`: the feed pipe (3)

Walking off the lookout onto the pipe rides it (2–4.5 s) and lands Mara on the tier-one walkway at
side 1, short of the gap, with the camera standing back while she rides. A jump leaves the pipe with
height and the kicker refilled. Stepping off the left of the gate takes the scaffold way down.

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

### `tests/e2e/stealth.spec.ts`: the Watch on the engine collar (6)

With `?watch=1` (the Watch is off in other automated runs).

- Off by default in automated runs: no sentry, no collider.
- It patrols the deck, sees Mara 2.5 m ahead in its lamp, fills its suspicion over 0.6 to 1.5 s
  (measured from the first "?"), raises the alarm (sound, "Inmate out of bounds. Halt!"), grabs her
  and returns her to the engine gantry; a catch is not a fall.
- The engine column blocks its sight (a point 120° round the ring is in its cone but hidden); a
  point straight behind it is outside the cone.
- A ground pound beside it knocks it out; standing in front of it for three seconds raises no
  suspicion; about six seconds later it comes round and notices her.
- Out of sight long enough, it searches and goes back to its round.
- Boarding behind it as it passes and riding the collar up: not caught.

### `tests/e2e/chapter2.spec.ts`: Chapter Two (12)

- Loads at dawn (`?chapter=2`) with its own checkpoints and objective, the slide model loaded, no
  errors.
- The autopilot route: the cove wall (ledge catch and climb), the west front gardens, the lane
  gate, the green, onto the slide's platform and down the chute into the playground; no falls.
- The slide: onto the chute from the platform, a ride, a hop off the end onto the playground floor.
- The swing: pumped past 1.1 rad, a leap at the top of a forward swing catches the fallen sea wall
  (wall checkpoint). From a 0.35 rad swing the leap falls short, and so does a double jump from
  the floor right under the wall (the wall cannot be reached without the swing).
- The ladder back up to the slide's platform.
- With `?watch=1`: the lane Watch passes Mara behind a hedge without any suspicion, and catches
  her in the open lane (back at the lane checkpoint); the rim Watch hears the swing, comes to look
  and raises the alarm on seeing her; tall grass and the concrete pipe hide her.
- The ending: across the yard to the causeway gate completes the chapter; no "next chapter"
  button yet.
- Chapter One is still the default, and its completion card offers "Continue: Chapter Two".
- The title screen (normal mode) lists the other chapter, goes there, and credits the CC BY
  models.

### `tests/e2e/chapter3.spec.ts`: Chapter Three (6)

- Loads (`?chapter=3`) with its checkpoints and objective and the lighthouse scan; no errors.
- The autopilot walks down the slipway, swims, crosses the sandbar, swims to the skiff and boards
  it; it swam at least once; no falls.
- The bar: at low water the skiff runs aground on it (a bump, still outside); from the bar
  checkpoint, waiting for the surge and going, it crosses into the lagoon.
- Docking at the lighthouse's stairs (Interact), climbing the three flights (lower landing,
  half landing, gallery) to the door ends the chapter.
- With `?watch=1`: the patrol boat hears the engine, raises the alarm, and the catch puts Mara back
  at the lagoon checkpoint, aboard the skiff.
- Chapter Two's completion card offers "Continue: Chapter Three".

### `tests/e2e/feel.spec.ts`: game feel and the movement lab (9)

The movement lab is `?lab=1` (docs/MOVEMENT_2_0.md, B7). The Watch is not in it; the chapter
checks in this spec only read the ground under Mara, so they run without `?watch=1`.

- The lab loads with its one checkpoint; no errors.
- A standing jump: the take-off stretches her above 1.06 of her height; the arms come up once she
  falls; an ordinary jump never windmills; the landing squashes her below 0.98; she is back to
  her normal shape within half a second.
- The 10 m drop off the ramp tower: the arms windmill (above 0.5), the camera's view tips more
  than 0.1 rad further down during the fall, the landing squashes her below 0.85, no fall
  respawn, landing impact above 20 m/s.
- Jumping under the low beam fires one head bump and stops her rise at the beam; the same jump
  in the open fires none.
- Footsteps by material: each of the seven lab pads (stone, metal, wood, grass, gravel, sand,
  shallow water); Chapter Two's cove (gravel), lane (gravel), lawn (grass) and yard (stone);
  Chapter Three's slipway (stone) and the first sandbar (sand).
- Swimming in the lab pool uses the swim clips: treading water at rest (weight above 0.7, no walk
  cycle), the crawl when moving (above 0.7).
- Aboard the skiff in Chapter Three she plays the driving clip.
- The pound plate registers a ground pound.
- A scripted lap of the lab through the real input pipeline (the autopilot): the four gaps (the
  3.3 m one with the double jump), two vaults, the 34° ramps up the tower and the 10 m drop off
  it; no falls.

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
| `node scripts/capture-feel.mjs --channel msedge` | The game-feel pass in the lab, exact frames read back from the canvas (no HUD): take-off stretch, apex, falling arms, landing squash, the 10 m fall and its landing, the head bump, treading water, swimming; and the skiff in Chapter Three. Default output `docs/evidence/game-feel/` |
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
| `node scripts/measure-frames.mjs --chapter 1 --quality low --uncapped 1` (`--channel chromium` for the Intel GPU; `--lab 1` for the movement lab) | Frame times at every checkpoint with the camera turning slowly (1.5 s to settle, then `--seconds`, default 6): mean, p95 and worst frame, JS heap, geometries and textures, the GPU. `--uncapped 1` turns vsync and the frame-rate limit off, so the times show a frame's cost rather than the display's refresh rate. One JSON line per run |
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

## Unreal Engine: The Stormworks Escape

The Unreal sequence (see [UNREAL_STORMWORKS.md](UNREAL_STORMWORKS.md)) has its own scripted
self-test, run in the rendered standalone game:

```
powershell -File tools/unreal/run_selftest.ps1                          # 62 checks, ~2 min
powershell -File tools/unreal/run_selftest.ps1 -ExecCmds "r.VolumetricFog 0"   # A/B a console variable
powershell -File tools/unreal/run_selftest.ps1 -Clip; python tools/unreal/make_clip.py --group opening   # or --group climax
```

Results: `<Project>/Saved/StormworksSelfTest/results.txt` (also printed), screenshots 01–14 beside
it. The bot drives Mara with movement input and control rotation, fires the tether with
`TryFire()`, interacts with `TryInteract()`, skips cinematics with `Skip()`, and presses restart
through the Enhanced Input action; hardware input is ignored during the run. It covers:
- a normal start, the full route, a missed jump and recovery, a fall during the climax;
- repeated interactions, and leaving and returning to an interaction;
- the toy, the washing, the chimes;
- every way a cinematic can end: by itself, skipped at the start, middle and end, and cancelled by
  a restart;
- footsteps by surface, and the live audio loops;
- restarting from a checkpoint, and reaching the end without getting stuck.

It is not a playtest: nobody has played the sequence by hand or listened to it yet.

**Manual check (about 3 minutes), for the first person to play it:**

1. Play `/Game/ItTakesOne/Maps/Stormworks`. The window should frame the lighthouse beam.
2. Walk into the glowing canister on the bench, aim at the door crate's ring, press E. The crate
   should slide aside. Press E again to bring it back, then once more.
3. In the gallery, aim at the far ring from the edge. It should say "Too far". Pull the cargo crate,
   climb onto it, and tether across.
4. Walk off the gallery into the sea. You should come back at the far-gallery checkpoint, with
   the crate still where you left it.
5. Pull the coupling. On the catwalk, keep moving: tether, jump, tether. Fall once on purpose:
   the catwalk should be whole again.
6. On the roof, read the note (E), close it, press R.
7. Listen: footsteps on stone, wood (the crate) and metal (the catwalk); the tether's click, catch
   and tension; the chimes; the music changing at the gallery, after the engine reveal and on the
   roof. Skip one cinematic early and let one finish.
8. Report anything confusing or stuck, with the checkpoint name shown on screen.

## Unreal Engine: the house under Knoll Rock

The house slice (see [UNREAL_HOUSE.md](UNREAL_HOUSE.md)) has its own bot, started by a command-line
switch. The runner above is for Stormworks only. From Git Bash, set `MSYS_NO_PATHCONV=1` first, or
the map path is rewritten into a Windows path:

```
UnrealEditor.exe unreal/ItTakesOne.uproject /Game/ItTakesOne/Maps/House -game -windowed -ResX=1280 -ResY=720 -HouseSelfTest -log -nosplash
```

Results: `unreal/Saved/HouseSelfTest/results.txt`, same format as Stormworks, with screenshots 01–16
beside it. The bot:

- plays with real keys through the input mappings: W to walk and swim, E to interact, A, D and W to
  steer, Space and C to swim up and down (the camera is set directly, standing in for the mouse);
- walks the route, looks at each detail and inspects the gauge;
- watches the theft, looks at the tentacle and away, and chases it to the teacup and the lamp;
- waits out the searchlight, then lets the grab's cinematic play to its end, or skips it with Space
  when started with `-HouseSkipGrab`;
- steers the tow right, left down the steep shaft, and up, then swims to Nacre and takes the gauge;
- checks how Mara's body lies (head leading her travel, the bubble on her head).

Other switches:
- `-StormChainTest` on the Stormworks map goes straight on to the house by the real level change;
- `-HouseRecordAudio` writes what the game outputs to `output.wav`, which
  `tools/unreal/measure_audio.py` measures (levels only: it cannot say what sounds good).

It is not a playtest.

**Manual check (about 5 minutes):**

1. Play `/Game/ItTakesOne/Maps/House`. Walk up the jetty and in. Does the storm drop away at the
   door?
2. Find the three details (kettle, height marks, glass). Does each play when you look at it?
3. E on the gauge, walk off. When the tentacle takes it, look straight at it: does it freeze? Look
   away and follow it.
4. When the searchlight comes, watch the tentacle: flat and deep blue. Let the grab play once.
5. Steer the tow into the floating doors on purpose. You should be knocked aside, never stopped.
6. Swim to the gauge (Space up, C down), press E. Listen for the three taps.

## Latest results

**The packaged game (Unreal, 2026-11-01):** from the extracted Windows zip, 67/67 Stormworks and 37/37
house checks in one continuous run, mean frame 22.5 ms at 1600×900 on the RTX 2050 laptop. The bot now
uses real keys. A first packaged run failed one check, which found the washing line missing from
cooked builds; fixed, see [HOUSE_REPAIR_PASS.md](HOUSE_REPAIR_PASS.md).

The first runs found two real problems, both fixed:
- **A soft-lock:** the tentacle froze whenever it was looked at, including mid-snatch and in front
  of the camera, so it could stall forever. Now it does not freeze during the snatch. Stared at for
  5 s, it flushes coral and slips on.
- **A lost results file:** the bot's results file kept only its first line. It now keeps one writer
  open for the whole run.

The bot was also fixed to look away from the tentacle, not at the door. The same day, the Stormworks
runner on the in-repo project passed 67/67; the extra check is the real Space key making her jump.
Nobody has played the house slice by hand.

**The Stormworks Escape, second pass (Unreal, 2026-10-25):** 62/62 self-test checks with the final
code. In earlier runs of this pass, two failures were real bugs, found and fixed: a carry ended by a
long frame left her in mid-air, and Mara's materials drew as the default checker. Two failures were
outside the game: a stray click skipped the opening (hardware input is now ignored), and the
audio-loop check had a wrong filter. No GPU crash. The web game's tests were not rerun: no web code
changed.

**The Stormworks Escape, first pass (Unreal, 2026-10-24):** with the committed game code, six runs: 40/40 in
four; in the other two, one self-test timing check failed each time (a screenshot hitch next to the
check; both checks fixed, then 40/40). With Virtual Shadow Maps on, 2 of 9 launches ended in a GPU
crash before the route started; with regular shadow maps (now the project setting), 0 of 13 (see
UNREAL_STORMWORKS.md). The web game's tests were not rerun in this pass: no web code changed.

At commit `b3f907d` (game feel, Phase B of the overhaul), same machine: **115/115 Edge e2e in
13.3 min** (one run; the new `feel.spec.ts` is 9 of them), unit tests **68/68** (14 new: 11 in
`feel.test.ts`, 3 camera framing). The baseline before any change, at `f95f398`: e2e 106/106 in
17.1 min, unit 54/54. The game-feel checks alone:
`PW_CHANNEL=msedge npx playwright test tests/e2e/feel.spec.ts`.

### Earlier: Chapter Three

At commit `bba9f29` (Chapter Three), same machine: **106/106 Edge e2e in 13.2 min**, unit tests
54/54. Chapter Three's checks alone:
`PW_CHANNEL=msedge npx playwright test tests/e2e/chapter3.spec.ts`.

### Earlier: Chapter Two

At commit `97a527d` (toy hero, the Watch, Chapter Two), same machine: **99/100 Edge e2e in one
run (24.4 min)**; the one failure, a test locator fixed during the run, passes on its own (1/1).
Unit tests 54/54. Per-spec counts and draw calls: [STATUS.md](STATUS.md#verification-this-pass).
Run Chapter Two's checks alone with
`PW_CHANNEL=msedge npx playwright test tests/e2e/chapter2.spec.ts tests/e2e/stealth.spec.ts`.

### Earlier: Chapter One v2

At commit `3e1b230` (Chapter One v2), on Windows 11 Pro with Node 22.13.1. Edge runs on the RTX
2050 through the Windows setting.

- `npx vitest run`: **54/54** unit tests in 8 files.
- `PW_CHANNEL=msedge npm run test:e2e`: **82/82 passed in 7.2 min**:

  | Spec | Tests | Spec | Tests |
  | --- | ---: | --- | ---: |
  | engine | 8 | moves | 6 |
  | input | 11 | audio | 1 |
  | jumps | 20 | sequence | 5 |
  | parkour | 13 | secrets | 5 |
  | slice | 8 | grind | 3 |
  | story | 2 | | |

- Running jump measured at **3.39 m**, apex 1.38 m.
- Each commit on the branch type-checks (each built from a `git archive` copy).
- Not run at this commit: Playwright's bundled Chromium e2e suite (software rendering).
- Frame times, load time and draw calls:
  [STATUS.md](STATUS.md#verification-this-pass).
- `node scripts/capture-showcase.mjs` records a short real-time showcase (WebM, local, in
  `artifacts/showcase/`): the opening, the moves, the grind, the boards and the whistle.
