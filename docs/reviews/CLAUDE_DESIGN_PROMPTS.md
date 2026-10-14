# Claude implementation prompt pack — It Takes One

Prepared for the creative owner on 2026-10-14. This is a proposed creative direction and implementation handoff, not an independent playtest or approval. The original user brief remains authoritative. Claude owns implementation; Codex supplies design prompts and independent review. Adapt these proposals to existing work and flag consequential deviations.

## Prompt 0 — Read first and choose the immediate scope

Read this entire pack, repository instructions, existing design documents, and review reports. Fetch and inspect the latest remote state before your next iteration. Preserve local and collaborator changes. At preparation time the local checkout was on `claude/first-playable`, with bootstrap commit `a3264d1` and an untracked package.json; this observation is not a current-state guarantee.

Treat the campaign below as a long-term blueprint. Implement only Prompt 4 in this iteration. Do not build every chapter or replace a working engine to satisfy a speculative design. If your existing implementation uses another compelling direction, explain the fit and reconcile it before replacing content. Keep implementation modular and commits focused. Do not merge or publicly deploy.

Maintain README, GAME_DESIGN, STATUS, TESTING, and asset-license records. Keep this handoff separate from review findings. Deliver the tested commit, launch instructions, actual verification results, limitations, and a draft PR when supported. Do not report Codex approval without a real independent review.

## Prompt 1 — Original world, story, and emotional direction

Build an original single-player prison escape set in Breakwater, a fortress built around a colossal tidal engine. Its prison cells sit above turbines, flooded service tunnels, a freight harbor, and cliff-mounted storm defenses. The same machinery that powers confinement can create the escape route.

Protagonist: Mara Venn, a former municipal tide-engine mechanic. She was imprisoned after refusing to certify a deliberate flood diversion that would destroy her home district. She knows ordinary machinery, but the prison's military modifications are unfamiliar; let the player discover solutions rather than making Mara explain everything immediately.

Escape matters because the diversion will activate at the next high tide. Mara must carry evidence off the island and disable the diversion. The stakes give her a reason to turn back toward dangerous machinery when a boat first offers personal escape.

Opponent: Warden Sorn and the fortress's automated Watch system. Sorn values control and treats people as expendable parts. Show his priorities through work orders, abandoned safety systems, prisoner repairs, and brief announcements. Avoid constant villain monologues.

Supporting character: Ivo, a maintenance prisoner who has left repairs and route marks. He can speak through a damaged maintenance intercom at a few checkpoints. He never becomes a second playable character or a remote operator required to solve puzzles. His fate and trustworthiness remain uncertain until later.

Opening: begin in the playable cell, with water tapping a pipe and a maintenance hatch vibrating during a pressure cycle. Immediate objective: open the service hatch. A scratched note says, "Pressure does the lifting. Give it somewhere to go." No long opening cutscene. Early unanswered question: why is a freshly repaired pipe connected to Mara's cell?

Story tone: tense but hopeful, inventive rather than grim. Mara responds to a discovery with a short human remark; silence should carry most traversal. Use no borrowed characters, dialogue, signature scenes, or level layouts from other games.

## Prompt 2 — Connected island map and spatial design

Design the world as a readable vertical journey with loops and changing landmarks. The first cell block overlooks a distant beacon, turbine chimney, and harbor crane. Later, players reach those landmarks and can look back toward the cell block. Keep the ocean horizon as a stable orientation cue when outdoors.

Main route:

Cell block -> maintenance spine -> turbine hall -> archive/security workshop -> flooded cistern -> freight harbor -> cliff stormworks -> beacon crown -> outer tidal channel.

The archive sits beside the machinery, because engineers need access to operating records. The cistern drains toward the harbor. The harbor's cargo lift leads up to the stormworks. Cliff updrafts and maintenance gliders connect the stormworks to the beacon. The final diversion controls belong in the beacon crown, overlooking the channel they govern.

