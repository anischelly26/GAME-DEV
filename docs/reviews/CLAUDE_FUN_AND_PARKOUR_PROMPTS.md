# Claude follow-up: fun, parkour, and memorable missions

Creative-owner follow-up, 2026-10-14. Read alongside CLAUDE_DESIGN_PROMPTS.md. This adds design targets, not verified gameplay or approval. Keep the first playable scope intact. Introduce these ideas through small tested increments after the foundation works.

## 1. Translate inspirations into original play

The owner wants the excitement of established adventure games and more parkour. Borrow broad design principles: a clear destination, fluid traversal, readable danger, physical cause and effect, escalating combinations, and a spectacular payoff. Create our own spaces, timing patterns, puzzles, characters, dialogue, and art. Do not reconstruct another game's identifiable mission or use its assets.

For each proposed encounter, describe the intended player feeling and underlying mechanic before building. "I understand the machine and use it against the prison" is useful. "Make it like a famous level" is insufficient. Favor player-controlled spectacle over cutscenes and forced movement.

## 2. Make movement enjoyable before making it difficult

Develop a compact traversal vocabulary in this order: run and jump; forgiving low vault; ledge catch and pull-up; short safe drop; moving-platform ride. Add a contextual wall rebound only if ordinary traversal already feels excellent. Do not turn the campaign into a collection of traversal systems that receive no development.

Use camera-relative steering with consistent behavior when the camera rotates. Jump immediately on input, with buffered presses and a brief edge grace period. Let the player correct a landing in the air without changing jump range unpredictably. Sprint should add useful momentum without being required for every small gap. Offer hold or toggle sprint if feasible.

Ledge catches must use clear eligibility rules: reachable height, sufficient top clearance, valid surface, and a safe final capsule position. Decorative pipes and arbitrary wall textures are not automatically climbable. Keep catch assistance within a documented range; it must not pull the player through walls or onto a hazardous surface. Never turn an intentional drop into an unwanted grab repeatedly.

Give vaults and pull-ups brief, responsive animations. Preserve control as soon as safely possible. Provide a cancel or predictable exit for hanging. Avoid a separate button for every traversal move; do not make jump and interaction fight for the same ambiguous target.

Tune obstacles from measured controller capabilities. Record standing and running jump distances, jump height, platform clearance, camera clearance, and stopping distance. Use generous margins on required routes. Reserve near-limit jumps for optional mastery routes and identify them visibly.

Acceptance: five consecutive clear runs of an introductory route with no unintended grabs or collision snags; test intentional edge departure, late and early jump presses, diagonal landings, camera rotation, moving-platform boarding and departure, pause during traversal, and failure recovery. These checks verify reliability; a separate human playtest must assess whether it feels fun.

## 3. Parkour routes should be miniature stories

Build a route with a view of the destination, a safe experiment, a variation, a combination, and a satisfying landing. Example original route: step over a broken grate -> jump to a wide pipe shelf -> vault a low maintenance rail -> ride a slow piston platform -> leap onto the lookout as the ocean opens beneath the view.

Do not put all five moves in the first slice. Its current gap stays simple. Use this expanded route later in chapter one after vaulting and platform motion are independently dependable.

Keep recovery near the failed skill. A traversal checkpoint should let the player try again quickly without repeating solved puzzles, dialogue, or long climbs. Landing areas must be visible before takeoff. Use handrails, paint wear, fixtures, and geometry to convey routes; avoid a world where only brightly painted objects are real.

Provide an optional express route that chains moves while the main route offers stable resting platforms. Both converge before story events. Reward mastery with continuous motion, a new viewpoint, or a short character observation rather than a mandatory collectible.

## 4. Chapter-one set piece: The Breathing Engine

Build this after the initial cell slice is accepted. A huge tidal piston rises and falls beside the maintenance gantry. First show its full cycle from safe ground. A service brake can hold it at a boarding height; once aboard, the player uses an onboard release to ride upward. Broad platforms and rails make the first ride safe.

The next section redirects pressure to stop a steam curtain, revealing a crossing. The final section combines the now-understood piston ride and a broad jump to the exit gantry. Use distinct sounds and visible gauge positions for each stable state. Timing is optional on the main route; a side route permits a continuous timed crossing.

Player payoff: the machine that looked threatening becomes a lift the player commands. At the top, the fortress and harbor become visible through a broken wall. No surprise enemy attacks during the first moving-platform lesson. Checkpoint before the developed crossing.

## 5. Mission upgrade: The Archive on Rails

Make the archive a freight-record room with shelves mounted on maintenance tracks. The player's goal is visible through a grated upper office. Demonstrate one sliding shelf from floor controls; its new position creates a staircase of stable surfaces.

