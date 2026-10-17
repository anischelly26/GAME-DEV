# IT TAKES ONE — The Living World & Signature Adventure Plan

**Status:** Creative director's proposal / playable-scene design, 17 October 2026. **Not implemented. Not playtested.**  
**Stack:** Draft PR #8 (`claude/game-feel`) is the baseline. This document does **not** supersede `STORY_CONTINUITY.md`, `CHARACTER_BIBLE.md`, or the movement work already implemented in PR #8. It adds concrete scenes, interactive beats, creative priorities, and acceptance gates.  
**Evidence:** Owner's 308.5 s gameplay recording (sampled frames), `docs/OVERHAUL_AUDIT.md`, `docs/STORY_CONTINUITY.md`, `docs/CINEMATIC_VISION.md`, and PR #8 metadata. This is not a controller-in-hand playtest.

## North star

**A tiny mechanic who understands machines better than people must escape a prison and decide whether escaping is enough.** Breakwater is a living clockwork coastline. The same tidal pulse that locks the prison moves lifts, lights the lighthouse, raises the skiff, and ultimately threatens Saltmere. It should feel **one connected world**—not three independent mini-games.

Use *It Takes Two* only as a bar for the craft of readable 3D movement, theatrical composition, surprising gameplay, environmental animation, character chemistry, and pace. No copied characters, environments, scenes, dialogue, music, assets, or unique designs.

### Five design rules

1. **Player does the spectacular thing.** A cutscene may establish stakes or reveal a destination, but a big jump, escape, boat crossing or mechanism activation must remain playable.
2. **One mechanic, three payoffs.** Introduce safely; twist it under light pressure; combine it in a signature set piece. Do not add gadgets that have only one use.
3. **Every objective has a physical reason.** A locked gate has a pressure latch; the plane cannot fly because its accumulator is missing; the lighthouse signal controls the governor.
4. **Life without clutter.** World movement and a few memorable characters matter more than hundreds of decorative static props.
5. **No beauty tax on controls.** Camera moves must preserve landing visibility; animation anticipation cannot delay button response; Low preserves every required gameplay cue.

## Current state and problems visible in the recording

- 0–36 s: black interstitial text between workshop and prison. **Upgrade:** 3–8-second interactive wake-up, sound continuity, hands and canister visible, a character reaction—not more text screens.
- 54–75 s: lonely moonlit lookout with a distant plane/hangar. **Upgrade:** another actor enters the scene, tangible immediate danger, an actual physical route out.
- 90–110 s and ~198 s: dense rails, narrow industrial corridors. **Upgrade:** landing highlights and framing that explains depth; expose the 3D silhouette of the machinery.
- ~126 s: bare-looking playground swing in a large stone yard. **Upgrade:** make it a spectacular three-part challenge with a huge reveal after success.
- 144–180 s / 288–308 s: sparse ocean with similar rounded dark rocks. **Upgrade:** coastline layers, water-scale cues, varied clusters, wake/foam and a strong lighthouse approach.
- 216–235 s: repeating village facades and conspicuously bright uniform hedges. **Upgrade:** varied profiles, an abandoned-community backstory expressed in garden details, more nuanced foliage color.
- ~228–252 s: completion card and loading interrupt the adventure. **Upgrade:** shots with a visual match across a masked reload. Keep the chapter buttons for optional replay.

**Do not lose sight of PR #8:** it reportedly already implements separate jump poses, squash/stretch, swim/drive clips, material footsteps, swing/slide/swim camera framing, and `?lab=1`. Inspect its actual HEAD before proposing duplicate work. Its status also reports intermittent **240–825 ms frames** in Chapters Two/Three that are still undiagnosed. Investigate stalls before heavier visual effects.

## Story spine — keep the existing proposal, deepen the delivery

Current proposed canon in `STORY_CONTINUITY.md`:
- Mara's mother **Edda Venn** designed the tidal governor and the lighthouse pilot; Mara knows her pattern without realizing it.
- **Ivo Brannock** was Edda's apprentice; he leaves route marks and repairs for Mara.
- **Sorn** abducted Mara because her calculations can unlock his plan to redirect the surge away from Breakwater and into Saltmere.
- **Pip**, a small salvaged gauge creature built by Ivo, follows Mara; his gauge needle carries Edda's spiral.
- The Pier Arcade hides Edda's original pattern drum; the plane remains a future destination.