Plan eight connected missions. They are a production scope proposal, not a promised completion time. Chapter one alone eventually targets 10–15 minutes; establish its actual duration through playtests. Give each region a safe introduction, a developed problem, and a signature challenge. Unlock short return paths when useful; do not force repeated empty walks.

For each region, create a top-down route diagram and vertical section showing entrances, exits, sightlines, safe ground, hazards, puzzle dependencies, checkpoints, and optional paths. Use the project's own documentation format. Validate dimensions against the real movement controller, including jump distance, standing clearance, interaction reach, and camera space.

Use a critical path with one optional discovery branch per region at first. Optional finds reveal people and history or offer a tactical alternative; they must not become required hidden keys. Ensure optional exploration always returns to a readable route.

## Prompt 3 — Gameplay, cleverness, and puzzle language

Core loop: observe a working system -> test a safe interaction -> understand its rule -> change its state -> use the resulting opportunity -> discover the consequence. Each major interaction needs visible motion, sound, and a clear effect. Use reusable physical verbs: move, turn, redirect, brace, release, climb, distract. Avoid unexplained magic terminals and arbitrary three-switch sequences.

Make smart play arise from causal systems. Water pressure opens mechanisms but can flood routes. A counterweight can lift a platform or block a sensor. Loud machinery masks footfalls but changes patrol sightlines. Wind is both a movement aid and a hazard. Reuse learned rules with new relationships instead of adding a new gadget to every room.

For every puzzle, document: goal; visible clue; initial state; player actions; legal state transitions; feedback; solution; optional alternative if affordable; invalid actions; reset behavior; checkpoint persistence; accessibility support; and softlock prevention. Never allow a required movable object to disappear into unreachable geometry. Provide a reset where recovery cannot be natural.

Hints: an objective reminder first, then attention toward the relevant evidence, then an explicit causal hint. Make hints optional and do not automatically solve the puzzle. Convey information with shape, motion, symbols, and sound as well as color. Separate puzzle difficulty from precise timing; provide a generous timing or assist option for later timed systems.

Movement: prioritize immediate direction changes, predictable acceleration, a buffered jump, a short grace period after leaving an edge, consistent air control, and readable landing animation. Tune values through actual play. Do not add climb, grab, swim, and glide simultaneously. Decorative geometry must not snag movement.

Camera: player-controlled orbit, collision-aware distance, smooth return after obstruction, and a clear view of landings. Avoid passing through walls, hiding the protagonist, or turning automatically during a committed jump. Confined spaces need enough framing to show the character and target, with an optional recenter. Pause and loss of focus must release input safely.

Stealth, later: guards have visible facing, readable awareness, search, and return-to-patrol states. Use cues that explain detection. Give the player cover and a retreat route. Every necessary encounter must have a noncombat solution.

Combat, later: start with one guard archetype and a small defensive vocabulary: telegraphed attack, evade, interrupt, and disengage. Mara is an inventive mechanic, not an unstoppable fighter. No enemy health inflation to extend playtime. Avoid mandatory combat until movement, recovery, and camera are dependable.

Checkpoints save necessary puzzle outcomes and a safe spawn. Recovery restores a consistent world, camera, and input state. Do not spawn inside a moving obstacle or keep a gate closed after removing its solution object. Distinguish checkpoint restart from complete chapter restart. Completion should have a clear state and intentional replay action.

## Prompt 4 — Implement the first playable section now

Build a short, attractive slice: Mara's cell, its pressure-operated service hatch, a maintenance landing, one jump over a drainage gap, and a lookout checkpoint that reveals the turbine hall. This is the current scope. Reserve enemies and the larger turbine challenge for the next increment.

Compose the cell with a low bunk, curved pipework, salt-stained walls, a narrow ocean slit, a practical amber lamp, hatch assembly, and believable maintenance damage. Leave clear movement space. Make the hatch and interacting parts readable from the starting view. Use intentional silhouette and lighting; label rough proxy models honestly.

