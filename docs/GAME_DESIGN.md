# Game design — It Takes One (working title)

**Direction status.** On 2026-10-14 the creative owner chose the Breakwater / Mara Venn direction
proposed in [reviews/CLAUDE_DESIGN_PROMPTS.md](reviews/CLAUDE_DESIGN_PROMPTS.md) over Claude's
earlier Saltmarrow / Wren draft. This document is the implementation-side version of that
direction. Deviations from the prompt packs are listed at the end.

## Pitch

Breakwater is a fortress prison built around a colossal tidal engine. Every lock, lift and
floodgate runs on seawater pressure. **Mara Venn**, a municipal tide-engine mechanic, was locked up
for refusing to certify a flood diversion that would drown her home district at the next high
tide. The same machinery that holds her can carry her out, if she understands it better than her
jailers do.

- **Why escape matters:** she must get proof off the island and stop the diversion. When a boat
  later offers her personal freedom, the stakes give her a reason to turn back toward the machine.
- **Opposition:** Warden Sorn and the automated Watch. Sorn appears through announcements, work
  orders and neglected safety systems, never through long monologues.
- **Uncertain ally:** Ivo, a maintenance prisoner who leaves repairs, route marks ("IV") and
  occasional intercom messages. He never plays for Mara or solves puzzles remotely.
- **Opening question:** why has someone freshly repaired the pipe connected to Mara's cell?

## Pillars

1. **Understand the machine, then use it against the prison.** Puzzles are causal systems with
   visible motion, sound and state: pressure, weight, water level and wind. No arbitrary switch
   sequences.
2. **Movement that feels good before it gets hard.** Responsive running and jumping, forgiving
   edges, readable landings. Difficulty comes from combining known rules, not from precision.
3. **Confinement and release.** Cramped warm spaces open onto huge cold ones. Every space frames
   its next destination.
4. **Always recoverable.** Falls cost seconds, never puzzle progress. Required objects cannot be
   lost. Every state is resettable.
5. **Short, human words.** Mara reacts briefly. Silence carries traversal. The world tells the
   story through repairs, signage and machinery.

## Look and sound

Stylised maritime-industrial fantasy: rounded, chipped stone; heavy iron silhouettes; verdigris
brass; amber practical lamps against cold ocean blue and oxidised teal. Mara's ochre jacket and
coral scarf are the only other warm accents, which keeps her readable. Mechanisms have honest
motion: needles settle, latches kick, steam vents with the engine's 4.2-second "breath". Every
effect is a procedural placeholder for now (see [ASSETS.md](ASSETS.md)).

## Campaign outline (production proposal, not a promise)

Cell block → maintenance spine → turbine hall → archive workshop → flooded cistern → freight
harbour → cliff stormworks → beacon crown → outer tidal channel. Each region gets a safe
introduction, a developed problem and one signature challenge. The full mission list, with later
mechanics (stealth, swimming, the skiff, gliding), is in the prompt packs. They enter production
only through the gates in [STATUS.md](STATUS.md).

## Movement capabilities (measured)

Measured by the automated test `measure jump capability` at the tested revision. Tuning lives in
`MOVEMENT` in `src/player/PlayerController.ts`.

| Quantity | Value |
| --- | --- |
| Run speed | 6.0 m/s, reached in about 0.1 s |
| Jump apex (held) | 1.38–1.45 m (released early: noticeably lower) |
| Running jump, same height | 3.66 m |
| Coyote time / jump buffer | 0.12 s / 0.14 s |
| Auto-step | 0.32 m |
| Ledge assist | lifts the player onto ledges up to 0.42 m above the feet after a jump falls just short |
| Capsule | 1.5 m tall, 0.3 m radius (the visual figure is about 1.68 m) |

Rule for level design: required jumps stay at or below 60% of the running range (≈2.2 m),
preceded by a safe practice. Near-limit jumps are reserved for clearly marked optional routes.

## Chapter 1, first playable section: *The Quiet Cell* (implemented)

| Beat | Space | Player does | Recovery |
| --- | --- | --- | --- |
| Wake | Mara's cell (4.6 × 5 × 4.4 m) | Hears the Warden's horn; sees the hatch wall | — |
| Puzzle | Hatch wall | Reads the diagram, tries the lever, shuts the bypass, raises the hatch | Nothing can be lost |
| Practice | Maintenance landing | Jumps a fallen girder (0.6 m, safe) | Landing service light lit automatically |
| Gap | Drainage channel | Jumps a 2.0 m gap to a lit landing | Falling recovers at the landing in under a second |
| Reveal | Lookout (ruined tier-2 cell) | Sees the turbine hall, lights the lookout lamp | Lookout becomes the checkpoint |
| Ending | — | The service lights come on across the hall; Ivo: "The tide turns soon. Follow the service lights." | Completion card: restart or keep exploring |

