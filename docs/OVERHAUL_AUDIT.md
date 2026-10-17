# Overhaul audit: why it feels simple, and what to fix first

**Pass:** 2026-10-17, for the owner's brief "IT TAKES ONE — THE CINEMATIC ADVENTURE OVERHAUL", at
`f95f398` (the head of `claude/low-tide`, PR #7). Plans built on it:
[IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md).

**Method.**

- Read the code that decides how the game feels: the camera (`ThirdPersonCamera.ts`), the
  avatar's animation (`PlayerAvatar.ts`), the clip table (`tools/maraAssemble.ts`), the landing,
  footstep and sound hooks (`Game.ts`, `Audio.ts`), and each chapter's opening and ending.
- Checked which CC0 clips exist in the cached animation libraries but are unused.
- Ran the full suites before changing anything: **unit 54/54, e2e 106/106 in Edge (17.1 min)**.
- Measured frame times at every checkpoint of the three chapters (below).

**Limits.** No person has played any of the three chapters. Everything about fun, comprehension and
feel here is a judgement from the code, screenshots and tests, not a playtest. "Confirmed" means
confirmed in code or by measurement, not by players.

## Confirmed problems, by player impact

| # | Impact | Problem | Where | Evidence |
| ---: | --- | --- | --- | --- |
| 1 | High | **One airborne pose for the whole jump.** Rising, the apex and falling all play `jumpLoop`, so the body does not show the arc; long falls look like short hops | `PlayerAvatar.update` (air blend) | Code |
| 2 | High | **No squash, stretch or anticipation** on a toy-like hero: take-offs and landings have no weight; landing only overlays the `land` clip | `PlayerAvatar.onJump`, `onLand` | Code |
| 3 | High | **Chapter transitions are page reloads with a loading screen and a menu card.** The end of one chapter never flows into the next | `Game.gotoChapter` (`location.assign`) | Code |
| 4 | High | **Chapter endings are Mara talking to herself** over a view; no other character, no reveal staged in the engine | All three endings | Code, evidence screenshots |
| 5 | High | **No companion or on-screen characters besides the Watch.** Ivo and Sorn are text; nothing reacts with Mara | Story | Code |
| 6 | Medium | **Swimming is the walk cycle tipped forward**, with procedural arms, though CC0 `Swim_Fwd_Loop` and `Swim_Idle_Loop` are in the cache | `PlayerAvatar` swim block | Code; clip listing |
| 7 | Medium | **Steering the skiff uses the bench-sitting clip**, though CC0 `Driving_Loop` exists | `PlayerAvatar` ride poses | Code |
| 8 | Medium | **Footsteps know only stone, metal and wood.** Grass, gravel, shingle and sand sound like stone; wading is silent | `Physics.Surface`, `Game` footstep hook | Code |
| 9 | Medium | **The camera never looks down on a long fall**: look-ahead is horizontal only, so the landing is the last thing seen | `ThirdPersonCamera` aim | Code |
| 10 | Medium | **Swimming, the swing and the slide use the walking framing**; only grinding (and the skiff, through a zone) have their own | `ThirdPersonCamera` | Code |
| 11 | Medium | **Chapters Two and Three reuse Chapter One's music** | `chapters`/level beds | Code |
| 12 | Medium | **Single frames of 240–825 ms in Chapters Two and Three.** In Chapter Three at High on the RTX 2050, one such frame (390–600 ms) fell inside the 5 s window at every one of the five checkpoints; at Low on the same GPU, none over 26 ms. Chapter Two: 300 and 376 ms (High, RTX), 423 and 241 ms (Low, Intel); Chapter Three on Intel at Low: 825 ms once. Chapter One's worst was 92 ms. Cause not yet diagnosed (`scripts/trace-stalls.mjs` is the tool). Measured again after Phase B: they recur at High on the RTX (Chapter Two at four of five checkpoints, 261–339 ms) and did not appear on the Intel GPU that time, so they are intermittent | Chapters Two and Three | Measured, below and in STATUS.md |
| 13 | Medium | **Chapter One on the Intel GPU at Low averages 20–40 ms a frame** (25–49 fps) with the camera turning; the engine checkpoint is the slowest (39.8 ms) | Chapter One | Measured, below |
| 14 | Low | **Nowhere to test movement on its own**: every movement check runs through a chapter | Tools | Code |
| 15 | Low | **The camera sees the lighthouse scan's noisy underside** on its lower flights | Chapter Three | Known since PR #7 |
| 16 | Low | **Hands do not meet the swing's chains or the ladder's rungs** (no IK) | Avatar | Screenshots |
| 17 | Low | **Hitting a ceiling mid-jump has no reaction**: the rise just stops | Controller | Code |

## Proposals (not problems), by expected impact

| Proposal | Why | Phase |
| --- | --- | --- |
| Air poses, squash and stretch, landing tiers, head bump | Problems 1, 2, 17: the biggest feel gain for the least risk | B |
| New CC0 clips: swim, drive, talk, head bump | Problems 6, 7 | B |
| Fall framing; per-mode framing | Problems 9, 10 | B |
| Material footsteps and wading | Problem 8 | B |
| Movement lab (`?lab=1`) | Problem 14; tuning without a chapter | B |
| Pip, the companion | Problem 5; humour and warmth during play | C |
| A `Cinematic` director; endings that become the next chapter's opening | Problems 3, 4 | C |
| Chapter One environment polish | The first impression | D |
| The story thread across chapters; music per chapter | Problems 4, 11 | E |
| Diagnose and remove the long frames in Chapters Two and Three | Problem 12 | Next, before Phase C |
| Wall rebound, steam sail, pressure grapple | New verbs; only after ordinary traversal is excellent | F (gated) |

## Frame times before the overhaul (measured)

`scripts/measure-frames.mjs` (new): production build, headed browser, 1280×720, vsync and the
frame-rate limit off (`--uncapped 1`, so the times show what a frame costs rather than the 144 Hz
display), the game's own real-time loop. At each checkpoint: 1.5 s to settle, then 5 s with the
camera turning 0.01 rad a frame. Edge runs on the RTX 2050 (Windows graphics setting); Playwright's
bundled Chromium runs on the Intel UHD. One run each, on this laptop, on 2026-10-17; not averaged
over repeats.

| Chapter | Quality | Browser, GPU | Mean frame (ms), range over checkpoints | Mean fps | Worst checkpoint p95 (ms) | Worst single frame (ms) | Checkpoints | Geometries / textures | JS heap max (MB) |
| ---: | --- | --- | --- | --- | ---: | ---: | ---: | --- | ---: |
| 1 | Low | Edge, RTX 2050 | 4.2–6.1 | 163–236 | 12.2 | 35 | 9 | 623 / 64 | 78 |
| 1 | High | Edge, RTX 2050 | 12.7–17.9 | 56–79 | 34.3 | 52 | 9 | 623 / 84 | 76 |
| 1 | Low | Chromium, Intel UHD | 20.5–39.8 | 25–49 | 61.8 | 92 | 9 | 623 / 64 | 97 |
| 2 | Low | Edge, RTX 2050 | 2.8–3.7 | 272–357 | 7.1 | 15 | 5 | 291 / 62 | 94 |
| 2 | High | Edge, RTX 2050 | 6.9–8.1 | 124–146 | 16.0 | 376 | 5 | 291 / 79 | 77 |
| 2 | Low | Chromium, Intel UHD | 17.1–22.9 | 44–58 | 35.1 | 423 | 5 | 291 / 62 | 56 |
| 3 | Low | Edge, RTX 2050 | 2.8–3.9 | 258–361 | 6.2 | 26 | 5 | 123 / 34 | 51 |
| 3 | High | Edge, RTX 2050 | 5.9–7.8 | 129–171 | 14.1 | 600 | 5 | 123 / 51 | 82 |
| 3 | Low | Chromium, Intel UHD | 14.1–17.6 | 57–71 | 34.8 | 824 | 5 | 123 / 34 | 76 |

Raw data: [evidence/frames-before-f95f398.jsonl](evidence/frames-before-f95f398.jsonl).

**Reading it.** On the RTX 2050, Low runs above 160 fps everywhere; High runs at 56–79 fps in
Chapter One (p95 up to 34 ms) and 124–171 fps in Chapters Two and Three, apart from the long single
frames in problem 12. On the Intel UHD at Low, against Codex's proposed Low gate (mean ≥ 30 fps,
p95 ≤ 33.3 ms, no freeze over 250 ms): in Chapter One the mean misses at one checkpoint of nine
(the engine, 39.8 ms) and p95 misses at all nine (42–62 ms); Chapters Two and Three hold the mean
(44–71 fps) with p95 just over the line (31–35 ms) and fail the freeze limit (423 and 825 ms).
This rotating-camera test is harsher than the route-based measurement in STATUS.md (the
autopilot's route) and is not directly comparable with it. Chapters Two and Three are lighter
(291 and 123 geometries against Chapter One's 623).

## What this pass changed

See [STATUS.md](STATUS.md) (Phase B section) and [MOVEMENT_2_0.md](MOVEMENT_2_0.md). Phase B
addresses problems 1, 2, 6, 7, 8, 9, 10, 14 and 17.