Main puzzle: move one shelf to access a brake release, then move a second to connect the upper walkway. Use fixed track stops and clear occupied-space checks. Never crush the player during a puzzle interaction; halt or warn before an unsafe movement. Keep all controls reachable in every legal state and offer a reset.

Optional clever route: a shelf also blocks a guard's sightline, letting players bypass a patrol while the main path uses a bell distraction. Guards react to the shelf's actual position. The office reveals the evidence through a short environmental scene: district maps and an intentionally disabled safety seal. No lengthy document-reading gate.

## 6. Mission upgrade: The Upside-Down Reservoir

Create a chamber whose drained floor is a walking route and whose flooded upper space becomes a swimming route. Familiar landmarks remain visible between states, so raising water changes the meaning of the same room.

Introduce the water control from a dry balcony with a clearly visible overflow limit. In the low state, players can open a grounded safety latch. In the high state, they float through the newly accessible upper arch. The latch persists. An emergency ladder stays reachable, and no transition can trap Mara beneath a sealed ceiling.

Optional discovery: a floating crate bumps against the arch, showing buoyancy before the main puzzle. If simulation is unstable, constrain the crate along an authored buoyancy path. Avoid underwater crate pushing, intricate inventory, and breath timing in the same introductory encounter.

Payoff: the same oppressive room becomes luminous when surface reflections reach its roof. Air pockets, navigation symbols, and the exit silhouette remain legible.

## 7. Mission upgrade: Steal the Tide

At the harbor, let the player see the skiff before reaching it. Its dry berth is separated from the sea by an elevated channel. The counterweight puzzle raises the boat cradle; a sluice then fills the channel. Teach the two systems separately before their combination.

The departure is player-controlled: board, release the berth, steer into the channel. Start the pursuit only after a safe turning and braking section. A pursuing patrol boat forces route decisions through wide marked lanes, not constant unavoidable damage.

Create one memorable escape decision: the broad gate is guarded, while a side spillway fits the skiff once Mara has opened its sluice. Show this alternative during preparation. Both routes should be playable if affordable; otherwise make the spillway the clear critical route and leave the guarded gate as visible pressure rather than a fake choice.

Checkpoints restore the boat, driver, pursuit state, gates, and camera together. A crash must not leave Mara swimming without a recoverable boat.

## 8. Mission upgrade: The Crane Walk

Use a harbor crane as a vertical traversal landmark. Ground controls lock its arm into a service position; the player climbs a short route and crosses the arm to a cliff maintenance doorway. Build the first crossing with stable surfaces and a generous landing.

The developed challenge changes elevation using a counterweight. Keep controls accessible aboard or provide a mechanical latch that retains the state. A single person must complete every step without an unseen helper. Optional mastery: take a short rail-and-platform route around a guard; main path has wider protected ground.

Spectacle comes from moving over recognizable harbor spaces, with cloth and cables giving scale. Avoid camera shake on precision sections. Do not require balancing minigames merely because the crane is high.

## 9. Mission upgrade: The Wind Orchard

The stormworks contain rows of curved wind collectors resembling metal trees. Fabric streamers show direction, and collector mouths provide large distinctive silhouettes. This makes the gliding region visually different from the pipe-and-stone interior while preserving its engineering identity.

First launch: glide to a broad nearby lawn-like roof. Second: use one updraft to clear a wall. Third: choose between a safer outer loop and a shorter inner route. Finale combines those established elements through a broken collector crown, followed by a forgiving sheltered landing.

On the ground, a wind-vane puzzle changes the route before launch. Give an elevated preview and show airflow continuity. Do not make players guess an invisible wind field. Provide fast launch resets with vane settings retained and an assist option for steering or altitude loss.

## 10. Finale upgrade: A Fortress That Changes Sides

Revisit learned machinery with a new purpose: former security shutters open evacuation paths; redirected searchlights illuminate safe docks; pressure that powered locks now holds back the diversion. Show consequences in the world immediately after each action.

Build the final chamber as three readable stable stages rather than a chaotic collection of every mechanic. Weight braces safety gate -> pressure switches outlet -> stealth passage reaches governor. Place safe observation ground between stages. Save after each committed stable success.

A short final boat run lets the player use the escape route they created. The key payoff is recognition: "I made this possible." Do not add a surprise boss with unfamiliar rules or an unexplained quick-time event.

## 11. Smart enemies and satisfying noncombat options

Guards investigate plausible signals: a bell, an opened service door, or unexpected movement of machinery. Teach one stimulus at a time. Do not let them know the player's position through walls or continue pursuit after a reset.

Design encounters with a safe observation point, an understandable patrol, at least one retreat, and a visible exit. The player can wait for an opening, change the machinery, or use a developed traversal route. Avoid both instant failure on a tiny exposure and guards who ignore obvious movement.

