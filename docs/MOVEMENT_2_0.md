# Movement 2.0: the overhaul's movement plan

Status: **plan** (2026-10-17). Phase B items are marked with what was built and how it was checked;
everything else is a proposal. The name "Movement 2.0" was first used for the steam kicker set
(sprint, dash, double jump, air dash, ground pound; `MOVEMENT` in `src/player/movement.ts`). This
document builds on that set; it does not replace it.

The owner's words: "I love the swinging, jumping, double jumping, swimming, and moments where
movement combines with the environment." So the goal is not more moves. It is the moves Mara has
reading and feeling better, and combining with the world more often.

## Where movement stands (measured, unchanged by this plan unless stated)

| | |
| --- | --- |
| Run | 5.5 m/s; launch 52 m/s² to 45 %, then 30 m/s²; stop in about 0.12 s / 0.35 m |
| Jump | apex 1.38 to 1.45 m held; running jump 3.39 m; coyote 0.15 s; buffer 0.16 s |
| Kicker | double jump +1.15 m with a flip; air dash 11 m/s for 0.2 s; ground pound 24 m/s |
| Traversal | ledge catch 1.15 to 2.2 m; vault 0.42 to 1.15 m; ledge assist 0.42 m; auto-step 0.32 m |
| Rides | swing (pumped pendulum), slide (measured chute), ladder, grind pipes, skiff |
| Swim | float 0.42 m under the surface, 2.9 m/s, climb out at ledges, kick up 1.6 m |

These numbers are good. The controller is responsive (tests cover coyote time, the buffer, the
jump cut, air control and the camera-relative held direction). What lets the movement down is how
it **reads** and **lands**, which is what Phase B addresses.

## Problems this plan fixes (confirmed in [OVERHAUL_AUDIT.md](OVERHAUL_AUDIT.md))

1. One airborne pose (`jumpLoop`) for the whole jump: rising, apex and falling look the same, so
   the player cannot read the arc from the body.
2. Landings have no weight on the body: the `land` clip overlays, but a toy-like hero with a big
   head and no squash looks stiff.
3. Swimming is the walk cycle tipped forward with procedural arms, though CC0 swim clips exist.
4. The skiff pose is the bench-sitting clip, though a CC0 driving clip exists.
5. Footsteps are stone, metal or wood: grass, gravel, shingle and sand all sound like stone;
   wading makes no sound.
6. The camera does not look down during a long fall, so the landing spot is the last thing seen.
7. Swimming, the swing and the slide use the walking camera framing (only the skiff and the
   grind have their own).
8. There is no place to test and tune movement in isolation; every check runs through a chapter.

## Phase B: game feel (this branch, `claude/game-feel`)

### B1. Air states

Weights from vertical speed `vy` (m/s) and time airborne, blended every frame (no pops):

| State | When | Body |
| --- | --- | --- |
| Rise | `vy > +1.5` | `jumpLoop` (arms up, knees bent), body stretched (B2) |
| Apex | `-1.5 ≤ vy ≤ +1.5` | the same, a small tuck (knees up) |
| Fall | `vy < -1.5` | arms out and up from the shoulders, legs reaching down for the ground |
| Long fall | falling for more than 0.45 s with `vy < -9` | the arms windmill, the face turns worried |

The blend is a pure function (`airPose` in `src/player/feel.ts`) with unit tests, so the thresholds
can be tuned without touching the avatar.

### B2. Squash and stretch

A toy can squash. Mara's visual (never her capsule) is scaled about her feet by an underdamped
spring, keeping volume (`width = 1/sqrt(height)`):

- **Take-off:** stretch to about 1.10 tall.
- **Double jump:** a smaller stretch (1.06).
- **Landing:** squash proportional to impact speed: none under 3 m/s, up to 0.80 tall at 16 m/s.
- **Ground pound landing:** the full squash.
- Spring: ω 22 rad/s, ζ 0.42 (one small overshoot, settles in about 0.3 s). Clamped to 0.78 to
  1.16. Off during cinematics, rides and swimming.

The spring (`SquashSpring` in `src/player/feel.ts`) is unit-tested: settles, is clamped, keeps
volume, does nothing for small impacts.

### B3. Landing tiers

| Impact (m/s) | Sound | Camera | Body | Effects |
| --- | --- | --- | --- | --- |
| < 3 | none | none | none | none |
| 3 to 8 | `land` by material | none | small squash, `land` overlay | none |
| 8 to 12 | `land` by material | small shake | squash, `land` overlay | dust ring |
| > 12 | `land:heavy` | shake | big squash, surprised face | bigger dust |

