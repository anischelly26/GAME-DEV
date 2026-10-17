# Implementation roadmap: the cinematic overhaul

Status: **plan** (2026-10-17). Order, scope, branches and acceptance checks for the owner's brief
"IT TAKES ONE — THE CINEMATIC ADVENTURE OVERHAUL". The audit behind it is
[OVERHAUL_AUDIT.md](OVERHAUL_AUDIT.md). Phases are sized by what can be built and verified, not
by dates. Nothing here is merged or published without the owner's authorisation.

## Branch plan

Every phase is a `claude/*` branch with a draft PR stacked on the previous one, so each can be
reviewed on its own. Existing PRs #1 to #7 are not touched.

| Phase | Branch | Stacked on |
| --- | --- | --- |
| B, game feel | `claude/game-feel` | `claude/low-tide` (PR #7) |
| C, Pip and the cinematic framework | `claude/pip-and-scenes` | `claude/game-feel` |
| D, Chapter One polish | `claude/chapter-one-polish` | Phase C |
| E, story continuity | `claude/story-thread` | Phase D |
| F, new mechanics | `claude/new-moves` | Phase E (gated, see below) |
| G, Chapter Four design | `claude/chapter-four-design` (docs only) | Phase E |

## Phase B: game feel (now)

Scope in [MOVEMENT_2_0.md](MOVEMENT_2_0.md) B1 to B7:

1. Air states (rise, apex, fall, long fall) and squash and stretch, as pure, unit-tested functions.
2. Landing tiers by impact.
3. New CC0 clips: swimming, driving, a head bump, talking; rebuild `mara.glb`.
4. Camera: fall framing and per-mode framing (swim, swing, slide).
5. Footsteps and landings by material (grass, gravel, sand, shallow water), with level hooks.
6. The movement lab (`?lab=1`) and its e2e lap.

**Done when:** unit and e2e suites pass in Edge with the counts recorded; the lab lap passes;
screenshots of each air state, the squash, swimming and the skiff are in `docs/evidence/game-feel/`;
frame times at the lab and the three chapters' checkpoints are measured before and after on the
same machine, and any regression is explained.

## Phase C: Pip, the cinematic framework, the first seamless transition

1. **`Cinematic` director** ([CINEMATIC_VISION.md](CINEMATIC_VISION.md)): shots (cut, ease, orbit,
   follow, handheld), cues, actors, skip to end state, `dispose()`. Port the three existing openings
   and endings onto it without changing what they show (their tests must pass unchanged).
2. **Pip**: model (original, built from primitives and CC0 materials like the toy hero), rig of
   simple parts (body, eye, iris, fins, legs, needle), states (follow, hover, cling, look-at,
   scared, curious, point), chirp sounds (synthesised), subtitles in brackets. Follow logic that
   stays out of the camera arm and never blocks Mara (tests for both).
3. **Chapter One ending → Chapter Two**: Pip's crash landing on the exit gantry; the cable; the
   masked reload; Chapter Two's opening at the cable's foot.
4. **Disposal checks**: a test that counts geometries, textures, programs, listeners and audio
   nodes before and after a scene runs and is disposed, and across a chapter reload.

**Done when:** the new ending plays and skips to the same state (tests with and without
`?watch=1`); Pip follows through Chapter Two's lap without entering the camera arm or the Watch's
sight on its own; the counts are flat.

## Phase D: Chapter One environment polish

The list in [VISUAL_ART_DIRECTION.md](VISUAL_ART_DIRECTION.md). Each item has a fixed-camera
screenshot before and after, and the frame time at its checkpoint before and after.

## Phase E: story continuity

From [STORY_CONTINUITY.md](STORY_CONTINUITY.md), once the owner approves the story proposal:

1. Chapter One: the governor in Sorn's announcements; the optional room with her annotated
   drawings.
2. Chapter Two: Pip as guide (and its wrong turn); the accumulator missing from the seaplane;
   Ivo's navigation device; the transition to Chapter Three through the causeway gate.
3. Chapter Three: Pip in the water with Mara; the beam in the spiral's rhythm; Ivo's recording;
   Sorn on the crown at a distance; the beam's shot to the arcade.
4. Music per chapter (CC0 or original): Chapters Two and Three currently reuse Chapter One's.

## Phase F: new mechanics (gated)

Wall rebound, steam sail, pressure grapple, as specified in [MOVEMENT_2_0.md](MOVEMENT_2_0.md).
**Gate:** five clean runs of the movement lab by a person, with notes, and the owner's go-ahead.
Each mechanic gets a lab station and tests before it appears in a chapter.

## Phase G: Chapter Four (design only)

An original Pier Arcade: layout, beats, puzzles built on Edda's automata and cams, the pattern
drum, and how Pip and Ivo's thread resolve. A design document and greybox sketches only.
**Not implemented** until Phases B to E are polished and the owner says so.

## Standing checks for every phase

- Unit tests and the full e2e suite in Edge, run, with real counts in STATUS.md.
- `?watch=1` treated explicitly in tests that involve the Watch.
- No invalid HDR values or black frames at High (the sanitize pass stays).
- Auto / High / Low profiles keep working; Low keeps every gameplay cue.
- No new event listeners, geometries, materials, textures or audio nodes left behind across
  chapter changes.
- Every third-party asset recorded in ASSETS.md with source, author and licence.
- README, STATUS, GAME_DESIGN, TESTING and ASSETS updated in the same PR.
- No claims of tests, reviews, benchmarks or playtests that did not happen.