Make alert changes readable with posture, voice, icons, and sound. Search lasts a documented period and has a recoverable end. Critical puzzle controls must remain usable or reliably become available again after an alert. Later defensive combat provides a recovery option, not a punishment for failing stealth.

## 12. Give every puzzle a delightful physical response

Prioritize mechanisms whose results alter playable space: a shelf becomes stairs; water becomes elevation; a piston becomes transport; a shutter becomes cover; wind becomes a bridge. Open doors can be a consequence, but should not be the only payoff.

Before committing a puzzle, answer: Can the player predict the broad effect? Can they test a hypothesis safely? Does failure teach something? Does success visibly change the world? Can required state or props be recovered? If the answer is no, revise the puzzle before decorating it.

Support a few authored alternative solutions where they deepen an already-built system. Do not promise unrestricted physics creativity. The extra solution must be tested, discoverable, and consistent with existing rules. Avoid brute-force switch spam by communicating causal relationships clearly, not by punishing experimentation.

## 13. Style should feel lively, handmade, and readable

Use oversized readable mechanical silhouettes, rounded chipped stone, copper repairs, ceramic valve handles, salt crystals, rope lashings, patched sailcloth, and handwritten inspection marks. Mix strict prison construction with improvised prisoner ingenuity. Repeat a small original symbol language for pressure, weight, water, and wind.

Give regions visual rhythms: cramped warm cell; cavernous blue turbine hall; dusty amber archive; luminous teal reservoir; sunlit coral-and-copper harbor; pale stone and animated cloth on cliffs; storm-blue beacon with warm safety lamps. These are lighting and material directions, not mandatory full-screen color filters.

Animate purposeful details: a gauge needle settles, a latch kicks into place, cloth follows wind, a pipe shudders under pressure, dust falls when a shelf moves. Keep visual effects subordinate to footing and puzzle evidence. Avoid constant screen shake, blooming lights, and particles over every jump.

Humor should come from character and environment: a meticulously repaired machine with a crooked unofficial warning; Mara quietly thanking a stubborn piston after it finally moves. Use restraint and keep jokes out of moments requiring close attention.

Sound makes action tactile: distinct valve resistance, metal lock snap, hollow grate footfalls, and the deep engine pulse. Respond immediately to valid input, then sustain the physical animation. Give failed interactions understandable feedback without repeatedly shouting the answer.

## 14. Pacing and optional exploration

Plan alternating beats: orientation -> safe play -> new problem -> short pressure -> payoff -> breath. After a tense challenge, give space to move freely and see the next destination. Avoid stacking several new mechanics or forced dialogue sequences without a safe pause.

Use one meaningful optional branch per region initially: an overlook, a prisoner repair story, or an alternative approach. Do not pad levels with repeated keys or tiny collectibles scattered randomly. Never require a hidden optional branch for the main story.

Reduce repetition by changing a learned mechanic's purpose: pressure first opens a hatch, then stops a hazard, then powers a ride. Keep each rule consistent. If a route is boring to replay, shorten recovery or cut unnecessary traversal instead of adding rewards to compensate.

## 15. Test fun separately from completion

Ask a first-time tester to play without coaching. Record where they hesitate, miss an input, lose sight of a landing, fail to understand a state change, or stop caring about the goal. Distinguish confusion from deliberate problem-solving. Ask afterward which moment they wanted to repeat and which felt like work.

Suggested targets to validate, not claims: immediate objective understood within the first minute; introductory jumps completed reliably after a safe lesson; failure returns control quickly; puzzle success explained by the player in their own words; at least one memorable player-controlled payoff per mission. Log actual results and revise targets when evidence warrants it.

For every implemented encounter, record tested revision, route, failure recovery, accessibility settings used, observed issues, and follow-up. Test main and optional routes independently. A screenshot cannot establish fun, and a build passing cannot establish reliable progression.

## 16. Concrete next actions for Claude

1. Read both prompt files and inspect current work. State which proposed ideas fit the existing direction and which need adjustment.
2. Finish the current cell puzzle, one simple gap, checkpoint, and completion state. Do not delay this for the full campaign.
3. Verify the current route and provide independent review access.
4. After foundational failures are fixed, add the safe parkour practice route and prototype The Breathing Engine as the next focused increment.
5. Keep later set pieces in the design backlog until their prerequisite systems are stable. For each implementation, choose one player feeling, one principal mechanic, one deliberate payoff, and explicit recovery rules.

This handoff asks for playable craftsmanship, imaginative causal puzzles, and pleasant movement. Report what actually works, what remains provisional, and the exact build that can be reviewed.
