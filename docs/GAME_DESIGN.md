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
- **How the game opens** (owner's direction, 2026-10-15): the player meets Mara the night before.
  She refused to sign the diversion, went back to her workshop in Saltmere to prove the plan wrong,
  and fell asleep over the drawings. She wakes up on the floor of a cell in Breakwater. Who brought
  her there, and why, is the thread that carries into Chapter Two.

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
motion: needles settle, latches kick, steam vents with the engine's 4.2-second "breath". Mara and
the stone, metal and wood surfaces are CC0 assets; sound and effects are still procedural
placeholders (see [ASSETS.md](ASSETS.md)).

## Campaign outline (production proposal, not a promise)

- **Chapter One, *The Quiet Cell*** (built): Mara wakes up in the cell and escapes the cell block
  through the turbine hall and the Breathing Engine. Detailed below.
- **Chapter Two, *Wings in a Cage*** (owner's direction, 2026-10-15; not built): the hangar cell
  and an old aircraft; a flight; a simulation in which Mara is in another world; a crash into an
  original voxel world. Before it starts, the camera gets It Takes Two–style options: separate
  horizontal and vertical sensitivity, invert X and Y, chase assist (none, weak, strong), a camera
  shake toggle, and FOV. Third-party models are used only where their licence allows, with credit.
- **Later regions** from the prompt packs: archive workshop → flooded cistern → freight harbour →
  cliff stormworks → beacon crown → outer tidal channel. Each region gets a safe introduction, a
  developed problem and one signature challenge. The full mission list, with later mechanics
  (stealth, swimming, the skiff, gliding), is in the prompt packs. They enter production only
  through the gates in [STATUS.md](STATUS.md).

## Movement capabilities (measured)

Measured by the automated test `measure jump capability` at the tested revision. Tuning lives in
`MOVEMENT` in `src/player/PlayerController.ts`.

| Quantity | Value |
| --- | --- |
| Run speed | 5.5 m/s: a quick first step (52 m/s² to 45% of top speed), then smooth (30 m/s²); stops in about 0.12 s / 0.35 m |
| Jump apex (held) | 1.38–1.45 m (released early: noticeably lower) |
| Running jump, same height | 3.39 m |
| Coyote time / jump buffer | 0.15 s / 0.16 s |
| Auto-step | 0.32 m |
| Ledge assist | lifts the player onto ledges up to 0.42 m above the feet after a jump falls just short |
| Capsule | 1.5 m tall, 0.3 m radius (the visual figure is about 1.68 m) |

Rule for level design: required jumps stay at or below 60% of the running range (≈2.0 m),
preceded by a safe practice. Near-limit jumps are reserved for clearly marked optional routes.
The 2.0 m gap in the drainage channel sits at that limit since the run speed was lowered. The
autopilot clears it in every full-route test, and the 1.9 m tier-one gap is also cleared from 20°
and 30° approaches with one fixed input. Whether it feels fair to a person is untested.

**Air control and the camera.** Movement is camera-relative. In the air, a held direction keeps the
camera yaw it had at takeoff, so turning the camera mid-jump does not bend the jump. Releasing the
stick, or pushing a clearly different direction, reads the camera again.

**Camera rules** (`src/camera/ThirdPersonCamera.ts`):

1. Mouse and right stick always apply immediately, with no smoothing.
2. Assist (Off/Weak/Strong) only runs on the ground for 0.3 s, in normal movement, with the stick
   pushed forward, not interacting, outside the precision volumes around every jump, vault, ledge
   and moving platform, and after the player has left the camera alone (1.5 s / 0.8 s).
3. Spring arm: never through geometry. It shortens on the same frame and eases back out. When
   blocked it looks under the obstruction (a lower angle), then over a shoulder (pivot shifted up
   to 0.9 m). It never changes yaw.
4. Framing: the view aims above Mara and a little ahead of travel, so she sits low in the frame
   with the route above her.
5. Camera zones per space: the cell 3.4 m, the shaft 5.0 m, the lookout 3.8 m, the hall 5.6 m,
   tier three 4.4 m, the gantry top 3.0 m with a low pivot.

## Chapter One, *The Quiet Cell* (implemented)

### Opening (skippable, about 30 s)

1. Three cards over black: Saltmere, the night before (Mara keeps the tide engines running and
   was ordered to sign off a diversion that would drown her own district); she refused and fell
   asleep over the drawings; she woke up somewhere else.
2. The cell, by moonlight: Mara asleep on the floor. The Warden's horn: "Pressure cycle in
   progress. All cells remain sealed."
3. She gets up. "Where... This isn't my workshop." She looks around. "Salt on the walls. That
   engine thump... I know this place. Breakwater."
4. Title: *Chapter One, The Quiet Cell*: "The prison runs on the tide. So will her way out."
5. Control, and the objective "Open the service hatch". Mara notices the fresh copper.

Space, E or A skips to step 5 in the same state.

### Rhythm

Chapter One follows the owner's five-part rhythm:

| Part | Where | What it gives the player |
| --- | --- | --- |
| 1. Quiet Cell | The cell | The story, then an observation puzzle. Inspectable details: the diagram, the fresh copper line, the transfer order on the door (why she is here; someone expected her), and the engine felt through the wall. |
| 2. Service Route | The shaft | Movement without tutorial text: a low lit girder (jump or vault), a railing that stops a running player at the channel's lip, a lit crossing at the broken catwalk, and the landing's service light coming on. |
| 3. Machinery Well | Lookout → tier one → collar | The reveal of the hall from the lookout. Drops, the broken walkway, the barrier vault, the gantry climb, the shuttle, then the collar ride up. |
| 4. Pressure Breach | Tier three | The split feed: gauges, levers and chevrons on the pipes that run toward wherever the steam goes. The steam curtain, the visibly blocked route, clears when the feed goes to the ram. |
| 5. Escape Ride | The breach | The ram carries Mara up and she jumps to the exit gantry over the sea. The intercom points to the seaplane hangar, whose lights come up. "Chapter One complete" is a title card over that view. |

### Beats

| Beat | Space | Player does | Recovery |
| --- | --- | --- | --- |
| Wake | Mara's cell (4.6 × 5 × 4.4 m) | Gets up (opening); sees the hatch wall | — |
| Puzzle | Hatch wall | Reads the diagram, tries the lever, shuts the bypass, raises the hatch | Nothing can be lost |
| Practice | Maintenance landing | Jumps (or, at a run, vaults) a fallen girder (0.6 m, safe); a railing along the channel's lip stops a player who keeps running | Landing service light lit automatically |
| Gap | Drainage channel | Walks to the lit crossing where the old catwalk broke away and jumps the 2.0 m gap | Falling recovers at the landing in under a second |
| Reveal | Lookout (ruined tier-2 cell) | Sees the turbine hall, lights the lookout lamp | Lookout becomes the checkpoint |
| Reveal beat | — | The service lights come on across the hall; Ivo: "The tide turns soon. Follow the service lights." The rope gate drops and increment 2 begins | — |

### Puzzle specification: the pressure hatch

- **Goal:** open the service hatch.
- **Flow on the pipes:** amber chevrons painted along the pipework run down the vent branch while
  the bypass is open, and along the branch and up the piston once it is shut.
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

Built at the owner's request after the first slice. The reveal no longer ends the section. It
holds control for about 3.2 s (skippable with Space, E or the gamepad's A); then the rope at the
right of the lookout railing drops and the objective becomes "Follow the service lights down into
the hall", while the intercom exchange plays on under player control.

### Traversal vocabulary (new)

| Move | Input | Eligibility (documented in `src/player/Traversal.ts`) |
| --- | --- | --- |
| Short safe drop | walk off an edge | none: drops under ~2.6 m are part of the route |
| Low vault | Space while running (> 2.2 m/s) at the obstacle | collider registered **vaultable**; top 0.42–1.15 m above the feet; depth ≤ 0.9 m; ground and capsule room beyond |
| Ledge catch | jump at the ledge while pushing toward it | collider registered **climbable**; walkable top 1.15–2.2 m above the feet; room to hang and to stand on top (an angled approach that reaches the edge beside an obstruction slides up to 0.45 m along the edge to find room); intent toward the wall required |
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
3. **Vault.** A 0.84 m "NO ACCESS" steel barrier beam across the walkway; its top cap is painted
   in worn amber-and-black stripes where the hand lands. Jumping over it also works. Tested from
   square, 25° and 40° approaches.
4. **Ledge catch.** A loaded spares rack (pipes, a piston sleeve, crates, a spare gear) blocks the
   hall side of the walkway, and crates fill the space under a raised gantry along the wall. The
   way on is the gantry's end edge (2.0 m, worn handhold paint), caught and pulled up onto, then a
   drop back down beyond the rack. Tested from square, 20°, 35° and 45° approaches.
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
4. **Steam curtain.** On tier 3 a cracked line sprays across the walkway and pushes Mara back,
   without harming her. A painted hazard band marks where the push starts.
5. **The split feed (puzzle).** See the specification below. Mara works out how to make the
   breach ram carry her up 2.4 m, then makes a broad jump of about 2 m onto the exit gantry.
   Missing the jump costs a few seconds: recovery is at the "Breach" service light with the ram
   waiting primed again.
6. **Ending of Chapter One.** Over Mara's shoulder, out to sea. Ivo on the intercom: "You made the
   engine carry you. You're out of the cells, not off the rock." Mara: "Who are you? Who brought
   me here?" Intercom: "Sorn wants your signature, or your silence. Look left, past the breach.
   The old hangar on the spur." Its work lights come up and silhouette a floatplane, and the
   camera frames it past her. Intercom: "There's a seaplane in there. The only thing on Breakwater
   that still flies. Get to it before the tide turns." Mara: "Ivo. It has to be." Then "Chapter
   One complete", a title card over that view with the time, falls, "Play Chapter One again" and
   "Keep exploring".

### Puzzle specification: the split feed

The rule the cell taught (pressure goes where the valves send it) now drives a choice that has a
consequence. It uses only existing systems: a diverter in the cell's plate-and-pointer language, a
lever, gauges, and a vertical platform.

- **Goal:** get past the steam and up to the exit gantry, 2.4 m above the walkway, at the breach.
- **Machine.** One steam main feeds a junction before the curtain, mounted on a lit control board:
  - **FEED diverter** (wheel with a pointer bar; plate: VENT ← → RAM). VENT sends the steam into the
    cracked line, which is the curtain. RAM sends it to the breach ram, which then rises to the
    exit gantry and holds there while fed.
  - **RAM CATCH lever** (plate: "holds the ram where it stands; release on the deck"). A rod runs
    along the wall to a toothed rack post beside the ram; a brass pawl on the deck swings into it.
  - **Gauges** VENT and RAM show where the pressure goes. RAM sits in the red and the ram shudders,
    with a relief valve hissing at its base, while the catch holds it against the feed.
  - **RELEASE lever** on the ram deck frees the catch.
- **Initial state:** feed VENT (curtain on), catch free, ram down.
- **Natural first try:** feed the RAM. The steam stops, but the ram rises empty and holds out of
  reach. Mara: "...and up it goes. Without me."
- **Solution:** with the ram down, set the CATCH; feed the RAM (the curtain stops; the ram strains
  but waits); cross; stand on the deck; RELEASE. The ram carries her up.
- **Other states:** a catch set at the top holds the ram up even when venting; freeing it lets the
  ram follow the feed again. A catch set mid-travel stops the ram where it is.
- **Recovery.** Everything is reversible from the junction alone. No step needs two places at
  once, no timing, and no waiting longer than the 2.4 s ram travel.
- **Hints (optional, pause menu, escalating, never automatic):** (1) the objective plus "the feed
  goes one way or the other"; (2) what the catch does; (3) the full order.
- **Rules in code:** `src/gameplay/puzzles/SplitFeedLogic.ts`, unit-tested in
  `tests/unit/splitFeed.test.ts` and played in the browser in `tests/e2e/engine.spec.ts`.

Whether a first-time player can explain the cause and effect after solving it, and whether it is
enjoyable, has **not** been tested with a person yet.

### Recovery rules

Every checkpoint has an explicit recovery height (`recoverBelowY`). Falling below it fades out and
respawns there. Puzzle and machine states never revert on respawn: the collar stays latched at the
top, and the feed stays where Mara set it. One deliberate exception: after the ram has carried
her up once, a fall at the breach recovers with the ram primed again, so a missed jump never costs
the puzzle twice. "Restart section" restores everything.

## Deviations from the prompt packs (flagged for the owner)

- **The ending's destination** is a seaplane hangar on a rock spur outside the prison, seen from
  the breach. The earlier text said "the hangar cell"; the intercom now points to "the old hangar
  on the spur". It is a distant set piece only; Chapter Two decides how Mara gets there.
- **The shaft railing.** A running jump over the practice girder carried Mara into the channel.
  The railing and the crossing at the broken catwalk change the route through the shaft, not the
  gap.
- **The opening.** The prompt packs start in the cell. At the owner's request the game now opens
  the night before, with Mara falling asleep in her workshop and waking up in prison. Her home
  town is named **Saltmere**; the packs leave it unnamed.
- **Chapter Two direction.** The owner set it as the hangar cell, an aircraft, a simulation in
  another world and a crash into a voxel world. This replaces the packs' archive workshop as the
  next destination; the ending now points to the hangar.
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
- **The Breathing Engine's final section** uses a second, pressure-driven ram at the breach
  rather than the collar itself, so the last jump stays broad and well framed against the harbour.
  Following Codex's review (R8), the single bypass valve there became the split-feed puzzle above.
