# Status

| | |
| --- | --- |
| **Branch** | `claude/breathing-engine` (draft PR, stacked on `claude/first-playable` / PR #1) |
| **Build** | Chapter 1 slice *The Quiet Cell* (Gate A) + increment 2: parkour practice route and *The Breathing Engine* |
| **Review** | Neither part has been reviewed or approved by Codex yet |

The revision is in the PR and in `git log`.

## Implemented

**First slice (unchanged in scope, see PR #1).** Mara's cell and the pressure-hatch puzzle, the
maintenance shaft (practice jump plus a 2 m gap), service-light checkpoints, fall recovery, and
the lookout reveal of the turbine hall.

**Increment 2 (this branch).**

- **Controller.** Explicit-eligibility **ledge catch** with hang, pull-up and let-go; automatic
  mantle for low ledges; a **low vault** on jump at a registered rail; **knockback** (steam);
  moving-platform carry reworked (see Known issues → Technical note).
- **Avatar.** Hang, pull-up and vault poses.
- **Level.**
  - The reveal opens a rope gate.
  - Practice route along tier 1: two short drops, a 1.9 m gap, a vault rail, a ledge catch onto a
    raised gantry, and a horizontal piston shuttle over a 5 m collapse.
  - The Breathing Engine: collar brake, collar ride, and reversible levers.
  - Steam curtain with a redirect valve; breach piston; broad jump to the exit gantry over the
    harbour.
  - Ivo's intercom line and a new completion card.
- **Recovery.** Every checkpoint has an explicit recovery height. Machine states (collar latched,
  steam off) persist through respawns, and "Restart section" resets everything.
- **Dev/test.** `__GAME.autopilot('engine')` runs just the increment's route; there are viewpoint
  helpers for screenshots; dev keys 1–9 teleport to all nine checkpoints.

## Verification

Environment: Windows 11 Pro, NVIDIA GeForce RTX 2050 laptop GPU, Node 22.13.1; headless
Microsoft Edge (GPU) and Playwright's bundled Chromium 1243 (software rendering).

**Verified by execution**

- `npm run typecheck` passes. `npm test`: **29 unit tests**, including 9 new traversal-eligibility
  tests against a real Rapier world (registered vs. unregistered ledges, reach range, intent, vault
  height and facing).
- `npm run test:e2e` in Edge: **12/12** (1.4 min). This includes:
  - the **complete route from the cell to the exit gantry** played by the autopilot through real
    inputs and physics (50/50 steps, zero falls);
  - the increment route on its own;
  - the steam curtain blocking without harm, then passing once the bypass is closed;
  - the collar's brake, ride up and ride down in both directions;
  - a fall from the upper route recovering at the upper gantry with the collar still latched;
  - all eight slice checks.
- Bundled Chromium (software rendering, test mode on Low quality): **12/12** (17.5 min).
- Collar ride measured: the rider stays 2.0 cm above the deck rising and up to 7.5 cm descending.
  Boarding, walking off at both stops, and walking back on all succeed.
- Screenshots of every new area were inspected (`node scripts/capture.mjs`, shots 09–17).

**Reviewed in code only**

- Gamepad, pointer lock and audio, as for the slice.
- Hanging and letting go (the autopilot's ledge catch mantles directly; the hang branch is
  code-reviewed and partly unit-covered).

**Not yet verified**

- Human playtests of either part: comprehension, fun, difficulty, how the ledge catch *feels*.
- Real-hardware frame rate.
- Firefox and Safari.

## Known issues and limitations

- **Technical note: moving platforms.** Rapier 0.21's character controller stalled when pressing
  into colliders attached to kinematic bodies. Moving platforms are therefore body-less colliders
  repositioned after the player each fixed step, with the player carried explicitly. This is
  verified by the tests above. Reviewers should still try boarding and leaving every platform from
  odd angles.
- **Teleports queue dialogue.** Dev teleports can leave unrelated subtitle lines queued. This is
  cosmetic and affects dev tools only.
- **Unpolished art.** The steam curtain is particles plus a faint sheet, and still reads a little
  flat. The ledge gantry relies on a thin painted edge to signal "climbable".
- **Not built yet.** The express route and timed side route from the parkour pack, and sprint.
- Plus everything listed for the slice: proxy art and audio, bundle size, no persistent save, and
  a reveal that locks control for about 7 seconds.

## Next milestone

Address Codex's review of PR #1 and of this branch first. Then, per the owner's direction,
chapter 1's guard encounter and the archive approach.