This proposal is already in the repository but not in gameplay. **Owner approval remains required before these plot answers become canon.** This document designs the emotional and mechanical payoff if approved.

### Theme

> "A machine can tell you what will happen. It cannot decide who deserves to be saved."

Mara begins wanting only freedom; gradually she learns Sorn is preparing to sacrifice her hometown to save the island. Pip learns courage; Ivo must admit what he concealed; Sorn remains articulate and frightening precisely because his plan has a cost-benefit logic.

### Continuity anchors to plant early

- **The spiral**: drawn in Mara's workshop, engraved on the steam kicker, traced in Pip's needle, performed by the lighthouse beam, present in an arcade automaton.
- **The breathing pulse**: heard through floors in Chapter One, physically powers the village relics, lifts water in Chapter Three, animates the arcade's cam-based attractions in Chapter Four.
- **Copper repairs**: fresh and distinct from corroded green brass; visual fingerprint of Ivo. Player learns to recognize help without a quest marker.
- **A child's picture**: "Papa keeps the light" in the empty playground. Sets up why the lighthouse matters beyond navigation.
- **The seaplane**: seen Chapter One, approached Chapter Two, found disabled, revisited in a later flight chapter; don't promise flight and then forget it.

## Chapter One — Escape becomes a relationship

### Emotional shape
Imprisonment → ingenuity → mastery → brief hope → a tiny stranger and a much bigger mystery.

### Scene 1: Wake-up with agency (30–60 s playable)
- Fade from workshop lamp-out to close shot of Mara's hand on wet stone. Distant engine pulse plays continuously across the cut.
- The player **moves the stick / presses interact** to make Mara sit up; not a 30-second unskippable cinematic.
- She sees a new copper elbow joint on her cell feed and recognizes that someone intentionally repaired it.
- A Watch makes a mundane patrol announcement. The hatch pressure flickers exactly when the engine breathes.
- Player can examine a small drawing with her distinctive spiral and hear a two-second memory of Edda humming, but cannot read the whole backstory.

**Acceptance:** first interactable state within 10 s after skip, no long text interstitial, skip safely returns camera/control/checkpoint.

### Scene 2: The Pressure Choir — exploration puzzle with payoff
- Three adjacent pressure pipes resonate at different tones when struck by the governor. Player opens shutters to line up pulses and vent one locked pressure door.
- The puzzle uses **visible needles, steam and sound**, not arbitrary colored lever sequences. Hearing is helpful but not mandatory (visual pressure gauge cues).
- The final correct alignment briefly turns the machinery into a little musical phrase. Mara recognizes the same rhythm from her workshop.

**Not a new power:** remixes the existing causal pressure systems.

### Scene 3: The Breathing Run — playable escape (75–110 s)
- A Watch spots Mara while she starts the final feed split. Sorn orders the pressure section sealed rather than hurting her.
- The engine begins a predictable three-pulse destabilization. Every pulse changes one lane's affordances: (1) a moving collar rises, (2) a loose pipe becomes a grind rail, (3) a ram vents and creates the exit launch.
- Players use sprint, grind, double jump and dash in a route whose landing targets are always visible. Safe recovery checkpoint between acts.
- Cinematic camera frames the next landing during a launch, while **the player controls all jumps**.
- Music adds one layer per successful stage; Sorn's speech cuts out as the sea vista opens.
- Last beat: one playable jump through steam to the lookout. **No QTE; no taking away control in midair.**

**Fairness:** the pressure sequence can retry without restarting the entire hall; don't use instant arbitrary deaths; warnings via machine motion, audio and lighting at least one full pulse early.

