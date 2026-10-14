# Testing — first playable section (*The Quiet Cell*)

## Automated checks

| Command | What it checks |
| --- | --- |
| `npm run typecheck` | TypeScript strict type-check |
| `npm test` | Unit tests (Vitest): puzzle rules, progression/checkpoints/triggers, level dimensions vs movement capability |
| `npm run build` | Production bundle builds |
| `npm run check` | All three above |
| `npm run test:e2e` | Browser tests (Playwright) against a dev server it starts on port 5199 |

The browser tests run the game with `?test=1`. The simulation advances only when the test calls
`__GAME.step(n)`, so results don't depend on the machine's frame rate. Inputs go through the real
input pipeline (virtual stick and button presses), not through teleports, except where a test
deliberately places the player.

End-to-end cases (`tests/e2e/slice.spec.ts`):

1. **Boot and render.** Playing state, objective visible, the canvas isn't black, no console errors.
2. **Movement and jump.** The stick moves the player more than 1.5 m in 0.5 s, releasing stops
   within 0.2 s, a jump rises more than 1.2 m and lands.
3. **Wrong-state lever.** The lever with the bypass open hisses, counts a failed pull and leaves
   the hatch closed.
4. **Full route (autopilot, real physics).** Diagram → lever (wrong state) → close valve → wait
   for pressure → lever → hatch latches → through the hatch → girder jump → gap jump → lookout →
   light the lamp → completion card. Requires zero falls and all story flags.
5. **Fall recovery.** Dropping into the drainage channel recovers at the landing with the hatch
   still open and flags intact.
6. **Restart after completion.** "Restart section" gives a fresh puzzle (bypass open, hatch
   closed, no flags, back in the cell).
7. **Pause.** The simulation does not advance while paused, and resumes.
8. **Jump measurement.** Reports running-jump distance and apex, and fails if the distance drops
   below 3.0 m (the level's gap assumes ≥ 3.3 m).

Watch the scripted route play live: `npm run dev`, then open http://localhost:5173/?autoplay=1 and
click **Begin**.

## Manual test route (about 5 minutes)

Run `npm run dev`, open http://localhost:5173, click **Begin**, then click the view to capture the
mouse.

| # | Do | Expect |
| --- | --- | --- |
| 1 | Look around the cell | Objective "Open the service hatch". Horn line, then Mara notices the fresh copper. Supply pipe, gauge, diagram, piston, hatch and LIFT lever all visible from the start. |
| 2 | Walk to the scratched diagram, press **E** | Full-screen diagram; E or moving closes it; Mara comments once |
| 3 | Pull the lever (right of the hatch) | Hiss and steam at the piston top, hatch shudders, Mara's feedback line, nothing opens |
| 4 | Turn the bypass valve (left, low) | Wheel turns, pointer bar goes across, vent goes quiet, needle climbs into the hatched LIFT band in about 1 s |
| 5 | Pull the lever | Piston extends, hatch rises, pawls kick in, latch clank, "Thank you, old girl." |
| 6 | Reopen the valve | "The latch holds it now." The hatch stays open |
| 7 | Go through the hatch | Landing service light ignites, tip about service lights, objective "Cross the maintenance shaft" |
| 8 | Jump the fallen girder | Jump tip shown once on approach; easy clear |
| 9 | Deliberately walk into the channel | Quick fade, back at the landing; hatch still open |
| 10 | Jump the 2 m gap | Clean landing on the lit far side, objective "Reach the lookout" |
| 11 | Enter the lookout | Turbine hall view, beacon visible through the far breach, Mara's line, objective "Light the service lamp" |
| 12 | Light the lamp | Control locks, camera frames the hall, service lights come on one by one, intercom line, Mara's reply, completion card with time and falls |
| 13 | **Keep exploring**, then Esc → **Restart section** | Control returns at the lookout; restart gives a fresh cell and puzzle |

Also check: pausing mid-jump and resuming; alt-tabbing (should pause and release input); the
camera with your back against each wall of the cell and the landing; interacting from slightly
different angles; **Hint** in the pause menu three times while stuck in the cell; gamepad if
available.

## Acceptance criteria for this section

- Launches with the documented commands; no console errors on the tested route.
- The objective is understood within the first minute without coaching. This needs a human
  tester: automated tests cannot establish it.
- Movement and interaction respond reliably. The camera never hides the hatch, the gap or the
  landing in a way that blocks progress.
- The puzzle teaches its rule, the wrong state gives readable feedback, and no state can trap the
  player.
- Falling recovers at a checkpoint after the solved puzzle, without losing progress.
- A clear completion state with replay; restart gives a genuinely fresh puzzle.

## Reporting format for reviews

Please put review findings in `docs/reviews/` (one file per tested commit), with: tested commit,
environment (OS, browser, GPU, resolution, quality setting), severity, reproduction steps,
expected vs actual, evidence, and acceptance criteria for the fix.
