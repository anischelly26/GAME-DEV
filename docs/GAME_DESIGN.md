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
the stone, metal and wood surfaces are CC0 assets. Sound is recorded CC0 samples (footsteps that
change with stone, metal, wood, grass, gravel and sand, and a splash when wading; cloth, impacts,
metal) and CC0 music and ambience beds that
change with the place, with synthesis where it reads better: steam, the engine's drone, the steam
whistle, the grind's scrape. The workshop's rain is generated in code. Sources and licences:
[ASSETS.md](ASSETS.md).

## Campaign outline (production proposal, not a promise)

- **Chapter One, *The Quiet Cell*** (built): Mara wakes up in the cell and escapes the cell block
  through the turbine hall and the Breathing Engine. Detailed below.
- **Chapter Two, *The Warders' Green*** (built, see below): the abandoned playground the
  owner's 2026-10-16 brief asked for, on the spur behind the prison, with the Watch.
- **Chapter Three, *The Low Tide*** (built, see below): the coastal escape the owner's 2026-10-16
  brief asked for: swimming, a steam skiff, the surge over the bar, and the lighthouse on Knoll Rock
  (the CC BY scan).
- **Chapter Four, the arcade** (owner's 2026-10-16 brief; not built): an arcade mystery. The
  reference the owner gave is a Minion Rush rip and cannot be used, so the arcade must be an
  original environment.
- **The hangar and the aircraft** (*Wings in a Cage*, owner's direction of 2026-10-15) are kept as
  the destination both chapters point to (the hangar at the end of the causeway). Where the flight,
  the simulation and the voxel world go now that the four-chapter list exists is the owner's call.
- **Later regions** from the prompt packs: archive workshop → flooded cistern → freight harbour →
  cliff stormworks → beacon crown → outer tidal channel. Each region gets a safe introduction, a
  developed problem and one signature challenge. The full mission list, with later mechanics
  (stealth, swimming, the skiff, gliding), is in the prompt packs. They enter production only
  through the gates in [STATUS.md](STATUS.md).

## Chapter Two, *The Warders' Green* (implemented, unreviewed)

Dawn on the spur behind Breakwater, where the prison's keepers once lived with their children.
Load it with `?chapter=2`, from the title screen's chapter buttons, or from Chapter One's
completion card. About 3 to 6 minutes; nobody has played it yet.

### The Watch (stealth, both chapters)

The automated Watch from the pitch is now on screen: steam automata in warden's caps that run on
rails (the collar's deck in Chapter One, a lane and a playground rim here), so their patrol routes
are visible on the ground.

| Rule | Value |
| --- | --- |
| Sight | A cone of ±25° (±72° within 1.9 m), 7.5 m long (13 m for the Watch on the playground rim, which looks down); solid geometry (walls, houses, hedges, the engine column) blocks it; railings and bars do not |
| Hidden | In tall grass or inside the concrete pipe it only notices Mara within 1.3 m |
| Suspicion | About 0.8 s to fill right in front of it, 2.4 s at the edge of its range; drains when she is out of sight. "?" while it fills, "!" when full |
| Alarm | Rail-side: it rolls after her at 3.1 m/s and grabs her (no sooner than 0.35 s after the "!"). Out of its reach: 0.9 s after the "!", still seeing her, it fires a tether (0.45 s flight). Either way she is caught: back to the checkpoint, not counted as a fall |
| Giving up | 2.6 s unseen, then it searches (lamp sweeping toward where the noise or Mara was), then returns to its round |
| Patrol | 1.25 m/s; every 6.5 s it stops and looks back for 2.2 s; at the end of a line it turns round |
| Hearing | Noise within a radius (the swing's creak: up to 12 m) sends it to the nearest point of its rail, lamp turned toward the sound |
| Ground pound | Within 1.7 m: knocked out for 6 s |

In automated route tests the Watch is off unless `?watch=1`.

### Beats

1. **The cove.** Mara wakes on the shingle (a 9 s skippable opening). The cove wall is a 1.7 m
   ledge: catch and climb.
2. **Cottage Lane.** Three cottages each side, front gardens behind tall hedges. A Watch runs up
   and down a rail in the middle of the lane. The gardens connect through a gap by each house (the
   sneaking way); the back gardens on the west side are another way round (low walls to vault).
   The lane ends in a 3.2 m compound wall whose only gate is in the middle of the lane, so the last
   step is a timed crossing behind the Watch's back.
3. **The green.** The playground is sunk 2.4 m into the green. A second Watch circles its rim
   on a U-shaped rail (it cannot see into the far corners or the concrete pipe).
4. **The slide** (the CC BY model, ridden): from the green over a plank onto its platform, then
   down the chute: gravity along the measured chute, a hop off the end into the playground. A
   ladder climbs back up.
5. **The swing.** The sea wall has fallen in over the playground, but its top is 4.8 m above the
   floor: a double jump (2.5 m) plus a ledge catch (2.2 m) falls short. Mara sits on the swing
   and pumps it (push the stick the way it is swinging); its creak carries, and the rim Watch
   comes to look. High on a forward swing, a leap (the seat's speed x1.35, plus a kick) carries
   her to the wall's top, where she catches it and climbs. Swing while the Watch is far away, or
   hide (pipe, tall grass) until it gives up.
6. **The yard.** Across the hangar yard to the causeway gate, locked from the far side. The old
   hangar waits beyond it, and out on Knoll Rock a lighthouse (the CC BY scan) is burning that
   should have been dark for years. Completion card; Chapter Three is next.

### Swing and slide specifications

| | |
| --- | --- |
| Swing | Pendulum, chain 2.7 m, its own gravity 14 m/s² (period about 2.8 s), damping 0.12/s; pumping adds up to 2.6 rad/s² when the push agrees with the swing's direction; capped at 70°. An empty swing damps at 1.0/s and can be sat on once it is low and slow (|θ| < 0.45 rad, |ω| < 1.6 rad/s) |
| Leap | Velocity of the seat x1.35, +5.0 m/s up, +1.4 m/s forward when swinging forward. Verified: a leap from a swing pumped past 1.1 rad catches the wall; from a 0.35 rad swing it falls short |
| Slide | The chute's centre line measured from the model (raycast profile, scale 1.6); speed gains 0.75 g along the slope less 1.2 m/s² friction, 1.5 to 9 m/s; leaves the end with a 2.2 m/s hop; Jump leaves early |

## Chapter Three, *The Low Tide* (implemented, unreviewed)

Late morning on the water between the hangar spur and Knoll Rock (`?chapter=3`, the title screen,
or Chapter Two's completion card). About 3 to 5 minutes; nobody has played it yet.

### Beats

1. **The slipway.** Mara starts at the top of the hangar's slipway (an 8 s skippable opening). The
   skiff is out on its buoy, the lighthouse beyond the rocks.
2. **The swim.** Down the ramp into the sea, out onto a sandbar that is dry at low water (the surge
   floods it for a moment), on to the skiff, and aboard.
3. **The skiff.** A small steam boat: point the stick where to go and push for speed. Channel buoys
   mark the way to the lagoon's mouth.
4. **The bar.** At low water the bar across the mouth is 0.3 m deep and the skiff (0.45 m draft)
   runs aground on it. Every 9 s Breakwater's tide engine "breathes" and the whole sea rises
   0.85 m for 3.6 s: wait at the bar and go when the engine thumps.
5. **The lagoon.** A Watch on a patrol boat circles the lighthouse. It hears the skiff's engine
   (5 to 15 m, with the throttle) and comes to look; rocks and the piles hide the skiff.
6. **The lighthouse** (the CC BY scan). Dock where its stairs come down into the water, climb three
   flights to the gallery, round to the door: forced, the lamp mended with new copper (like the pipe
   in her cell, Chapter One), and "IV" chalked on the lens. Completion card; Chapter Four is next.

### Swimming, skiff and surge specifications

| | |
| --- | --- |
| Swimming | Starts where the water is deeper than 0.95 m (above her waist); ends where it is shallower than 0.75 m. She floats with her feet 0.42 m under the surface, lying forward (crawl stroke, flutter kick), at up to 2.9 m/s. Swimming into a registered ledge climbs out; Space kicks up 1.6 m. No drowning, no stamina |
| Skiff | Up to 7 m/s; turns toward the stick at 1.9 rad/s under way (60 % of that standing); draft 0.45 m: a gentle bed shallower than that grounds it, anything steep (rock, pile, stairs, buoy) is a strike it glances off. Jump leaps out; at the stairs, Interact steps off |
| Surge | Every 9 s: the sea rises 0.85 m and falls over 3.6 s (sin²); an engine thump marks its start |
| The patrol | The Watch's rules (above), lamp 13 m, a ring of 19 m round the lighthouse; a catch tows Mara back to the checkpoint, aboard |

## The maintenance tether and *The Stormworks Escape* (Unreal Engine; implemented, unreviewed)

The owner's brief of 2026-10-24 asked for one signature mechanic, built properly in Unreal, inside
a short sequence. Build details, controls and test results are in
[UNREAL_STORMWORKS.md](UNREAL_STORMWORKS.md).

**Why a tether.** It fits Pillar 1: it works with the prison's own machinery (the brass
maintenance rings Ivo's crews use) instead of a superpower. It is also one action with two
readings, so combining them is the puzzle. *Pull* moves the world (a crate, a lever, a gate).
*Anchor* moves Mara (carried across a gap). Ivo leaves it on his workbench, in keeping with his
role: he leaves tools and marks, and never plays for her.

**Rules the player can learn in one go.**

- A teal brass ring means the tether works there. There are no other teal things in the level.
- What you aim at is what you get. A ring out of reach shows as grey "Too far" and is refused, so
  the player learns the reach (12 m) by seeing it, not by guessing.
- Pull moves a machine to the other end of a visible track, and a second pull brings it back (one-way
  machines say so by not moving). Anchor carries her along an arc to a fixed landing; Space lets go.
- The camera is never taken away during movement.

**The sequence's shape**, following the brief's six beats: a destination seen first (the
lighthouse through the workshop window); the mechanic learnt where failure is impossible (the
door crate); two uses combined (pull the cargo crate to the edge, stand on it, then the far anchor
is in reach); one complication that changes the situation (the storm coupling opens the gate and
arms the catwalk); a short climax using everything (about 8 s: tether, jump, tether while the
catwalk falls behind her); relief and a story beat (the roof, the view, Ivo's note).

**Story.** Ivo's note ties the sequence to the chapters: he lit the lamp on Knoll Rock to stop
Sorn's diversion, and there is a skiff under the light. That is Chapter Three's destination. Where
the Unreal sequence sits in the campaign (a reworked Chapter One exit, or a new chapter) is the
owner's decision.

**Recovery (Pillar 4).** Falls cost seconds: five forward-only checkpoints, solved machines stay
solved, the catwalk rebuilds if she falls during the climax, and R returns to the checkpoint.

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

**Movement 2.0** (`MOVEMENT` in `src/player/movement.ts`):

| Move | Input | Numbers |
| --- | --- | --- |
| Dash (a roll) | Shift / B on the ground | 10.5 m/s for 0.18 s, 0.4 s cooldown; an FOV kick |
| Sprint | hold Shift / B after a dash | 7.4 m/s while moving |
| Double jump (with a flip) | Space / A in the air | +1.15 m; total reach about 2.6 m above the takeoff; redirects toward the stick |
| Air dash | Shift / B in the air | 11 m/s for 0.2 s, holds height |
| Ground pound | Ctrl / RB in the air, 0.9 m or more above the ground | 0.16 s hover, slam at 24 m/s, 0.22 s recovery; breaks boards |
| Grind | land on a registered pipe; Space jumps off | 5.5–12 m/s, gravity along the slope; the last 2 m of a pipe can't be caught |

The double jump, air dash and ground pound need Ivo's steam kicker, picked up in the shaft. One
double jump and one air dash per airtime, refilled on landing, on a ledge and on a pipe.

**Reach audit.** With the kicker Mara reaches about 2.6 m up and well over 5 m across, so every
gate was re-checked with the real controller (`tests/e2e/sequence.spec.ts`): the exit gantry and
the ram's stroke are 3.4 m above tier three; collapsed floor closes each tier of the hall to one
direction; the steam curtain covers the full height under the roof; the lookout railing and rope
gate reach the ceiling. The shuttle's 5 m collapse can be jumped with a sprint, double jump and air
dash: that is allowed as a skill shortcut (it is a ride, not a puzzle).

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
6. Grinding: Mara has no steering, so the camera swings behind the direction of travel (yielding
   to the mouse for 0.6 s after any look input), stands back 1.2 m further and widens 6°.
7. Framing per mode (`MODE_FRAMING`, added to the zone's): swimming 0.6 m closer and 0.45 m lower
   (the waterline in the lower third); on the swing 1.3 m further back, 0.5 m higher and 5° wider
   (the whole arc and the wall in view); on the slide 0.8 m back and 5° wider. The ladder and the
   skiff keep their framing (the skiff has its zone).
8. A long fall lowers the aim with the fall speed (up to 1.1 m, from 0.3 s into the fall), so the
   landing comes into view in time; an ordinary jump never moves it.

## Game feel (Phase B of the overhaul; implemented, unreviewed)

The plan and its reasons: [MOVEMENT_2_0.md](MOVEMENT_2_0.md). Tuning lives in `FEEL`
(`src/player/feel.ts`) and `MODE_FRAMING` (`src/camera/ThirdPersonCamera.ts`). All of it is
visual or audible only: the capsule, the physics and the controls are unchanged.

| | |
| --- | --- |
| Air poses | Rising, apex (a small tuck) and falling (arms up and out, a leg reaching down) blend by vertical speed; faster than 9 m/s from about 3.5 m down, the arms windmill and her face turns worried |
| Squash and stretch | A spring on her height (ω 22 rad/s, damping 0.42), volume kept: take-off stretches to 1.09, the double jump 1.06; a landing squashes in proportion to impact (none under 3 m/s, 0.80 at 16 m/s and above); a ground pound lands with the full squash. Measured in the lab: a standing jump 1.093 up, 0.904 on landing; the 10 m drop 0.815 |
| Head bump | Rising faster than 2.5 m/s into a ceiling: a flinch (CC0 `Hit_Head`), a surprised face, a small squash, a soft bump |
| Landings | By impact: under 3 m/s nothing; then the material's landing sound; over 8 m/s a small camera shake; over 12 m/s the heavy landing. The landing now knows what she landed on (the ground probe runs again at the landing; before, landings always sounded like stone) |
| Footsteps | Stone, metal, wood, grass, gravel, sand, and wading (shallow water, a splash and a ring). Colliders are tagged in the level; large painted slabs answer `surfaceAt` (Chapter Two's lawns, lane, garden paths and yard) |
| Swimming | CC0 clips: treading water when slow, the crawl when moving (laid forward), its rate following her speed |
| The skiff | CC0 `Driving_Loop` instead of the bench-sitting clip |

### The movement lab (`?lab=1`)

A plain yard outside the story for tuning and tests (no Watch, one checkpoint, falls come back to
the start). Stations: gaps 1.5, 2.0, 2.8 and 3.3 m (the last one is the running jump's limit; the
scripted lap takes it with the double jump); ledges 1.2, 1.8, 2.2 and 2.6 m (the last needs the
double jump); vault blocks 0.5 and 0.9 m and a 1.2 m climb; a tower of 34° ramps to landings at 3,
6 and 10 m with open edges to drop from; seven footstep pads; a low beam; a pound plate; a pool.
Each station has a sign.

## Chapter One, *The Quiet Cell* (implemented)

### Opening (skippable, about 39 s)

An in-engine scene, letterboxed, with captions in the lower third:

1. **Saltmere, the night before.** Mara's workshop: rain on the window, the harbour lights beyond,
   an oil lamp, a model tide engine. She sits at the bench. *"Mara Venn keeps the tide engines of
   Saltmere running."*
2. Over her shoulder, the plans: *DIVERSION No. 7*, the low quarter circled in red pencil, crossed
   out, *"floods at high tide!"*. *"Today she was ordered to sign off a flood diversion that would
   drown her own district at the next high tide."*
3. Side on: she fights sleep, jerks awake, and loses. *"She refused, and stayed up to prove the
   plan was wrong."*
4. Past her to the window: a figure in a long coat and cap walks up, stops to look in, walks on.
   A door creaks. The lamp gutters and goes out.
5. Black: *"She woke up somewhere else."*
6. The cell, by moonlight: Mara asleep on the floor. The Warden's horn: "Pressure cycle in
   progress. All cells remain sealed." She gets up: "Where... This isn't my workshop." She looks
   around: "Salt on the walls. That engine thump... I know this place. Breakwater."
7. Title: *Chapter One, The Quiet Cell*: "The prison runs on the tide. So will her way out."
8. Control, and the objective "Open the service hatch". Mara notices the fresh copper.

Space, E or A skips to step 8 in the same state. The workshop is a set built away from the prison
and shown only during the opening; it borrows two of the cell's lights (adding lights would
recompile every material) and dims the moon and sky light meanwhile.

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

### Secrets and toys (optional)

Five chalk **"IV" marks** sit off the main path, each faintly lit with a glint every few seconds.
Mara glances at the ones she hasn't found; each pickup chimes, counts ("Chalk mark "IV" · 2 of
5") and gets a short line from her that builds toward the ending's "Ivo. It has to be." The end
card shows how many were found.

| Mark | Where | What it asks |
| --- | --- | --- |
| 1 | Beside the tally marks over the bunk, in Mara's cell | Look around before leaving |
| 2 | On a shelf high on the breach wall above the far landing | A double jump (a single jump falls about 0.4 m short) |
| 3 | Low on the lookout's left wall | Look around at the lookout |
| 4 | Under boards nailed over a hatch, in the tier-one dead end left of the scaffold (a chalk arrow points at them) | A ground pound (jumping on them does nothing; Mara hints after a while) |
| 5 | Inside a tier-three cell whose bars someone bent open (a bedroll and a candle) | Walk in on the way to the ram |

The **steam whistle** on the pier by the scaffold sounds a three-pipe chord with a plume of
steam. Mara apologises the first time; on the third pull the Watch logs the pressure loss.

**Area titles** name each space the first time Mara enters it: the Maintenance Shaft, the Turbine
Hall, the Breathing Engine, the Breach.

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

1. **Down into the hall**, two ways. The **feed pipe**: a broken brass pipe bolted at the
   lookout's edge (right of the rope gate) and hung from the roof on chains; stepping onto it
   grinds about 20 m down, out over the void and round in front of the engine, and back over the
   tier-one railing at side 1 (about 3 s, sparks, the camera standing back). Or the **drops**:
   lookout → scaffold (2.0 m) → tier-1 walkway (2.6 m). Left of the scaffold, tier one ends after
   a few metres at a collapse (the boards and a chalk mark are there).
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
   breach ram carry her up 3.4 m, then makes a broad jump of about 2 m onto the exit gantry.
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

- **Goal:** get past the steam and up to the exit gantry, 3.4 m above the walkway (beyond a double jump), at the breach.
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

- **Four chapters.** The owner's 2026-10-16 brief lists four chapters (prison escape, abandoned
  playground, coastal escape, arcade mystery). The playground became Chapter Two, on the spur where
  the hangar from Chapter One's ending stands: Breakwater's old warders' village. This replaces
  *Wings in a Cage* as Chapter Two; the hangar is still the destination (see the outline).
- **The player character.** The brief asked to replace Mara with a Minion. Minions are Illumination's
  characters and cannot be used; at the owner's choice, Mara became an original toy-like hero
  ("between a Minion and an It Takes Two character"), with a living face.

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