### Scene 4: The Pip encounter + 1→2 bridge (15–25 s scene and 20–40 s playable)
- Mara spots the seaplane. She reaches for the distant hangar as though it's already freedom.
- A small damaged brass pressure gauge falls from a service cable, clangs, and pretends to be inert. Mara notices its single rescued Watch eye.
- The Watch horn cuts across the joke; she thinks Pip is an alarm. Pip frantically points to the cable, then clings to her steam canister.
- Mara: **"You aren't a guard, are you?"** Pip blinks twice, misfires a tiny puff. Mara: **"That makes two of us."**
- Player initiates a cable ride; the prison falls away below, the village materializes in the fog. The cable goes out of sight behind a rock/mist curtain; mask loading; matching shot from the cove.
- Do not replace this with a "Chapter completed" overlay. Optional recap sits in pause/chapter-select.

### Distinct chapter look
Moonlit industrial blues, brass and copper spots, amber work lamps, high shafts of steam; foreground grates, midground moving turbine silhouettes, distant coastline light. In hard platforming zones, landing surfaces have one readable value/edge accent.

## Chapter Two — Make the playground unforgettable

### Emotional shape
Freedom looks beautiful → absence and loss → wonder and physical mastery → airfield hope is denied.

### Art direction
Early dawn in a lived-in-but-abandoned warders' village: six distinct house roof profiles (not six clones), sea lavender, overgrown vegetables, laundry pegs, drainage channels, corroded fences, repair scribbles, memorial toys, mist between stone walls. Vegetation varied olive/sea green; avoid repeated neon hedges. Birds and wind animate within a strict budget. No random townsfolk in a supposedly evacuated place.

### Scene 1: Stealth as a physical situation
- The lane Watch checks **sound and sight**. A swinging sign creaks; the player can time a street crossing by that sound and lamp sweep.
- Pip wants to investigate the bright lamp and has to be pulled away: a 4–6 s character beat, not an AI that sabotages stealth.
- Show one alternate path with footsteps on gravel vs soft earth. Player gets one clear safe place before risk rises.

### Scene 2: The Lost Children's Swing — signature multi-phase set piece (90–150 s)
1. **Discovery:** player finds a rusted swing by a faded painted height chart. An abandoned toy catches on one chain and sounds a bell when pushed.
2. **Mastery:** first pumps are forgiving; third/fourth swings visibly increase arc, wind and camera framing. Pip clings to the seat frame and looks terrified.
3. **Complication:** sound attracts the rim Watch. Its lamp sweeps across the launch route; the player chooses when to jump. Hint comes from the motion of the target ledge, not a HUD timer.
4. **Payoff:** at launch, chain sounds and wind swell; camera shows the sea-wall lip and maintains the landing target; Mara may double jump and correct her arc. Pip releases his grip late and catches up in comic panic.
5. **Recovery:** missed jumps have a short retry route with no repeated dialogue; never require an unexplained pixel-perfect pump count.

**Don't fake the jump in a cutscene.** It is the player's triumph.

### Scene 3: A small human discovery
On the upper wall, the player finds the lighthouse keeper's child's drawing and an abandoned lunchbox. Mara does not explain the whole mystery; she simply turns the drawing toward the distant light. Pip's needle makes the same shape as the lighthouse sweep.

### Scene 4: Hangar disappointment and 2→3 bridge
- Reveal plane up close under beautiful late-dawn window light. It is clearly damaged or missing its pressure accumulator.
- Mara tries the starter; every mechanical response is real (ratcheting, pressure loss, one cough of propeller).
- Pip finds an old Ivo-tagged navigation device showing the Knoll Rock pilot light.
- Sorn's Watch enters the yard. Mara escapes through the old causeway access and **physically approaches** the slipway. Mask load as the camera follows a crashing wave; next chapter starts at the same slipway.

**Avoid:** "Plane broken—now go to lighthouse" as a paragraph of text. Show the failure and the reason.

## Chapter Three — Turn open water into a journey

### Emotional shape
Vulnerability in the sea → mastery of skiff and tide → danger → relief → family revelation.

### Scenery specificity
The footage contains many detached spherical rocks and much uninterrupted pale water. Replace some with **clusters of layered rocks**, tide pools, algae stripes, foam at contact edges, small gull activity, distant anchored barges/ruined piers, rocky shelves, a lighthouse that grows in scale through the route. Lighting is bright but must retain shadow gradients and a stable horizon.

