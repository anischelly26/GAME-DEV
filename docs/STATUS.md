# Status

| | |
| --- | --- |
| **Branch** | `claude/low-tide` (draft PR #7), stacked on `claude/toy-hero` (PR #6) → `claude/chapter-one-v2` (PR #5) → `claude/chapter-one-quality` (PR #4) → `claude/polish-4979589` (PR #3) → `claude/breathing-engine` (PR #2) → `claude/first-playable` (PR #1) |
| **Build** | Chapter One, *The Quiet Cell*: the workshop opening → pressure-hatch puzzle → maintenance shaft (the steam kicker) → lookout → the feed-pipe grind or the scaffold → parkour practice route → *The Breathing Engine* (now with the Watch) and the split feed → chapter ending; five hidden chalk marks. Chapter Two, *The Warders' Green*: the cove → Cottage Lane (stealth) → the green → the slide → the swing leap → the yard. Chapter Three, *The Low Tide*: the slipway → the swim → the skiff → the bar and the surge → the patrol boat → the lighthouse |
| **Reviews** | Codex reviewed `4979589` ([review](reviews/REVIEW-2026-10-15-4979589.md)) and `492bce4` ([review](reviews/REVIEW-2026-10-15-492bce4.md)). The work after `492bce4` (PRs #3 to #7) **has not been reviewed yet**. Codex's findings are preserved unchanged in those files. |

## Launch

```bash
npm install
npm run dev
```

Open http://localhost:5173, click **Begin**, then click the view to capture the mouse. The story
opening plays first (about 39 s; Space or E skips it). Chapter Two: the title screen's chapter
button, or http://localhost:5173/?chapter=2 (its opening is about 9 s); Chapter Three: ?chapter=3. Production build: `npm run build`, then
`npm run preview` (http://localhost:4173). Character viewer: http://localhost:5173/?viewer=mara.

**Dual-GPU laptops.** Windows runs browsers on the integrated GPU unless told otherwise.
Settings → System → Display → Graphics → Microsoft Edge (or Chrome) → **High performance** moves
the browser to the dedicated GPU. On the test laptop (Intel UHD plus NVIDIA RTX 2050), Edge now
runs on the RTX this way. The Intel measurements below use Playwright's bundled Chromium, which
that setting does not cover.

## Chapter Three, *The Low Tide* (`claude/low-tide`, draft PR #7)

Stacked on `claude/toy-hero` (PR #6). The coastal escape from the owner's 2026-10-16 brief:
swimming, a boat and the lighthouse. No person has played it yet.

| Item | Status | Notes |
| --- | --- | --- |
| Chapter Three, coastal escape | COMPLETED (first version) | The slipway, the swim, the steam skiff, the bar and the surge, the patrol boat, the lighthouse climb, opening and ending |
| Swimming | COMPLETED | A swim mode in the player controller (float, crawl stroke, climb out, kick up); works in any level with water |
| Boat | COMPLETED | The steam skiff: camera-relative steering, throttle, grounding on shallows, glancing off rocks, engine noise the Watch hears |
| Lighthouse (CC BY scan) up close | COMPLETED | Walkable stairs, landings and gallery added as colliders (the scan has none); the real organisation's sign is covered by a board and a lifebuoy |
| Chapter Four, arcade mystery | NOT STARTED | Needs an original arcade (the Minion Rush reference is blocked) |

### Also in this pass

- **Walking on slopes.** On a ramp, Mara's controller pressed into the ground at 2 m/s, which from a
  standstill outweighed the walk and slid her back: she could not start up a 34° ramp. On sloped
  ground she now follows the slope with a light press. This changes all chapters; the full suite
  below covers Chapters One and Two with it.
- **A natural rock surface** (Poly Haven "Dark Rock") for boulders and cliffs in Chapters Two and
  Three (the stone sets are walls and read as masonry on boulders).
- **`__THREE`** is exposed with the test API, for raycasts in probes.

### Verification (this pass)

Same machine and setup as below (Edge on the RTX 2050).

- **Edge e2e at `bba9f29`: 106/106 in 13.2 min** (one run): chapter3 6 (new), chapter2 12,
  stealth 6, and the 82 Chapter One tests, which now run with the slope change.
- **What the Chapter Three tests prove:** the autopilot swims from the slipway (over the sandbar) to
  the skiff and boards it; at low water the skiff runs aground on the bar and does not cross; on
  the surge it crosses; docking at the stairs, the three flights climb to the gallery (lower
  landing above 0.4 m, half landing above 2.4 m, gallery above 4.4 m) and the door ends the
  chapter; the patrol boat hears the engine, raises the alarm and its catch returns Mara to the
  lagoon checkpoint, aboard.
- **Unit tests 54/54. Production build passes.** The commit type-checks from a `git archive` copy.
- **Draw calls** (Low, `scripts/count-draws.mjs --chapter 3`): a mean of 121 over five checkpoints,
  190k to 244k triangles.
- **Not measured:** frame times and load time (Chapter Three loads the 3.8 MB lighthouse and
  the sand and rock textures).
- **The sign:** screenshots from the gallery and the lagoon show the board and lifebuoy over it and
  no legible text.
- **Screenshots:** [evidence/low-tide/](evidence/low-tide/).

### Known limitations (this pass)

- **Nobody has played it.** The surge's timing (a 3.6 s swell every 9 s) and the patrol's hearing
  are tuned by tests.
- **Under the lighthouse** the camera sees the scan's noisy underside (thin black fragments) while
  Mara climbs the lower flights.
- **The swim pose** is a tilted walk cycle with procedural arms; there is no swim animation clip.
- **The sea** is the same height everywhere (the surge raises all of it); there are no waves that
  move the skiff, only a bob.
- **Music** reuses Chapter One's hall theme.

## Toy hero, the Watch, Chapter Two (`claude/toy-hero`, draft PR #6)

The owner's request of 2026-10-16 (the "master development prompt") asked for four chapters, a
Minion as the player character, four specific Sketchfab models, guards with patrol, detection,
pursuit and hiding, and a report labelled COMPLETED / PARTIALLY IMPLEMENTED / BLOCKED / NOT
STARTED. This branch is stacked on `claude/chapter-one-v2` (PR #5). No person has played any of
it yet.

| Commit | What |
| --- | --- |
| `0462ffe` | Mara as a toy hero: an original stylised character (not a Minion: see Blocked), re-proportioned on the same skeleton, with a living face (blinks, looks, moods) |
| `00d22b7` | The Watch: a sentry automaton on the Breathing Engine's collar (stealth in Chapter One) |
| `97a527d` | Chapters (registry, per-chapter light and surfaces, chapter select, "Continue: Chapter Two"); the Watch on rails (any track, hearing, a tether); Chapter Two, *The Warders' Green*; the two CC BY models; a render safety pass |
| this commit | These documents |

### The toy hero (`0462ffe`)

At the owner's choice ("something between a Minion and an It Takes Two character"), Mara is an
original toy-like hero built in code on the same CC0 skeleton and clips: a big head with a living
face (eyes that blink, look about and follow points of interest; lids, brows and a mouth for
neutral, happy, surprised, worried and determined; she dozes off in the opening), a pear-shaped
ochre jacket with a belt and pouch, goggles pushed up on her hair, mittens and boots, the coral
scarf and the steam kicker. She is 1.40 m tall (the camera's pivot is lowered to match). The
opening's camera shots were re-framed for her. Measured pelvis heights: sitting 0.33 m, lying
0.13 m, standing 0.47 m (the story test checks all three). Viewer: `/?viewer=mara`.

### Report

| Item | Status | Notes |
| --- | --- | --- |
| Branch and PR | COMPLETED | `claude/toy-hero`, draft PR #6, stacked on PR #5; not merged |
| Player character | COMPLETED (as an original character) | Replacing Mara with a Minion is **BLOCKED** (Illumination's character; no rights). At the owner's choice Mara is now a toy-like original hero "between a Minion and an It Takes Two character" |
| Chapter One, prison escape | COMPLETED | Built earlier; this branch adds the Watch on the engine collar (patrol, detection, chase, return to patrol, hiding behind the column, ground-pound stun) |
| Chapter Two, abandoned playground | COMPLETED (first version, unplayed by a person) | *The Warders' Green*: cove, stealth lane, sunken playground, the slide (CC BY model, ridden), the swing leap, the yard, opening and ending |
| Chapter Three, coastal escape | NOT STARTED (asset ready) | Swimming, a boat and the lighthouse are not built. The lighthouse scan is optimised and already seen across the water in Chapter Two |
| Chapter Four, arcade mystery | NOT STARTED; reference asset BLOCKED | The Minion Rush arcade is a game rip; an original arcade is needed |
| Enemy AI | COMPLETED | Patrol on rails, a vision cone with line of sight, suspicion, alarm, pursuit (rail) or tether (off-rail), catch to checkpoint, search, return to patrol, hearing noise, hiding (walls, hedges, the engine column, tall grass, the pipe), ground-pound stun |
| Swimming | NOT STARTED | Chapter Three |
| Boat | NOT STARTED | Chapter Three |
| Model: Seven Foot Knoll Lighthouse (Katie Wolfe, CC BY 4.0) | COMPLETED (integrated as a distant landmark) | Plaza removed, 994k to 54k triangles, 58 MB to 3.8 MB; credited. Close-up use waits for Chapter Three (its real organisation's sign must be covered first) |
| Model: Abandoned children's slide (sergeilihandristov, CC BY 4.0) | COMPLETED | 13.4 MB to 0.7 MB, scaled 1.6x, ridden |
| Model: Minion Rush arcade | BLOCKED | A rip of a copyrighted game; a "CC BY" label on Sketchfab does not grant rights to it |
| Model: Minion Rush prison cutscene | BLOCKED | Same |

### Verification (this pass)

Environment: Windows 11 Pro, Intel UHD 0x46A3 and NVIDIA RTX 2050, Node 22.13.1, Edge on the RTX
(Windows graphics setting).

- **Unit tests: 54/54** (unchanged).
- **Edge e2e at `97a527d`: 99/100 in one run (24.4 min)**, and the one failure passes on its own
  (1/1). It was a test locator: the title screen gained a credits paragraph during the run, and
  the test was fixed then. Per spec:

  | Spec | Tests | Spec | Tests |
  | --- | ---: | --- | ---: |
  | chapter2 (new) | 12 | stealth (new) | 6 |
  | engine | 8 | moves | 6 |
  | input | 11 | audio | 1 |
  | jumps | 20 | sequence | 5 |
  | parkour | 13 | secrets | 5 |
  | slice | 8 | grind | 3 |
  | story | 2 | | |

  The Chapter Two tests take most of the time: each loads the chapter (about a minute per test in
  this run). `00d22b7` (the Watch) passed 88/88 on its own; `0462ffe` (the toy hero) passed 82/82.
- **What the Chapter Two tests prove** (deterministic stepping, input through the real pipeline):
  the autopilot plays cove → ledge → gardens → lane gate → green → slide → playground with no
  falls; a pumped swing's leap reaches the wall and a low one, or a double jump from the floor,
  does not; the slide and the ladder work; hedges hide Mara from the lane Watch and the open lane
  does not; the rim Watch hears the swing and spots her; tall grass and the pipe hide her; the
  ending completes; Chapter One is still the default and offers Chapter Two; the title screen
  switches chapters and credits the CC BY models.
- **Draw calls** (`node scripts/count-draws.mjs --channel msedge [--chapter 2]`, Low): Chapter
  One a mean of 515 per frame over its nine checkpoints (495 at PR #5: the Watch on the collar adds
  about 20); Chapter Two a mean of 223 over its five, about 300k triangles (most of it grass).
- **Not measured:** frame times and load time for Chapter Two (on either GPU). Chapter Two loads
  4.5 MB of models and 13 MB more textures than Chapter One.
- **Production build:** `npm run build` passes; each chapter is its own chunk.
- **Each commit type-checks** (built from a `git archive` copy).
- **Screenshots:** [evidence/toy-hero/](evidence/toy-hero/): the toy hero (viewer and in game),
  the Watch in Chapter One, and Chapter Two from the opening to the ending.

### Known limitations (this pass)

- **No person has played Chapter Two.** Its difficulty (the lane crossing, the swing's timing
  with the rim Watch) is tuned by tests, not by players.
- **Swing pose.** Mara sits and leans with the chains, but her hands do not hold them (no IK).
- **Ladder.** A scripted climb with the climbing clip looped; her hands do not meet the rungs.
- **Distant pieces.** Breakwater across the water is a few lit blocks; the hangar is Chapter One's
  distant set piece, seen closer here than it was designed for.
- **No new music.** Chapter Two reuses the title theme and the waves; no one has listened to it.
- **Chapter Two's grass** is 9,000 instanced tufts; its cost on the Intel GPU is not measured.
- **The Watch** is rail-bound by design; it cannot leave its rail to chase.

### Areas for independent review (Codex)

1. **The Watch's fairness**: suspicion times, the 0.35 s grab beat, the tether at 0.9 s, the
   hedge cover in the lane, the swing noise radius.
2. **Chapter Two's skips**: anything that reaches the fallen wall without the swing, or the green
   without the lane gate.
3. **The chapter plumbing**: loading Chapter Two directly, from the title screen, and from Chapter
   One's completion card; settings carry over.
4. **The CC BY credits**: title screen, ASSETS.md and the files' `asset.extras`.

## Chapter One v2 (`claude/chapter-one-v2`, draft PR #5)

The owner asked, overnight, for Chapter One at "It Takes Two quality" in movement, camera,
character, maps, sound, story, intro, puzzles and missions. It Takes Two is the bar for feel and
polish, not a source: nothing here copies its characters, levels, story, dialogue, assets or
gadgets (double jump, dash, ground pound and grinding are genre-standard verbs). The plan this
pass followed, written before starting, is [plans/OVERNIGHT_BRIEF.md](plans/OVERNIGHT_BRIEF.md).
No person has played any of it yet.

| Commit | What |
| --- | --- |
| `e9ffa7b` | Movement 2.0: a ground dash and sprint; Ivo's steam kicker, found in the shaft, adds a double jump with a flip, an air dash and a ground pound, worn as a brass canister with a gauge |
| `cb24a4e` | Real sound: CC0 samples (surface footsteps, cloth, landings, metal), CC0 music and ambience beds that follow the story, a music volume setting |
| `3b85f6c` | The opening, in the engine: Mara's workshop the night before, then the cell; captions and letterbox |
| `a957412` | The shortcuts the new moves opened, closed (see below) |
| `b890fd6` | 390 of 646 meshes drew black (no vertex colours on the shared materials): fixed |
| `2dc8e72` | Secrets and toys: five chalk marks, boards to slam, a cell with bent bars, a steam whistle, area titles |
| `60173c8` | The feed-pipe grind down into the hall; a fall-speed bug against walls |
| `fbd8578` | Mara kneels at the low valve and folds her arms when idle; controls updated |
| `6b3523c` | Edge cases: a teleport mid-grind; a respawn mid-opening |
| `3e1b230` | Performance: hidden props' shaders compiled at load (a 0.5 s freeze when the kicker first appeared); new props merged |

### Before and after, as a player

- **Opening.** Before: three text cards on black, then the cell. Now: a letterboxed scene in Mara's
  workshop in Saltmere (rain on the window, the diversion plans circled and crossed out in red, her
  fighting sleep, a figure stopping at the window, the lamp going out), lower-third captions, then
  the cell. About 39 s; Space or E skips it.
- **Moves.** Before: run, jump, vault, ledge catch. Now also a dash (a roll) and sprint from the
  start, and, once Mara picks up the steam kicker in the shaft, a double jump with a flip, an air
  dash that holds height, and a ground pound. An ability card explains them the moment she gets
  it. Each move has its own animation, sound, puff of steam or dust, and a small camera kick.
- **Into the hall.** Before: two drops by a scaffold. Now also a broken brass feed pipe from the
  lookout: step onto it and Mara grinds it about 20 m round in front of the engine, sparks off the
  pipe, the camera standing back, and lands on tier one. The scaffold still works.
- **Secrets.** Five chalk "IV" marks hidden off the path (one needs the double jump, one is under
  boards only a ground pound breaks, one is in a cell whose bars someone bent open), a steam
  whistle to pull, and area titles for each space. The end card counts the marks.
- **Sound.** Before: synthesised placeholders. Now recorded footsteps that change with stone,
  metal and wood, cloth and landings, and music that moves with the story: the title theme, the
  workshop, a quiet cell, a driving hall, a swelling ending.
- **It looks like it was meant to.** A third of the props, including the hatch, every pipe and
  gauge, and the tide engine's gear and pillars, drew black. They now show their brass, iron and
  wood. Before and after: [evidence/chapter-one-v2/](evidence/chapter-one-v2/) (06, 07).
- **No shortcuts.** The new moves reach about 2.6 m up and well over 5 m across. Probed with the
  real controller: a double jump from the breach checkpoint landed on the exit gantry, skipping the
  split-feed puzzle; walking left from the scaffold went round tier one to the engine, skipping
  sides 2 to 6; walking tier three back round and jumping the breach landed on the exit. Fixed:
  the exit gantry and the ram's stroke are now 3.4 m; collapsed floor closes each tier the other
  way. The steam curtain and the lookout's rope gate were also raised as precautions (they held
  on the old code too).

### Controls (new in this pass)

| Action | Keyboard | Gamepad |
| --- | --- | --- |
| Dash (a roll); hold to sprint | Shift | B |
| Double jump, air dash (after the kicker) | Space / Shift in the air | A / B in the air |
| Ground pound (after the kicker) | Ctrl in the air | RB or RT |
| Grind | Land on a pipe; Space jumps off | A jumps off |

Settings gained a music volume. Gamepad B is no longer an alternate interact (it dashes).

### Verification (this pass)

Environment as below: Windows 11 Pro, Intel UHD 0x46A3 and NVIDIA RTX 2050, Node 22.13.1. Edge
runs on the RTX; Playwright's bundled Chromium runs on the Intel GPU.

- **Unit tests: 54/54.**
- **Edge e2e: 82/82** at `3e1b230`:

  | Spec | Tests | Spec | Tests |
  | --- | ---: | --- | ---: |
  | engine | 8 | moves | 6 |
  | input | 11 | audio | 1 |
  | jumps | 20 | sequence | 5 |
  | parkour | 13 | secrets | 5 |
  | slice | 8 | grind | 3 |
  | story | 2 | | |

  `sequence.spec.ts` tries every shortcut above with the real controller; without the fixes its
  ring and exit tests fail (3 of 5).
- **Frame times.** Production build, headed, the real-time loop, the scripted full route through
  the input pipeline, 1280×720, Low, fresh browsers (`scripts/trace-stalls.mjs`). Both builds were
  measured in the same session:

  | GPU (browser) | Build | Runs | Mean frame | p95 | Worst frame |
  | --- | --- | ---: | ---: | ---: | ---: |
  | Intel UHD (bundled Chromium) | PR #4 head `485f635` | 3 | 21.0–21.6 ms (≈47 FPS) | 33.4–33.5 ms | 116–946 ms |
  | Intel UHD (bundled Chromium) | this pass `3e1b230` | 3 | 21.3–22.1 ms (≈46 FPS) | 33.5 ms | 83–1047 ms |
  | RTX 2050 (Edge) | both, Low | 1–2 | 16.6 ms (60 FPS) | 16.8 ms | 33 ms |
  | RTX 2050 (Edge) | this pass, High | 2 | 17.0–17.2 ms | 16.8–16.9 ms | 50 ms |

  - The RTX numbers are held at the display's 60 Hz in this session for both builds, so they show
    that each holds 60 FPS, not the headroom. PR #4's 7.3 ms was measured uncapped.
  - Worst frames: before `3e1b230`, 2 of 3 Intel runs froze for 0.5 s at the landing, where the
    canister's shader linked on first sight. After, the worst frames are 83 ms and 133 ms in two
    runs.
  - In the third run, one frame took 1,047 ms at the cell with no WebGL work inside it (no shader,
    texture or buffer). PR #4's build had the same kind of frame (946 ms, on tier one), so it is
    not new, but its cause is not identified.
  - Earlier measurements in this pass, before the last fixes, are in the commit messages.
- **Load time** to the title screen, Intel GPU, bundled Chromium, 3 runs each: 20.5–21.2 s (PR
  #4's build: 20.9–26.1 s), measured before `3e1b230`'s merges.
- **Draw calls** (`scripts/count-draws.mjs`): a mean of 495 per frame over the nine checkpoints,
  against 458 at PR #4.
- **Each commit type-checks** (each built from a `git archive` copy).
- **Screenshots:** [evidence/chapter-one-v2/](evidence/chapter-one-v2/).
- **Local only (not committed):** a showcase recording in `artifacts/showcase/`
  (`scripts/capture-showcase.mjs`): the opening, moves, the grind, the boards and the whistle. It
  is automated, scripted input on a real-time loop.

### Known limitations (this pass)

- **No person has played it**, and no one has listened to it. The music beds were chosen from
  their descriptions and checked only for loading and looping; the rain, the whistle and the grind
  are synthesised and unheard.
- **The workshop pose.** Mara sits upright and droops her head; she does not lay her head on the
  plans (no such clip).
- **The shuttle's 5 m collapse can be jumped** with a sprint, double jump and air dash. That is
  allowed on purpose: it is a ride, not a puzzle.
- **One pipe to grind**, and nothing else uses the ground pound yet besides the boards.
- **Chains have no colliders**, so the camera can pass through the hanging chains in the hall.
- **Not 60 FPS on Intel UHD**: about 46 FPS on Low in bundled Chromium.
- Earlier limitations still apply: no IK on ledges, the hall is dark in places, the load takes
  about 20 s on the Intel GPU.

### Areas for independent review (Codex)

1. **Movement 2.0 and the reach audit.** Are there gates I missed that the double jump or air
   dash can skip? The probes in `tests/e2e/sequence.spec.ts` cover the ones I found.
2. **The opening.** Is 39 s too long? Does the story read without the old cards (the plans, the
   figure, the lamp)?
3. **The grind.** The camera behaviour while riding, the catch radius (0.5 m), and whether the
   pipe's start is discoverable.
4. **Secrets.** Are the marks findable but not obvious? Is the boards' hint fair?
5. **The colour fix** (`b890fd6`) changes how a third of the props look. Check that nothing is
   now too bright or wrong.
6. **The warm-up change** (`3e1b230`): drawing hidden props once at load.

## Chapter One quality pass (`claude/chapter-one-quality`, draft PR #4)

The owner's brief: make Chapter One feel designed and readable from the first second. Priorities,
in order:

1. camera confidence and movement feel;
2. map composition and traversal readability;
3. the cell → machinery → escape flow;
4. physical puzzle feedback;
5. animation, lighting, sound and environmental storytelling;
6. performance on Intel UHD.

The player-experience audit is in [CHAPTER_ONE_AUDIT.md](CHAPTER_ONE_AUDIT.md). Commits:

| Commit | What |
| --- | --- |
| `201f0d1` | Camera rewrite and settings, movement feel, subtitle queue, hints, the shaft railing, keyboard jump tests |
| `ca247c6` | Framing in tight spots, cell-opening colliders, flow chevrons on both puzzles, the transfer order, the hangar ending |
| `588df83` | Head turns, heavier landings, dust through the cell wall; small casters off the shadow pass on Low, merged set pieces, warm-up draw |
| `326114e` | Over-the-shoulder arm shift, camera-only blockers on the flywheels |
| docs commit | This file, the audit, TESTING, GAME_DESIGN, README, ASSETS, screenshots |

### Before and after, as a player

- **Before:**
  - The camera turned by itself mid-jump, and turning it mid-jump bent the jump.
  - It collapsed into Mara on ledges and in doorways, slipped behind machinery or into cell
    recesses, and ran under a black roof on tier three.
  - The first running jump in the shaft carried Mara into the channel.
  - Subtitles arrived two rooms late, and tutorial text explained the controls.
  - The puzzles' cause and effect was only on gauges.
  - The ending was a menu over a dark sea.
- **After:**
  - The camera obeys the mouse at once. It follows on its own only on the ground when running
    forward, and never near a jump. Rotating it mid-jump keeps the jump's line.
  - It looks under lintels and over a shoulder instead of through things.
  - The shaft has a railing and a lit crossing, so the practice jump and the real one are two
    deliberate beats.
  - Lines arrive when they matter. Hints appear only if the player hesitates.
  - Amber chevrons on the pipes show where the pressure goes.
  - The cell door explains why Mara is there and who expected her.
  - The escape ends looking at a lit seaplane hangar the intercom has just pointed to, with
    "Chapter One complete" laid over that view.

### Controls and settings

Controls are unchanged: WASD or the left stick to move; the mouse or right stick to look; Space or
A to jump (hold for higher; at a run, Space vaults low obstacles); E or X to interact; C to
recenter; Esc to pause; Space or E to skip a cinematic.

The camera settings, with ranges and defaults, are in the [README](../README.md#controls).

### Verification (this pass)

Environment: Windows 11 Pro, Intel Core i7-12650H, Intel UHD 0x46A3 and NVIDIA RTX 2050, Node
22.13.1. Edge runs on the RTX via the Windows setting; Playwright's bundled Chromium runs on the
Intel GPU.

- **Unit tests: 54/54.** These cover every camera-assist condition, the spring arm, framing, the
  subtitle queue and the settings migration.
- **Edge e2e: 62/62 in 9.3 min**, at the code of `326114e`. This includes 20 real-keyboard jump
  cases: every route jump with the camera still and with the camera rotating. Without the
  airborne yaw latch, 6 of the 10 rotating cases fail, bending 6.5–8°.
- **Running jump: 3.39 m**, apex 1.38 m (unchanged).
- **Frame times.** Production build, headed, normal real-time loop, scripted route through the
  input pipeline, 1280×720, Low unless noted (`scripts/trace-stalls.mjs`):

  | GPU (browser) | Build | Runs | Mean frame | p95 | Worst frame |
  | --- | --- | ---: | ---: | ---: | ---: |
  | Intel UHD (bundled Chromium) | PR #3 head `2cb6520` | 2, back to back | 24.3–24.7 ms (≈41 FPS) | 35.1–41.4 ms | 118–388 ms |
  | Intel UHD (bundled Chromium) | this pass | 3, fresh browsers | 23.9–24.9 ms (≈41 FPS) | 35.0–41.5 ms | 97–291 ms |
  | RTX 2050 (Edge) | this pass, Low | 1 | 7.3 ms (≈137 FPS) | 7.2 ms | 28 ms |
  | RTX 2050 (Edge) | this pass, High | 1 | 15.4 ms (≈65 FPS) | 27.6 ms | 49 ms |

  This pass adds the hangar, the flow strips and three camera casts per frame at no net
  frame-rate cost on the Intel GPU. The shadow-pass cut and the merges paid for them.
  - Draw calls (`scripts/count-draws.mjs`): a mean of 466 per frame over the nine checkpoints,
    against 614 at `2cb6520`.
  - Earlier in this pass, before the cut, the Intel mean had risen to 30–36 ms.
  - Edge on the Intel GPU measured 20.4 ms in PR #3. Bundled Chromium is slower on the same GPU,
    so its numbers are compared only with each other.
- **Screenshots:** [evidence/chapter-one-quality/](evidence/chapter-one-quality/) (cell,
  transfer order, shaft, lookout, tier one, collar, both puzzle states, the ending sequence).

### Known limitations (this pass)

- **No person has played it.** Story comprehension, whether hints come at the right time, the
  feel of the camera assist and the new acceleration, and puzzle satisfaction are all untested.
- **Animation.** The hands are not placed on ledges (no IK), and there is no wind-up before a
  jump: control is never delayed for one.
- **Camera artifacts in the autopilot audit.** The autopilot never turns the camera, which leaves
  two cramped moments: the deck lever beside the engine column, and about 2 s after dropping off
  the gantry. See the audit.
- **Not built:** the "opening shutters" from the brief. The shaft's guidance is light, a railing
  and a lit crossing.
- **Sound** is still synthesised placeholder; the flow strips are silent.
- **The hall is dark in places.** No real-time lights were added, deliberately, for the Intel GPU.
- **Not 60 FPS on Intel UHD:** about 41 FPS in bundled Chromium, and 49 in Edge at PR #3.
- **Load** still takes about 20 s on the Intel GPU (shader compilation).

### Areas for independent review (Codex)

1. **Camera.** Does the assist ever surprise? Look at the precision volumes, the shoulder shift
   and the lower-arm search in cramped spots (the shaft exit, the gantry, the collar). Check that
   rotating the mouse mid-jump now keeps the line, with a real mouse.
2. **Shaft.** Does the railing plus the lit crossing read without text? Does anyone still fall in?
3. **Subtitles.** Do any important lines get dropped (remark expiry), or arrive late?
4. **Puzzles.** Do the chevrons make the vent/piston and vent/ram choices obvious, or too obvious?
5. **Ending.** Is the hangar reveal clear, and is the completion card a reward?
6. **Performance.** Re-run the normal-loop benchmark on the Intel GPU, with `&intro=0`, or with the
   opening skipped. Check the worst frames after the warm-up draw.

## Since `492bce4` (PR #3)

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

1. Uncoached first-time playtests of Chapters One and Two (the Watch's fairness, the swing).
2. Codex's review of PRs #3 to #6.
3. Chapter Four (the owner's arcade mystery, in an original arcade). The camera settings the earlier Chapter Two prompt
   asked for (separate sensitivities, inverts, chase assist, shake, FOV) are already in the
   settings menu (PR #4).

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