Puzzle: a pressure line currently vents through an open bypass. A wall diagram depicts two states: flow escaping through the vent, and redirected flow lifting the hatch piston. Inspection or interaction reveals the diagram without a pixel hunt. The player closes the bypass valve, then operates the hatch lever. Show the pipe gauge rise and piston lift; the hatch mechanically latches open. Operating the lever before closing the bypass creates a harmless hiss and readable feedback. Reopening the valve after success must not trap the player. Use clear non-color gauge markings and a direction indicator. The puzzle teaches a causal relationship rather than testing random valve combinations.

Traversal: beyond the hatch, a safe landing presents a broken catwalk over a drainage channel. The far landing is visible and well lit. Tune the gap below the controller's reliably achievable jump range, with broad landing clearance and no overhead collision. Introduce jumping on safe ground first. Falling triggers recovery rather than an indefinite fall. Put the recovery point after the solved hatch so a missed jump does not require repeating the puzzle. If automatic ledge assistance is already implemented, validate it; do not make it a new mandatory subsystem.

Ending: cross the gap to a sheltered lookout. Activate a checkpoint with visible confirmation. Reveal the enormous turbine hall and harbor beacon. A brief intercom line says, "The tide turns soon. Follow the service lights." Display a clear slice-complete state and next destination. Do not present the planned chapter as already playable.

Recommended controls to adapt to the established project: movement on WASD or left stick; jump on Space or the controller's primary face button; interaction on E or a labeled face button; mouse/right stick orbit; pause on Escape/menu. Support remapping if already affordable. Show only relevant contextual prompts. Give interactions a forgiving range and avoid accidental reactivation when a button is held.

Acceptance route: launch documented build; enter gameplay; understand the hatch objective; inspect the clue; try the lever in the wrong state; redirect pressure; open hatch; cross the gap; deliberately fall and verify saved puzzle state; finish; restart; verify a fresh initial puzzle. Check wall-facing camera positions and interaction from slightly different angles. Verify pause/resume, focus loss, and restart after completion. Report executed checks separately from code-only checks and unverified cases.

## Prompt 5 — Mission 1: The Quiet Cell, complete chapter one

Only expand after Prompt 4 passes review. Extend the maintenance path into a turbine hall and add one Watch guard. Target 10–15 minutes based on first-time playtests, including existing opening content.

Objective: reach the archive service lift. Develop the pressure rule by letting the player redirect a steam jet that blocks a walkway. An inspection window shows the connection between valve, pressure, and obstacle. Use the redirected pressure to slow a maintenance wheel into a stable crossing state. Do not combine a hard timing jump with a first-time puzzle explanation.

Guard encounter: introduce a patrol across the exit gantry. Players can use cover, or ring a maintenance bell to send the guard toward an inspection station. Show the patrol response from safe cover. The bell creates a lasting useful opening, not a hidden millisecond window. Detection sends the guard into a readable search; capture restarts at the preceding safe checkpoint.

Final challenge combines previously learned pressure redirection, traversal, and observation in a compact room. Reward: the service lift rises, revealing the archive and a flood-diversion map. Checkpoints after cell escape and before the final encounter. No combat requirement.

## Prompt 6 — Mission 2: The Records That Sink

Objective: obtain the diversion record and reopen the drain access. Introduce movable freight weights in the archive workshop. A demonstration lift shows how one heavy object lowers one side and raises another. The main puzzle moves a single accessible weight between marked cradles to align a lift with two floors. The record is found through this route, not by searching every drawer.

Development: use the weight's physical presence to interrupt a security beam while accessing a control station. If weight physics prove unreliable, use constrained push paths and snap positions with honest feedback. Never require carrying an object during a jump.

Signature challenge: open a shutter at the correct lift alignment, using a stable brake to hold the result. The player controls every required action sequentially. Finale reveals evidence that the flood is intentional; draining the workshop opens a route to the cistern. Checkpoint before entering the security puzzle; preserve acquired evidence on failure.

## Prompt 7 — Mission 3: Below the Waterline

Objective: traverse the cistern and restore the outlet toward the harbor. Add swimming only after a separate safe water test. Use predictable entry, surface movement, underwater steering, resurfacing, and readable camera transitions. Teach breath management beside a reachable air pocket; provide a generous or unlimited-breath accessibility option. Do not combine disorienting darkness with a breath timer.