### Puzzle specification: the pressure hatch

- **Goal:** open the service hatch.
- **Visible clue:** a scratched diagram beside the hatch shows the same pipework in two states.
  Bypass *open* sends the flow into the vent and the hatch stays shut (crossed out). Bypass *shut*
  sends it up the piston and the hatch rises (ticked). Inspecting it shows it full-screen. The
  note reads "Pressure does the lifting. Give it somewhere to go. — I."
- **Initial state:** bypass open; the hatch-line gauge reads LOW; each engine breath vents audibly
  through the floor grate and rattles the hatch.
- **Actions:** turn the bypass valve (toggles); pull the hatch lever.
- **State rules:** pressure rises to the hatched LIFT band about a second after the bypass shuts.
  The lever lifts the hatch only in the LIFT band. Once lifting starts, it always completes and
  latches.
- **Feedback:** the gauge needle (LOW / LIFT words plus a hatched band, not colour alone); a valve
  pointer bar along the pipe for OPEN and across it for SHUT, matching the painted plate; vent
  steam and sound stop when shut; the piston rod extends; spring pawls kick in under the raised
  hatch.
- **Invalid action:** the lever with low pressure gives a hiss at the piston seal and a 5 cm
  hatch shudder. Mara's line varies and never states the answer outright.
- **After success:** reopening the valve cannot close the hatch ("The latch holds it now.").
- **Hints (optional, escalating):** 45 s objective reminder → 90 s attention to the diagram (it
  glows) → 150 s explicit causal hint. The **Hint** button in the pause menu gives the next tier
  immediately.
- **Reset / persistence:** "Restart section" restores the initial state. Respawns never revert it.
  The logic is pure and unit-tested (`src/gameplay/puzzles/PressureHatchLogic.ts`).

## Next increment (designed, not built): parkour practice route + The Breathing Engine

Per the owner's request on 2026-10-14 this follows the first slice. It is a design proposal until
the slice passes review.

**Parkour practice route.** *Feeling:* "I'm getting good at this." *Mechanic:* the traversal
vocabulary in order — run-jump, a forgiving low vault, ledge catch and pull-up, a short safe drop,
then a moving-platform ride. *Payoff:* a continuous express line around the tier-1 gallery,
ending at a viewpoint over the engine. *Recovery:* a service light at the start of each move; no
fall costs more than about 10 seconds. The main path has resting platforms, and the express line
chains moves and converges before story beats. Vault and ledge catch each get their own tested
eligibility rules (reachable height, top clearance, valid surface, safe final capsule position)
before any required route uses them.

**The Breathing Engine.** *Feeling:* the machine that looked threatening becomes a lift Mara
commands. *Mechanic:* the tidal collar rises and falls with the engine's cycle beside the tier-1
maintenance gantry (already visible from the lookout). (1) Watch a full cycle from safe ground.
(2) A service brake holds the collar at boarding height; board it, release it from an onboard
lever and ride up on broad railed decking. (3) Redirect pressure (the hatch rule reused) to stop
a steam curtain blocking a crossing. (4) Combine the ride and a broad jump to the exit gantry.
Timing is optional on the main path; a side route allows a continuous timed crossing.
*Payoff:* at the top, the harbour and fortress are visible through the breach. *Recovery:* a
checkpoint before the developed crossing. No enemies during the first moving-platform lesson.

## Deviations from the prompt packs (flagged for the owner)

- **Lookout location.** The lookout is a ruined tier-2 cell opening into the turbine hall,
  reached through a breach behind the maintenance shaft. It reveals the hall and the harbour beacon
  (through a collapsed section of the far wall) in one view.
- **Checkpoints are "service lights".** Pressure-gas lamps that Mara lights, which ties
  checkpoints to Ivo's "follow the service lights" and to the route reveal.
- **No cell door exit.** Mara's barred door stays locked dressing. The hatch is the only exit, so
  the objective is unambiguous.
- **Turbine hall form.** An 18-sided, three-tier cell ring around the tide-engine column, with
  the breathing collar that later becomes the Breathing Engine ride.
- **Sprint** (suggested in the parkour pack) is not implemented. The slice's gap is tuned for
  normal running, and sprint will be evaluated alongside the parkour route.
