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
| Reveal beat | — | The service lights come on across the hall; Ivo: "The tide turns soon. Follow the service lights." The rope gate drops and increment 2 begins | — |

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

## Increment 2: parkour practice route + The Breathing Engine (implemented, unreviewed)

Built at the owner's request after the first slice. The reveal no longer ends the section: when
the intercom line finishes, the rope at the right of the lookout railing drops and the objective
becomes "Follow the service lights down into the hall".

### Traversal vocabulary (new)

| Move | Input | Eligibility (documented in `src/player/Traversal.ts`) |
| --- | --- | --- |
| Short safe drop | walk off an edge | none: drops under ~2.6 m are part of the route |
| Low vault | Space while running (> 2.2 m/s) at the obstacle | collider registered **vaultable**; top 0.42–1.15 m above the feet; depth ≤ 0.9 m; ground and capsule room beyond |
| Ledge catch | jump at the ledge while pushing toward it | collider registered **climbable**; walkable top 0.45–2.2 m above the feet; room to hang and to stand on top; intent toward the wall required |
| Pull-up / mantle | Space or push toward the wall while hanging (automatic for low ledges) | as above; 0.55 s |
| Let go | pull away from the wall while hanging | the same ledge can't be re-caught for 0.6 s |
| Moving-platform ride | stand on it | carried by the controller (horizontal and vertical) |

Decorative pipes and ordinary walls are never climbable. Only the surfaces the level registers
qualify.

### Practice route (tier 1 of the turbine hall)

*Feeling:* "I'm getting good at this." Each move gets a safe introduction before it is required,
and a service light sits next to each risky move.

1. **Drops.** Lookout → scaffold (2.0 m) → tier-1 walkway (2.6 m).
2. **Gap.** A 1.9 m collapse in the walkway (service light "Tier one" before it).
3. **Vault.** A 0.84 m "NO ACCESS" maintenance rail across the walkway. Jumping over it also works.
4. **Ledge catch.** A rubble heap blocks the walkway. The way on is a raised gantry along the wall
   whose edge (2.0 m, marked with worn paint) must be caught and pulled up onto, followed by a drop
   back down beyond the rubble.
5. **Ride.** A horizontal piston shuttle carries Mara across a 5 m collapse. It rests 2.6 s at
   each end, so no timing is needed (service light "Collapse" before it).

### The Breathing Engine

*Feeling:* the machine that looked threatening becomes a lift Mara commands. *Mechanic:* the
engine collar, a railed ring deck around the column, heaves ±2.6 m with the engine's 8.4 s cycle.
*Payoff:* the ride ends on a gantry jutting out of the breach over the harbour.

1. **Observe.** From the tier-1 gantry the collar rises and falls past the boarding gap. A safety
   chain closes the gap whenever it moves.
2. **Brake.** The gantry lever (BRAKE) catches the collar and holds it at boarding height.
3. **Ride.** The deck lever (RIDE) sends it to the top stop (tier 3), where it latches. Both levers
   are reversible: the gantry lever calls the collar down from the top, and the deck lever rides it
   down. No state needs a second person, and none can strand the player.
4. **Steam curtain.** On tier 3 a cracked main sprays across the walkway and pushes Mara back,
   without harming her. The bypass valve before it (same plate and pointer language as the cell)
   redirects the pressure. The curtain stops, and the redirected pressure starts a piston at the
   breach.
5. **Combination.** Ride the breach piston up 2.4 m (it rests 2.8 s at the top) and make a broad
   jump of about 2 m onto the exit gantry. Missing it costs about 5 seconds: recovery is at the
   "Breach" service light.
6. **Ending.** Ivo on the intercom: "You made the engine carry you. The archive is past the
   harbour crane." Mara: "Ivo. It has to be." Then the completion card.

### Recovery rules

Every checkpoint has an explicit recovery height (`recoverBelowY`). Falling below it fades out and
respawns there. Puzzle and machine states never revert on respawn: the collar stays latched at the
top, the steam stays off. "Restart section" restores everything.

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
- **Sprint** (suggested in the parkour pack) is not implemented. Every required jump is tuned for
  normal running. Sprint can come back with the optional express route.
- **Express route and timed side route** (parkour pack §3 and §4) are not built yet. The main
  path exists, with generous rests on every moving platform.
- **The Breathing Engine's final section** uses a second, pressure-driven piston at the breach
  rather than the collar itself, so the last jump stays broad and well framed against the harbour.