Puzzle: use visible sluice diagrams to lower a flooded chamber for a foot route, then raise water to float a maintenance raft into an inaccessible alcove. Constrain floatable objects so currents cannot strand required props. Show water-level changes on wall markers and reveal air pockets before underwater commitment.

Finale: a controlled current carries Mara through a short outlet while she steers around readable debris and reaches daylight. Provide escape ladders and recovery at both sides of level transitions. The harbor crane seen from the cell now dominates the view. Save at the cistern entrance and before the current passage.

## Prompt 8 — Mission 4: A Boat Without a Tide

Objective: prepare a maintenance skiff and open the harbor route. Teach boat steering, acceleration, braking, and docking in a safe basin with broad turning space. Avoid demanding realistic simulation before controls feel good. Provide recovery if the boat flips, beaches, or leaves the navigable area.

Puzzle: align a crane hook with a clearly marked cradle, load a ballast block onto a dock counterweight, and raise the harbor boom. This reuses the weight rule. Each step is sequential and fully solo. A dock control retains its state; it never needs an imaginary second player.

Twist: the records reveal that the diversion controls are above the cliffs. Mara could leave alone, but continues to protect her district. A brief patrol-boat chase tests learned steering through broad channels, with telegraphed obstacles, forgiving collisions, and a checkpoint immediately before it. End at the cliff cargo landing. Avoid a chase until boat handling is validated independently.

## Prompt 9 — Mission 5: The Hanging Works

Objective: ascend from the cargo landing to the stormworks. Reuse brakes and counterweights to create stable stepping routes. Introduce vertical traversal gradually; do not hide landing surfaces behind the camera. Every required ledge must communicate whether it can be grabbed or stood on.

Encounter: a guard patrols the cargo tower. Options are rerouting a noisy conveyor as a distraction, a cover route, or limited defensive combat after its own tutorial. The final lift puzzle places the player on the same platform as its controls, with an accessible reset and no requirement to hold two remote switches.

Signature challenge: ride a cargo cradle past the fortress wall, with short player-controlled movement on broad surfaces. Stop points offer safe observation. Finale discovers folded maintenance gliders and the beacon approach. Save before the ascent and at the glider shelter.

## Prompt 10 — Mission 6: Borrowed Wings

Objective: cross the stormworks to the beacon landing. Introduce gliding from a low safe launch with a broad landing and visible wind stream. Teach pitch, turning, altitude loss, stall recovery if applicable, and landing through a short reusable practice route. Show wind through cloth, particles, and sound; essential cues must remain readable if effects are reduced.

Puzzle: redirect wind vanes using grounded controls to establish a reachable sequence of updrafts. Preview the route from the launch point. Vane positions persist after launch. Never require controlling vanes while airborne. Optional rings are mastery challenges, not mandatory precision gates.

Finale: pass through cliff arches in a storm break using two previously demonstrated updrafts. Avoid surprise gusts that invalidate player steering. A missed landing resets quickly at the launch with vane state retained. End in a sheltered beacon service bay.

## Prompt 11 — Mission 7: Turn the Fortress

Objective: disable the diversion while opening the outer tidal channel. Bring pressure, counterweight, and readable stealth together in one central engine room. Build the chamber around a visible model of the water routes. Each solved subsystem changes that model and the real surroundings.

Sequence: brace a safety gate with a counterweight; redirect pressure away from the district conduit; use the resulting machinery noise to cross a guarded walkway; reach the final governor. Steps remain stable once completed. The warden tries to override through announcements and visible machine changes rather than a new unexplained boss rule.

Signature puzzle: select the safe outlet based on the previously obtained map, with recognizable district and ocean symbols. Let players inspect evidence in the room. Do not require remembering a tiny symbol from hours earlier. Incorrect routing should visibly warn and remain reversible before activation. The final committed action occurs only after the state is unambiguous.