Control is never held back by a landing (a pillar: "movement that feels good before it gets
hard").

### B4. New CC0 clips

Added through the existing pipeline (`tools/maraAssemble.ts` `CLIPS`, then
`node scripts/import-mara.mjs`), from Quaternius's Universal Animation Libraries (CC0, already the
source of every clip Mara has):

| Name | Source clip | Use |
| --- | --- | --- |
| `swimIdle` | UAL1 `Swim_Idle_Loop` (3.33 s) | treading water |
| `swimFwd` | UAL1 `Swim_Fwd_Loop` (1.33 s) | swimming, phase-locked to speed |
| `drive` | UAL1 `Driving_Loop` (1.67 s) | steering the skiff |
| `hitHead` | UAL1 `Hit_Head` (0.43 s) | bumping her head on a ceiling mid-jump |
| `talk` | UAL1 `Idle_Talking_Loop` (2.93 s) | Phase C scenes (cheap to add now) |

### B5. Camera

- **Fall framing:** after 0.3 s of falling, the aim point sinks with fall speed (up to 1.1 m) and
  the pivot follows faster, so the ground comes into view before the landing.
- **Mode framing:** swimming sits lower and closer (the waterline in the lower third); the swing
  stands back and widens so the whole arc and the target are in frame; the slide stands back and
  widens with speed. Zones still win where a level defines one.
- **Unchanged:** mouse and stick input are never smoothed; assist rules; the spring arm never goes
  through geometry; the rising-jump pivot stays slow (the camera does not bob with every hop).

### B6. Footsteps by material

`Surface` grows from stone, metal, wood to stone, metal, wood, **grass, gravel, sand, water**.
Colliders keep their tags; a level can also answer `surfaceAt(x, z)` for large colliders painted
with several materials (the green's lawns, the lane's gravel, the cove's shingle, the bar's sand).
Standing in water shallower than swimming depth plays a splash for each step and leaves a ring.
Landings use the material too.

Samples: Kenney Impact Sounds (CC0, already used) has grass and snow footsteps; Kenney RPG Audio
(CC0, already used) has dirt-and-gravel footsteps. Sand uses the snow steps pitched down. All
recorded in [ASSETS.md](ASSETS.md).

### B7. The movement lab (validation route)

A small test level, `?lab=1` (not in the chapter list, no story), for tuning and for tests:

| Station | What it checks |
| --- | --- |
| Gaps 1.5 / 2.0 / 2.8 / 3.3 m | the running jump, the 60 % design rule, the limit |
| Ledges 1.2 / 1.8 / 2.2 / 2.6 m | catch range (2.6 m needs the double jump) |
| Vault blocks 0.5 / 0.9 / 1.2 m | vault range (1.2 m is a climb) |
| Drops 1 / 3 / 6 / 10 m | landing tiers, squash, the fall camera |
| Material pads | stone, metal, wood, grass, gravel, sand, shallow water |
| Ramp 34° | slope following |
| Pound plate | the ground pound |
| Pool | swimming in and out |

One e2e test runs a scripted lap with the real input pipeline and checks each station's result.

## Phase F: new mechanics (proposal, gated)

Not started. Codex's earlier guidance holds: new moves only when ordinary traversal is excellent.
The gate is five clean runs of the movement lab by a person, with notes, plus the owner's go-ahead.

| Mechanic | Idea (original to this game) | First use | Risk |
| --- | --- | --- | --- |
| Wall rebound | Kick off a registered wall plate with the kicker's jet: one rebound per airtime, a fixed angle away from the wall | A chimney in Chapter One's breach | Must never trigger on ordinary walls |
| Steam sail | Pop a canvas sail from the canister to glide on rising steam and sea wind; vents and wind lanes carry her | The Wind Orchard in Chapter Two (Codex's mission list) | Camera and readability of wind |
| Pressure grapple | A hose-and-hook fired at brass pressure rings; it pulls her or swings her, and the pressure in the ring sets the pull | Crane walk in the harbour | Target readability; scope |

Each gets a design page, tests and a lab station before it appears in a chapter.

## Rules (all phases)

- Change feel numbers only with a test that measures them.
- No change makes a required jump harder. Required jumps stay at or below 60 % of the measured
  running range.
- Visual-only effects (squash, poses, camera) never change the capsule or the physics.
- Every new state has a way out that the player controls.