### Scene 1: Swimming as character animation
- Show a proper crawl stroke, head turn and intermittent breath. Reuse PR #8's swim clips before commissioning anything else.
- On entry: ripple ring and brief droplets. On exit: 0.5–1 s wet cloth/boot splashes; no fake underwater splash layer above the player.
- Pip **refuses water** at first, hiding under Mara's scarf; when she swims too far it nervously flutters after her. This is a silent character beat and later arc payoff, not a new gameplay hazard.

### Scene 2: Skiff personality
- Steering should be immediately readable: bow yaw, slight banking, wake direction, audible engine load, throttle changes.
- Camera must show buoys AND lighthouse simultaneously where useful.
- Sorn's patrol boat uses the sound logic already in the game. The player learns the tradeoff of throttle/noise and route choice visually. Do not introduce random invisible detection ranges.
- Optional secret: a buoy fitted with copper solder and a tiny IV mark. Pip recognizes it; a safe side path reveals a beautiful sea cave, not a required collectible grind.

### Scene 3: The Rising Bar — signature playable surge (70–120 s)
1. Approach the shallow bar and **feel** the skiff ground with scrape/spray and forward slowdown.
2. A lighthouse bell rings and a sequence of three distant pressure valves vents. Buoys bob visibly higher.
3. Nine-second tide cycle becomes understandable through animation. There is no need for a literal countdown UI.
4. The player **times the surge and steers** around a rock. Wake foams, engine note rises, Watch spotlight crosses the mist.
5. Give a fair second chance if the player misses the surge; no 9-second wait repeated after every failure without an alternative challenge or skip option.
6. Reaching the inner lagoon quiets the music. The player controls docking.

**No automatic water ride masquerading as gameplay.** Simulated wave motion is decorative unless safely tied to actual collision and buoyancy rules.

### Scene 4: Lighthouse as living architecture
- Repair the ugly scan underside visible from the lower stairs with a cleaned/occluding mesh that obeys collider topology.
- Sound design shifts from wind to a ticking copper pilot mechanism; light sweeps through narrow openings as player climbs.
- A small optional lens-alignment interaction makes the final climb feel causally connected to Ivo's signal. Must use a readable reflection/gear mechanism, not brute-force lever guessing.
- At the top, Pip's needle spins with the lamp. He sees his own pattern projected onto the walls; Mara recognizes it as her mother's spiral.
- Ivo recording (brief, not exposition): **"Mara? If you can hear this, the light is still alive. The governor listens to this rhythm. Your mother built the first copy where nobody would look: on the pier."**
- Through the beam, the Pier Arcade flashes to life across the bay. Mara: **"A pier full of machines. She really couldn't help herself."** Pip gives a proud chirp.
- Dusk/night for Chapter Four must be justified by travel time or a clear visual time passage, not a day-to-night teleport.

## Chapter Four — A genuinely original arcade, not a minigame dump

**Status:** pitch only. Do not build before chapter transitions and player feel improve.

The *Pier Arcade* was once an exhibition of Edda's mechanical toys. It wasn't just amusement: these were safe prototypes for the governor. The player sees child-sized versions of dangerous systems they already traversed at full scale.

### Visual identity
Warm incandescent bulbs and turquoise reflected water, wet wooden pier, expressive silhouettes, stained glass, old painted tin, camshafts, whirling shadow lanterns, reflections. The arcade glows like a jewel from the bleak seawall.

### Interactive spine (three stations + revelation)
1. **The Clockwork Theatre:** a mechanical shadow-play showing simplified tides. Player repositions a lens/mirror to make a blocked relief-gate path visible; Pip enters a narrow service compartment.
2. **The Pressure Carousel:** rotating platforms are activated in sequence by water pressure. The player uses familiar jump/dash/grind abilities while the room reveals its mechanical guts; no collectible coin gimmick.
3. **The Memory Drum:** the player rebuilds Edda's spiral timing from clues physically learned in previous chapters (pulse, lighthouse beam, gauge needle). Multiple affordances, forgiving logic, no audio-only mandatory puzzle.
4. **Reveal:** the drum contains Edda's recorded warning that the diversion would shift the flood to Saltmere. The same pattern can instead open a relief channel—if someone reaches Breakwater's crown during the spring tide. Personal freedom and saving home become opposing objectives.