Reward: the fortress's locks release and the dangerous diversion stops. Show signs that prisoners can evacuate without adding escort AI to the initial scope. Checkpoints between major stable stages; prevent reloads from producing conflicting gate and water states.

## Prompt 12 — Mission 8: The Open Channel

Objective: leave the island with the records. Reuse an opened cargo route to descend to the skiff, avoiding a long empty backtrack. Finish with a short boat escape through the outer channel: steering, known currents, and one clearly previewed obstacle. No brand-new mechanic in the finale.

Give a safe beat after the chase to show the flood has been diverted and the island receding. The beacon changes from a prison searchlight to an evacuation signal. Mara's final line can be understated: "Now they get to choose." Resolve the immediate escape and district threat; leave room for a future story without withholding the ending.

Checkpoints immediately before the final run and a durable completion state. Show replay and return options. If persistent saves exist, verify completion survives restarting the application.

## Prompt 13 — Art direction, animation, audio, and readability

Style: stylized maritime industrial fantasy with rounded masonry, heavy iron silhouettes, ceramic pipe collars, woven cloth, weathered copper, and curved machinery. Mix human repair marks with oppressive mass. Avoid a uniform box warehouse or visual noise on every surface.

Palette: cold ocean blue and oxidized teal for the fortress; amber for practical work lights; warm coral accents on Mara's scarf and maintenance repairs. Reserve strong hazard contrast for danger. Interaction meaning must also use shape and motion. Later regions expand the palette while keeping common materials and repeated architectural motifs.

Mara: readable adult silhouette, cropped mechanic's jacket, practical boots, tool belt, and a scarf whose motion helps show speed and wind. Prioritize convincing idle, run, jump anticipation, airborne pose, landing, and interaction. No elaborate character wardrobe before basic motion is stable.

Composition: frame a destination at the entrance of each space; alternate confinement with release; keep floor edges and jumps distinct from background detail. Use warm light to lead toward maintainable infrastructure, with occasional deliberate deviations explained by damage. Dress spaces with purposeful objects: improvised repairs, tide-height stains, confiscated belongings, damaged safety signs. Every detail should support place, story, or navigation.

Lighting: readable shadow depth, restrained fog, and balanced exposure. Do not obscure puzzle evidence to make a room dramatic. Use small lighting fixtures where power actually runs. Check screenshots at the tested resolution and on reduced settings before calling the scene visually finished.

Audio: footsteps distinguish stone, grate, and wet metal. Pressure hiss, valve resistance, latch impact, distant surf, and turbine rhythm communicate states. Fade machinery intensity with distance and walls when feasible. Add subtitles for story dialogue and useful visual equivalents for essential sounds. Maintain separate music, effects, and dialogue volume controls when audio ships.

Use original procedural meshes or properly licensed assets, recording source and license. AI-generated concept images are reference until an asset pipeline is established; do not treat attractive concept art as evidence of finished in-game visuals.

## Prompt 14 — Production gates and evidence for independent review

Gate A: first slice movement, camera, puzzle, gap, recovery, and completion. Gate B: complete chapter one with turbine obstacle and one stealth enemy. Gate C: weight puzzle and evidence story. Gate D: water prototype and integrated cistern. Gate E: boat prototype and harbor. Gate F: advanced vertical traversal. Gate G: gliding prototype. Gate H: integrated finale. Each gate needs a playable review before additional systems increase complexity.

For the immediate gate, report the engine/runtime and launch commands, branch and SHA, exact test route, supported input, tested environment, and defects. Measure performance only with a named device, resolution, quality setting, and actual measurement method. Record console/runtime errors and any progression failures. Never infer a successful playtest from a successful build.

Requested Codex review priorities: movement response and collision; camera near walls and landings; clue comprehension without coaching; interaction reliability; puzzle recovery and repeatability; checkpoint consistency; completion/restart; and visual readability. Later reviews expand to the relevant new systems. Fix crashes, blocked progression, and control/camera failures before cosmetic polish.

Now continue implementation of Prompt 4 using the established project. Acknowledge this handoff, identify any conflict with current work, and deliver the smallest coherent playable result with honest verification.