### Seaplane payoff (future, only a story hook)
The missing accumulator might be repaired with an arcade pressure core, making flight a reward of mechanical knowledge. **Do not implement flying here**; reserve it for an owner-approved later chapter and flight design document.

## The world must react — twelve low-cost interactions

These are **prioritized, not twelve promises**. Choose 4–6 and perfect them:
1. A repairable lamp clicks from flicker to warm stability when Mara fixes a pressure valve.
2. Pipes pulse audibly, letting the player infer timing while moving.
3. Pip's glass eye reflects a Watch lamp, making him freeze in fright.
4. Watch guards snap a searchlight toward the swing creak, then misinterpret Pip's squeak.
5. Mara's scarf responds subtly to the approach of a steam vent.
6. A rusted sign swings when a skiff wave hits the pier supports.
7. Birds take off only once when Mara crosses a defined scenic trigger.
8. A playground chime plays Edda's governor rhythm when wind rises.
9. An old house's moving clock pendulum keeps time with the engine despite the occupants being gone.
10. Wet bootprints fade when Mara leaves the water (cosmetic, Low-safe).
11. Pip traces the outline of fresh copper repairs in silent recognition.
12. The lighthouse beam physically illuminates a previously dark arcade facade on the far shore.

## Camera and animation direction — actionable checks

PR #8 has early improvements; the following are **acceptance tests**, not claims it fails:
- During every swing leap, keep the sea-wall target in the frame; no sudden look-at snatch or loss of manual camera control.
- On tight turbine catwalks, camera avoids rail occlusion and doesn't push through geometry. Landings remain visible when falling.
- Give impacts visual hierarchy: tiny hop < double jump < ground pound < ram-launch landing. Never delay input to play an animation.
- Let Mara's face react to **actual gameplay events**: near-miss, landing, alarm, water entry and Pip antics; reactions should be brief and suppressible if repeated.
- Pip always trails outside the camera arm, never collides with Mara, never fires the Watch's stealth alarm without a deliberate scripted moment.
- Preserve independent X/Y sensitivity, inversion, chase assist, accessibility, camera-shake disable, graphics profile.
- Test 16:9 and a narrower viewport. Do not overfit screenshots to a single camera aspect ratio.

## Visual art direction by chapter

| Chapter | Primary contrast | Hero composition | Critical risk |
| --- | --- | --- | --- |
| One | Moon blue / furnace amber | Tiny Mara against enormous breathing mechanism; lit exit beyond | Walls and platforms visually merging |
| Two | Cool sea mist / peach dawn / soft coastal greenery | Swing silhouette framed against the coast; empty village tells a story | Uniform house copies and electric-green hedges |
| Three | Sunlit cyan sea / dark cliff strata / warm lighthouse copper | Skiff small against surf and tower; vertical climb into lens light | Empty open water, same-shaped boulders, unstable reflections |
| Four | Teal sea shadows / red-gold bulbs / deep midnight blue | Arcade facade as a glowing jewel; cam-theatre silhouettes | Overwhelming bloom or copying a recognizable arcade IP |

Each chapter needs three fixed-camera reference shots: arrival vista, traversal challenge, emotional reveal. Compare identical seed/camera shots before and after. Draw calls alone are not evidence of playability; track frame times and stalls too.

## A practical fun budget

For a first **8–12 minute polished route per chapter** (provisional; test with players, don't arbitrarily extend):
- About 35% traversal/exploration with meaningful choices.
- About 25% one signature mechanical challenge.
- About 20% smaller interacting puzzle or encounter.
- About 10% surprising discovery, secrets or character comedy.
- About 10% cinematic and story (mostly while the player has control).

These are design heuristics, not scheduling rules; if an area is exciting, let it breathe. Don't pad level length with repetitive jumps.

## Next production order — do not overwhelm Claude

**P0: Fix interruptions and stalls before spectacle.**
- PR #8 reports intermittent 240–825 ms frames in Chapters Two/Three; inspect `scripts/trace-stalls.mjs` and verify the actual stall causes.
- Validate basic camera and movement through a human hands-on pass; PR #8's successful automated tests are not proof of feel.
- Repair lighthouse underside render geometry if reproduced.

**P1: Build ONE complete connected vertical slice.**
- Implement Pip's simplest expressive rig + follow behavior.
- Implement the Chapter One end → Chapter Two start cinematic with masked reload.
- Include one meaningful joke, one threat, one playable cable ride, and a narrative reason for going to the village.
- Tests: scene completion/skip same state, reload, reset on catch, no Pip interference, no memory growth.

**P2: Give Chapter Two its signature moment.**
- Swing arc/camera/hand contact/creak/Watch anticipation and a beautiful result shot; three uncoached humans must be able to identify what to do.
- Upgrade playground and village visuals around this segment only, then evaluate performance.

**P3: Turn the coast into a scenic route.**
- Water/shoreline material and geometry upgrades plus cinematic tidal crossing; don't change skiff rules just for visual effect.
- Distinct Chapter Two/Three sound beds; maintain Low GPU cues.

**P4: Story through Chapters Two and Three.**
- Hangar accumulator reveal and route to skiff.
- Lighthouse recording and arcade teaser.
- Character interaction and dialogue, without exposition dumps.

**P5: Chapter Four preproduction.**
- Greybox the theatre and pressure carousel; no full production until above passes uncoached player evaluation.

## A 30-minute uncoached playtest protocol

Do not brief the player beyond the controls and objective. Use fresh saves.
- First 5 min: record first confusion and whether movement feels responsive.
- Swing: count failed launches, repeated resets, time to infer the pump mechanic, and whether the target ledge stays visible.
- Watch: ask after a catch **why** they were seen, and compare with actual sight/noise rules.
- Water: ask what announces the surge, whether skiff grounding is understandable, and where they intended to steer.
- Chapters: ask **why** Mara goes from one place to the next; a player must answer from the game, not a design document.
- After play: ask "What was your favorite moment?" and "What was frustrating?" unprompted.
- Log errors with timestamps and severity. Three people is an initial signal, not statistically representative proof of universal fun.

## Claude implementation instructions

1. Read this document with `OVERHAUL_AUDIT.md`, `IMPLEMENTATION_ROADMAP.md`, `STORY_CONTINUITY.md`, `CHARACTER_BIBLE.md` and `CINEMATIC_VISION.md` on PR #8. Do not undo Phase B.
2. Confirm the source head and current test baseline. Do not claim to have played the game without playing it.
3. Work on an appropriate fresh `claude/*` branch stacked on PR #8; draft PR only; don't merge or force-push; don't edit Codex reviews.
4. Start with a **single Phase C milestone**: the Chapter One ending + Pip prototype + cinematic masked transition to Chapter Two. No other new power or chapter.
5. Implement code and tests in reviewable commits. Keep no-voice alternatives and dialogue subtitles; record licenses for any assets.
6. Record before/after videos of **the exact same route** for comparison. Preserve skippable cutscenes, checkpoint correctness and test hooks.
7. Run actual build, unit tests, and Edge E2E. Measure frame times in the affected scenes on available GPUs. Report measured results and unsolved issues honestly.
8. Invite the owner to approve the major plot reveals before adding Edda/Ivo/Sorn answers to game dialogue.

### Definition of done for first new milestone

A player can finish Chapter One, meet Pip, survive the Watch interruption, **ride toward the village while controlling Mara**, reach Chapter Two without a disruptive menu, regain movement without a camera snap, and understand why the journey continues. Skipping the cinematic leads to an identical valid starting state. The first-time route is visually stronger in a before/after capture. A human tester confirms the controls are clear; automated tests verify transitions and regression protection.

**Hard non-goals:** a random alien unrelated to the world; another five movement powers; an endless cutscene; an 'It Takes Two' level copy; a claim of finished AAA polish after passing deterministic Playwright tests; a premature Chapter Four build.
