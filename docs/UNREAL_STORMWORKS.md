# The Stormworks Escape (Unreal Engine 5.8)

A short playable sequence built in Unreal Engine around one new mechanic: **Ivo's maintenance
tether**. It is a separate piece of work from the web game. It lives in the owner's Unreal project
(`ItTakesOne-Unreal/e`, made from the Third Person template), and its code and build scripts are
in this repository (`unreal/Source`, `tools/unreal`). You play **Mara**, the web game's toy hero,
with her own animation.

**Played by whom:** only by the scripted self-test bot (below), in the real game window with real
rendering. **No person has played it yet, and nobody has listened to its sound or music.**
First-play length, difficulty, how the tether feels in the hand and whether the music fits are
unknown until someone does.

Two passes so far:

- `claude/unreal-stormworks` (PR #12): the tether, the six beats, the self-test.
- `claude/stormworks-mara-sound`: the owner's "researched resources" brief. It added:
  - Mara as the playable hero;
  - recorded sounds and footsteps by surface;
  - the toy, the washing and the chimes;
  - three cinematics with one finishing rule;
  - music by mood.

  See *What this pass adopted* below.

## Open it

1. Open `ItTakesOne-Unreal/e/e.uproject` (or the desktop shortcut "It Takes One (Unreal)"); it
   opens on the Stormworks map.
2. Press **Play**. The level sets its own game mode (World Settings → GameMode Override =
   `StormworksGameMode`). The opening cinematic plays first; Space skips it.

## Controls

| Action | Keyboard and mouse | Gamepad |
| --- | --- | --- |
| Move, look | WASD, mouse (the template's) | Left stick, right stick |
| Jump | Space | A / Cross |
| **Tether** (fire at the targeted ring); read a note, close it; wind Ivo's toy | **E** or left mouse | Right trigger |
| Let go while carried (keeps the momentum) | Space | A / Cross |
| Skip a cinematic | Space, Enter or E | A or B |
| Back to the last checkpoint | **R** | View / Back |

The HUD shows the target: a teal ring with "[E] Tether" (an anchor) or "[E] Pull" (a machine), or
a grey ring with "Too far" when the ring you aim at is out of reach. "[E] Read" and "[E] Wind up"
appear in front of a note or the toy.

## The tether

One rule for the player: **a teal brass ring means the tether works here.** Every ring looks the
same; there are two kinds.

- **Pull:** the ring is on a machine (a crate on a girder, a coupling lever, the gate). A tug runs
  the machine to the other end of its straight track, then the cable lets go. A second tug runs it
  back (unless it is one-way; a used one-way machine's ring goes dark). She walks at 30% speed,
  arms out along the cable, while it is taut.
- **Anchor:** the cable carries her along a fixed arc (a quadratic curve that rises above the
  straight line) and sets her down on the ring's landing spot, in 0.55 to 1.5 s depending on the
  distance. Space lets go early and keeps her momentum.

What makes it predictable:

- **What you aim at is what you get.** The ring nearest the centre of the view (within a 26° cone,
  in line of sight from her chest) is the target. If it is beyond the 12 m reach, the HUD says
  "Too far" and firing does nothing (a refusal sound). It never quietly picks another ring.
- **You can see and hear it in three parts.** The cable is visible (a `UCableComponent` from her
  right hand). Pressing the button gives a mechanical release click and a whip as the hook flies
  (0.14 s); she throws with her upper body. The catch and the latch sound only when it has caught,
  and the camera kicks a little. During a carry, the cable's tension rides with her and stops when
  the carry ends. A refusal is quieter, and it is rate-limited.
- **The camera is never taken during movement.** Nothing moves or locks the camera during a carry
  or the climax. The three cinematics start only where she stands still.
- A carry that is blocked (1.2 m behind where the arc had her for 0.2 s) ends where she is, rather
  than pushing her through a wall.
- **A hitch does not throw her off the arc.** Two bugs were found and fixed while testing:
  - A long frame in mid-flight once sent her up to 6 m past the landing. Her movement now ticks
    after the tether in every frame.
  - A long frame that carried the arc past its end once left her in mid-air over the gap. The
    last stretch is now swept before the carry ends.

  The self-test stalls the game on purpose: 0.3 s in the middle of one carry, and 0.5 s two
  thirds of the way through the climax's last carry.

## The sequence

The map is laid out along a seawall running north. The coordinates are in metres: X north, Y east.
The resources brief named a seven-step mood progression. The table shows where each step is in
this layout. (That brief referred to an earlier "production brief" that is not in this repository;
its progression was mapped onto the existing level rather than inventing a new one.)

| Brief's progression | Where it is |
| --- | --- |
| Warm workshop | Ivo's workshop: lamplight, his bench, his wind-up toy; the opening cinematic |
| Playful laundry gallery | The seawall gallery, with the prisoners' washing flapping along the wall |
| Musical discovery | Ivo's wind chimes by his chalk arrow at the break: they ring down the scale as she walks up |
| Challenging crossing | The broken seawall: pull the cargo crate to the edge, stand on it, tether across |
| Spectacular machinery transformation | The storm coupling: the engine-reveal cinematic, the gate grinding open, red alarms |
| Exciting escape | The collapsing catwalk: tether, jump, tether |
| Peaceful rooftop | The signal tower's roof: the rooftop cinematic, the lighthouse, Ivo's note |

1. **The view** (Ivo's workshop). The opening shot starts close to the lighthouse on Knoll Rock,
   its beam turning in the rain. The camera pulls back across the sea to the lit workshop window
   and comes in between the bars to Mara, who is looking out at it. The toy on the bench winds up
   with E.
2. **Learn it safely.** The tether lies on Ivo's workbench (walk into it). A crate blocks the door.
   Its ring is the first one she sees, and nothing can go wrong: one tug slides the crate into an
   alcove. Tug it again and it comes back.
3. **Combine.** The seawall gallery, with the washing along the wall, is broken: an 11 m gap over
   the sea. Ivo's chimes ring as she reaches the edge. The far anchor is visible from the edge but
   grey ("Too far"). A cargo crate sits on a girder across the gap. Pull it to the near edge,
   climb onto it, and from there the anchor is in reach: tether across.
4. **The complication.** The storm coupling ("STORM COUPLING — engage only at high water") is the
   only way through the sluice gate. Pulling it wakes the storm engine. The engine-reveal shot
   follows the gate grinding open, then rises along the old catwalk to the signal tower, with
   red alarms and a louder storm. The catwalk is armed to collapse. The music drops away for the
   shot, then the escape music starts.
5. **The climax** (about 8 s). As soon as she steps on the catwalk, it starts falling apart behind
   her, one segment at a time, each telegraphed by a shudder and a flickering warning light. On
   the way she tethers across one break, jumps the next, and tethers up to the signal tower's roof.
   If she falls, she is back at the gate with the catwalk rebuilt.
6. **Relief.** On the tower roof the rooftop shot looks past her to the lighthouse, now close and
   lit, then round to Ivo's hut. The music turns quiet and hopeful. His note is pinned to the hut
   wall (E to read). It sets up what comes next (the lamp on Knoll Rock, a skiff, the tide).
   Reading it ends the sequence.

**Failure and recovery.** Falling below 7 m under the seawall puts her back at the last checkpoint
(five: the workshop, the gallery, the far gallery, the gate, the tower). What she has solved stays
solved, and R returns to the checkpoint at any time. A restart during a cinematic cancels it
without granting anything. The music only dips for a moment instead of starting again.

## Mara

Mara came into Unreal with the chapters (`/Game/ItTakesOne/Mara`, from the web game's `Mara.glb`):
- 10 skinned mesh parts on one 65-bone skeleton with mannequin bone names;
- 22 rigid parts (eyes, lids, brows, mouth, the scarf's knot, the kit on her back);
- 29 animation clips: the CC0 Quaternius Universal Animation Library clips, already retargeted to
  her skeleton by the web game's import. **No retargeting was needed or done in Unreal.**

- **Animation without an Anim Blueprint.** `UMaraAnimInstance` uses an anim-instance proxy that
  samples and blends the clips in C++. Anim graphs cannot be authored headless; this can be built,
  reviewed and diffed like the rest.
  - **Ground:** idle, walk, jog and sprint blend by ground speed on one shared phase, time-scaled
    to the capsule's speed (the web game's tuning: natural speeds 1.5, 3.9 and 6 m/s).
  - **Air:** the jump start, then the jump loop; a short landing clip, weighted by fall speed.
    During a carry she holds the jump loop.
  - **Upper body:** the throw (part of `interact`) and the pull pose (the middle of `push`) blend
    over the upper body only, from `spine_01` up, so her legs keep walking.

  Animation never moves her: the capsule and the tether stay in charge of where she is.
- **Her size.** She is 1.3 m tall, as in the web game, and the capsule fits her (radius 30 cm,
  half-height 66 cm) instead of the template's 1.8 m.
- **Two import problems, fixed** by `tools/unreal/prepare_mara.py`:
  - Her materials are instances of Interchange's glTF master, which is not flagged "Used with
    Skeletal Mesh", so the game drew her with the default checker material. The master is now
    copied into the project with the flag set.
  - Her rigid parts were imported as unplaced static meshes. They are now named after their bones
    (from the glTF hierarchy) and attached at run time.
- Not ported from the web game: her living face (blinks, looks, expressions), the scarf's swinging
  tails, squash and stretch. Motion Warping was not used: no interaction needs a root-motion
  animation aligned to a target, and the simple poses read clearly.

## Sound and music

- **Recorded sounds** from the Kenney packs the web game already uses (CC0). 64 recordings are
  imported by the level builder:
  - footsteps on stone, wood and metal;
  - soft and heavy landings;
  - light and heavy metal impacts, the latch, the click, creaks, cloth;
  - tin (the toy), bells, glass, pages.

  The synthesised sounds stay where they do their job (the wind, thunder, rain, alarm, rumble, the
  hook's whip, the cable's tension), and some are layered under recordings (the latch, a
  machine's stop).
- **Footsteps come from the animation's foot plants**, not a timer: one per plant, two per cycle,
  and none in the air.
  - The surface under her (stone, wood or metal, from the material) picks the recording, never the
    same one twice in a row.
  - The sound plays at the planted foot, louder with speed.
  - Landings add a soft or heavy impact by fall speed.
- **No pile-ups.**
  - Each machine owns one run sound that rides with it and fades on arrival or reset.
  - Each carry owns one tension loop that stops when the carry ends or she respawns.
  - Refusals are rate-limited.
  - Each chime tube sounds at most every 0.25 s.
  - The music uses two voices for the whole session.

  After a dozen respawns and cinematics, the self-test counts the looping sounds still playing.
- **Music by mood**, driven only by gameplay events. Two voices cross-fade over 2 s (no
  beat-synced scheduling: these tracks share no tempo or loop points, so Quartz would add nothing):

  | Mood | When | Track (CC0, from the web game) |
  | --- | --- | --- |
  | Warm curiosity | The opening ends | "Sci Fi / Adventure / Eastern / Quiet Piano / Loop" (KiluaBoy) |
  | Light forward motion | The gallery checkpoint | "A sailor's chant" (Thimras) |
  | Anticipation | The coupling is pulled | Silence; the engine's own sounds and the reveal's rumble |
  | The escape | The engine reveal ends (watched or skipped) | "Treasure Hunter" (TAD) |
  | Relief | The rooftop shot ends | "Fantasy: Rising Moon" (RandomMind) |
  | A retry | Any respawn | The current track dips for 1.2 s and carries on |

  **The tracks were chosen by their descriptions, not by listening.** They loop without edited
  loop points. Komiku's CC0 album (*Poupi's Incredible Adventures*) was not downloaded. It remains
  a candidate if these do not fit when heard in the scene.

## The playful pieces

Each runs its own short timeline: anticipation, action, settle. None of them collides with
anything or touches anything she stands on. The easing is three small functions in
`StormEase.h`, so no tween plugin was needed.

- **Ivo's wind-up toy** (a tin boat on his bench). E winds it.
  - It rears back while the key turns three clicks (anticipation).
  - It lunges and rolls 28 cm along the bench with a tin rattle (action).
  - It rocks to a stop on a damped curve (settle).

  The next wind sends it back, so it never runs off the bench. Pressing again while it runs does
  nothing.
- **The washing.** Sheets, shirts and towels in faded linen, coral, sea blue and ochre hang on a
  rope along the gallery wall. Each swings on a damped spring toward where the storm pushes it, in
  gusts. Running past sets a piece flapping.
- **Ivo's chimes.** Five brass tubes tuned to D E F♯ A B (synthesised from a hanging tube's
  inharmonic partials), by his chalk arrow at the break.
  - Walking up rings them down the scale, one after another. Each tube pulls back slightly, swings
    as it sounds, and sways to rest.
  - The storm knocks one now and then, quietly.
  - She has to walk away before they ring again.

## Cinematics

Three Level Sequences, built by the level builder, each with a Cine Camera (24 mm, no depth of
field), a keyed camera move and a camera cut:

| Shot | Length | Starts when |
| --- | --- | --- |
| `LS_SW_Opening` | 8.0 s | The level starts |
| `LS_SW_EngineReveal` | 5.0 s | The storm coupling reaches the end of its travel |
| `LS_SW_Rooftop` | 6.0 s | She reaches the tower roof checkpoint |

`UStormCinema` plays them, with one rule for ending them: `FinishSequenceOnce(Shot, Reason)`.
Every ending goes through it exactly once: the sequence finishing by itself, the player's skip,
or a cancellation (a restart, a respawn, leaving the map). Sequencer events are not relied on.
Each time, it:

- restores the gameplay camera (a 0.8 s blend after a completion, 0.35 s after a skip, at once
  after a cancellation);
- gives back the player's input and the HUD (during a shot: letterbox bars and "[Space] Skip");
- ends the shot's own sound.

After a completion or a skip, and only the first time the shot is seen, it applies the shot's
progression: the opening starts the workshop music and a line of text; the reveal sets the
catwalk objective and the escape music; the rooftop starts the rooftop music. A cancellation grants
nothing, and so does a replay of a shot already seen.

## The code

C++ module `ItTakesOne` (`unreal/Source/ItTakesOne`). Each piece is a reusable Actor or Component
placed in the level or created by the game mode; the level has no Blueprint logic.

| Class | What |
| --- | --- |
| `UTetherComponent` | The mechanic: targeting, the Pull and Anchor states, the cable, the three-part sound, input (its own Enhanced Input mapping context, layered over the template's: tether, let go, restart, skip), the camera shake, counters for the self-test |
| `ATetherPoint` | A brass ring: Anchor (with a landing spot) or Pull (mounted on a machine); its glow shows targeted, out of reach, idle or used |
| `ATetherMovable` | A body on a straight track (eased), one-way or back and forth, with its own run sound; the rail has no collision |
| `ATetherPickup` | The tether on the workbench |
| `UMaraAnimInstance` | Mara's animation (an anim-instance proxy; no Anim Blueprint) and `Dress`, which puts her on the template character |
| `UMaraFootsteps` | Footsteps from foot plants, by surface; landings |
| `ACollapsingWalkway`, `ACollapsingSegment` | The catwalk: armed, triggered on entry, falls segment by segment, resets on respawn |
| `AStormDirector` | The storm (lightning, thunder, wind) and the storm engine (the coupling → the reveal, the gate, the alarms, the catwalk) |
| `UStormCinema` | The three cinematics and `FinishSequenceOnce` |
| `UStormMusic` | Music by mood: two cross-fading voices, a duck on respawn |
| `AWorkshopToy`, `ALaundryLine`, `AWindChimes` | The toy, the washing, the chimes |
| `AStormCheckpoint` | A forward-only trigger box with a spawn point and an objective |
| `AStoryNote` | A readable note (the HUD shows it as a paper panel) |
| `AStormworksGameMode` | The template's character and controller, dressed as Mara, plus the tether; respawn, checkpoints, notes, the toy, messages, the cinematics and the music, the end |
| `AStormworksHUD` | Canvas HUD: objective, reticle, target ring and prompts, messages, the note, the end card, the respawn fade, the letterbox |
| `ALighthouseBeam`, `AStormRain` | The turning beam (two spot lights), and rain streaks that follow the camera and stay out of the workshop, the corridor and the hut |
| `AStormworksSelfTest` | The scripted playthrough (only with `-StormSelfTest`) |

## Rebuild it from the repository

From a project made from the Third Person template (C++ or Blueprint), with the editor closed:

1. **The code.** Copy `unreal/Source` into the project as `Source` (on the owner's machine it is a
   directory junction to the repository), and add the module to the `.uproject`:
   `"Modules": [{"Name": "ItTakesOne", "Type": "Runtime", "LoadingPhase": "Default"}]`.
   Build: `Engine\Build\BatchFiles\Build.bat ItTakesOneEditor Win64 Development -Project=<path>.uproject -WaitMutex`
   (Visual Studio 2022 Build Tools with the C++ workload).
2. **The chapters and Mara**: `tools/unreal/import_it_takes_one.py`, see
   [UNREAL_EXPORT.md](UNREAL_EXPORT.md). Then `tools/unreal/prepare_mara.py`, headless like the
   others; it is safe to run again. Without Mara, the template's mannequin stays the hero. Without
   Chapter Three, a plain stone tower stands in for the lighthouse.
3. **The synthesised sounds.** `python tools/unreal/make_stormworks_sounds.py` writes 24 WAV files
   to `ItTakesOne-Unreal/Import/Stormworks/Audio/`.
4. **The level.** `UnrealEditor-Cmd.exe <path>.uproject -run=pythonscript -script="<repo>/tools/unreal/build_stormworks.py" -nullrhi -unattended -nosplash`.
   It imports:
   - the synthesised sounds;
   - 64 Kenney recordings, from `public/assets/audio/sfx` and the git-ignored
     `import-cache/audio/kenney` (`node scripts/build-audio.mjs` downloads the packs);
   - four music tracks from `public/assets/audio/music`;
   - seven Poly Haven texture sets.

   Then it builds the materials, lays out `/Game/ItTakesOne/Maps/Stormworks` (178 actors) and
   makes the three Level Sequences. It takes about 2 minutes here. Rebuilding replaces the map
   and the `/Game/ItTakesOne/Stormworks` assets. Log: `Saved/Stormworks_build.log`.

## The self-test

`powershell -File tools/unreal/run_selftest.ps1` starts the game (standalone, rendered, 1280×720)
with `-StormSelfTest`. A bot plays the whole route through the functions the input calls:
movement input, control rotation for the aim, `TryFire`, `TryInteract`, `Skip`, and the real
Enhanced Input action for restart. Hardware input is ignored during the run, so someone using the
machine cannot skip a shot or fire the tether. The bot takes screenshots, writes
`Saved/StormworksSelfTest/results.txt`, then quits. `-Clip` also saves a frame every 0.1 s through
the opening and the climax, with game time slowed so capture does not starve the game.
`python tools/unreal/make_clip.py --group opening|climax` turns them into GIFs.

**Results** (2026-10-25): 62/62 in the last three runs (one of them with `-Clip`). Earlier runs
of this pass failed for four reasons, all fixed:
- **Two real bugs:** Mara drew as the default checker material, and a carry ended by a long frame
  left her in mid-air over the gap.
- **Two test problems:** a stray click on the game window skipped the opening, so hardware input
  is now ignored; and the audio-loop check had a wrong filter.

Results, screenshots, a before/after sheet and two GIFs (the opening and the climax) are in
[evidence/stormworks-2/](evidence/stormworks-2/). The first pass's are in
[evidence/stormworks/](evidence/stormworks/).

What it checks (62 checks):

- **Cinematics:**
  - the opening plays (its own camera, controls taken) and **ends by itself**;
  - the engine reveal is **skipped half-way**, the rooftop shot **near its end**, and the opening,
    replayed, **at once**;
  - the reveal, replayed, is **cut short by R** (a cancellation).

  After each, the check confirms how the shot ended, that it granted its progression exactly
  once, and that camera and controls are back. The objective and the music after a skip are
  checked too.
- **Mara:** her animation (29 clips) on 10 mesh parts, a capsule that fits her, a close-up.
- **The start:** checkpoint 0 and the objective; Tether does nothing before the pickup.
- **The toy:** E winds it; a second press while it runs is ignored; it rolls 28 cm and comes back.
- **The door crate:** the pickup; the ring is targeted and one tug opens the door. **Repeated
  interaction:** the crate back and off again. **Leaving and returning:** the ring is targeted
  again after walking away.
- **The gallery:** the washing swings and flaps as she runs past; the chimes ring down the scale.
- **The crossing:** "Too far" (and firing is refused); the cargo crate runs to the edge, she stands
  on it, the carry lands her on the far gallery (despite a 0.3 s stall in mid-carry).
- **A missed jump and recovery:** a fall into the sea, back at the far gallery, the crate where
  she left it.
- **The engine:** the coupling starts it, the gate opens, the catwalk is armed.
- **The climax:** a fall rebuilds the catwalk; then a carry, the jump, and a carry onto the roof
  (despite a 0.5 s stall that ends that carry); the roof checkpoint.
- **The note:** in reach, opens (the sequence is complete), closes.
- **Feet and loops:** one footstep per foot plant, on stone, wood and metal; landings; the looping
  sounds still playing after the run's respawns and shots (the wind and the music: nothing piled
  up).
- **The end:** restart from the checkpoint with R; not stuck at the end.

The bot does not hesitate, turn the camera like a person, miss a ring by a few degrees, or try to
break the level. It is a regression check, not a playtest, and it cannot judge how anything sounds.

## Measured

On the owner's laptop: NVIDIA GeForce RTX 2050 (laptop), 8 GB RAM, Windows 11, UE 5.8, 1280×720
window, the engine's default scalability. These frame times come from the self-test's own counter
over the whole run. They include the bot's screenshots and its deliberate stalls.

| Run | Mean frame | Frames over 33 ms |
| --- | --- | --- |
| First pass: Virtual Shadow Maps, volumetric fog on (three runs) | 23.2, 23.3, 23.3 ms (43 fps) | 29, 33, 26 |
| First pass: Virtual Shadow Maps, `r.VolumetricFog 0` (two runs; a third crashed) | 21.9, 22.2 ms (45 fps) | 30, 26 |
| First pass: regular shadow maps, fog on (five runs) | 23.3–25.7 ms | 29–43 |
| First pass, as committed (six runs) | 23.4–25.0 ms (40–43 fps) | 33–84 |
| This pass, with the cinematics (seven runs) | 24.2–30.8 ms (median 27.1; 32–41 fps) | 79–232 |

Volumetric fog costs about 1.2 ms a frame here; it stays on (it carries the lighthouse beams and
the depth of the storm). Every run has at least one frame of 400 ms or more: the engine clamps game
time at 0.4 s, so the real worst frame is not known. These numbers vary between builds and
sessions, and this pass's runs also contain the deliberate stalls, so they are not a performance
claim. This pass's runs are also not comparable with the first pass's: they include 19 s of
cinematics (wide views of the storm and the volumetric beam), a longer route and the stalls, and
the machine was probably in use during some of them (a stray click reached one). Even so, **this
is about 3 ms slower and the frames over 33 ms went up**: it needs profiling (`stat unit`,
Unreal Insights) per segment before anything else is added. Mara's cost was not measured on its
own. Her 10 skinned parts and 22 rigid parts all cast shadows, and turning that off for the
small parts is the first thing to try.

### Shadows

With Virtual Shadow Maps (the template's default), 2 of 9 launches ended in a GPU crash in the
first two seconds: `DXGI_ERROR_DEVICE_HUNG`, an Aftermath page fault in the VSM shader
`CullPerPageDrawCommandsCs`. Regular shadow maps were about 1 ms slower in those runs, but the
laptop was also warming up over back-to-back runs. A crash on 1 launch in 4 or 5 is worse than
1 ms, so the project uses regular shadow maps. That avoids the crashing shader; it does not prove
the cause, and it is a workaround for an engine or driver fault. Since the switch, no launch has
crashed (30 launches: 13 in the first pass, 17 in this one).

## What this pass adopted (and what it did not)

| Resource | Version | Licence | In the project | Purpose | Status |
| --- | --- | --- | --- | --- | --- |
| Quaternius Universal Animation Library 1 and 2 (Standard) | As imported for the web game, 2026-10-15/17 | CC0 | `/Game/ItTakesOne/Mara` (via `Mara.glb`) | Mara's locomotion, jumps, landing, the throw, the pull | Imported earlier; verified in gameplay by the bot and in screenshots |
| Kenney Impact Sounds, RPG Audio | Downloaded 2026-10-16 for the web game | CC0 | `/Game/ItTakesOne/Stormworks/Audio/SFX_*` | Footsteps by surface, landings, the latch and click, metal stops, the toy's tin, pages | Imported; played in gameplay (counted by the bot). **Not listened to by a person** |
| The web game's CC0 music (KiluaBoy, Thimras, TAD, RandomMind) | As in `public/assets/audio/music` | CC0 | `MUS_*` | Music by mood | Imported and wired. **Not listened to in this scene** |
| Synthesised chimes | `make_stormworks_sounds.py` | Original | `S_TOS_Chime_0..4` | The wind chimes | Generated; played in gameplay |
| Level Sequences, Cine Cameras | UE 5.8 (engine) | Engine | `/Game/ItTakesOne/Stormworks/Cinematics` | The three shots | Built headless; verified by the bot |

Not adopted, each for a reason:
- **Epic's Game Animation Sample** (large; motion matching). Mara's own clips cover this
  sequence, and the brief says not to replace the controller.
- **Motion Warping.** No root-motion interaction needs aligning, and the tether owns movement.
- **Fresh Cooked Tweens.** Three easing functions cover the toy and the chimes.
- **Not Yet: Dialogue System.** There is no branching dialogue, and Pip is designed but not built
  in either game.
- **Komiku's album.** The existing tracks were wired first; nobody can choose by ear in this
  session.
- **Quartz.** The tracks share no tempo or loop points, so cross-fades are used.
- **The Sonniss GDC bundle.** Its licence forbids redistributing the sounds, and this repository is
  public; the Kenney packs covered the cues.
- **Kenney Pirate Kit and Input Prompts.** Not downloaded in this pass. They are candidates for
  harbour silhouettes and for prompt icons that follow the current device.
- **Lyra and Audio Insights.** Lyra was not needed. Audio Insights needs the editor UI; the bot
  counts live loops instead.

## Known defects and temporary work

- **Nobody has listened** to the recordings, the chimes or the music in this scene, and nobody has
  watched Mara move except in screenshots and the GIFs. Foot sliding, blend pops and the music's
  fit are unjudged.
- **Mara's face is static** (the web game's blinks, looks and expressions are code there, not
  ported). The scarf's swinging tails are missing. The throw and the pull are clip excerpts, not
  authored poses.
- The music loops without edited loop points.
- **A GPU crash (device hung) in the engine's Virtual Shadow Maps** before the switch to regular
  shadow maps (see *Measured → Shadows*). It is avoided, not understood.
- **Greybox with real textures.** The architecture is engine boxes and cylinders with CC0 Poly
  Haven materials (triplanar), not modelled pieces. The toy, the washing and the chimes are basic
  shapes too. The sea is a flat dark plane. The rain is streaks around the camera; there are no
  splashes or wet decals.
- The tether pickup is close enough to the toy that going to the toy picks up the tether.
- The HUD is drawn with the Canvas (no UMG widgets), uses the engine's default font, and shows
  keyboard prompts only.
- No pause menu or settings in this map; Esc is the template's.
- Not tested: a gamepad by hand, other resolutions, a packaged build.

## Changes made to the owner's project (outside the repository)

- `e.uproject`: the **PerformanceCaptureToolkit** plugin (added from Fab) is disabled: it needs
  `MetaHumanBodyTracker`, which is not installed, and the project would not open. Re-enable it in
  Edit → Plugins once that dependency is installed. The `ItTakesOne` module is added. Backup:
  `e.uproject.before-ittakesone`.
- `Config/DefaultEngine.ini` (backup: `DefaultEngine.ini.before-ittakesone`), three lines:
  - `r.RayTracing=False`: the template turns hardware ray tracing on, and the RTX 2050 has 4 GB.
  - `r.Shadow.Virtual.Enable=0`: regular shadow maps instead of Virtual Shadow Maps. To undo:
    Project Settings → Rendering → Shadows → Shadow Map Method → Virtual Shadow Maps.
  - `EditorStartupMap` = Stormworks, so the project opens on it.
- `/Game/ItTakesOne/Mara`: `prepare_mara.py` added `Materials/M_MaraGLTF` (a copy of Interchange's
  glTF master, flagged for skeletal meshes), re-parented her 17 material instances to it, and
  renamed her 22 rigid parts `MaraPart_<bone>_<node>`.
- `Source/` is a directory junction to this repository's `unreal/Source`. Deleting the project's
  `Source` folder through Explorer follows the junction: remove the junction itself
  (`rmdir Source` in a command prompt), never its contents.

## Areas for an independent review (Codex)

- `MaraAnimInstance.cpp`: the proxy's evaluation (pairwise blending, the upper-body mask built from
  bone names, thread safety of what `PreUpdate` copies), and the shared locomotion phase.
- `StormCinema.cpp`: `FinishSequenceOnce` under every path (natural end, skip, cancel, a replay,
  `EndPlay`), especially restoring the view target and input when the player has respawned
  meanwhile.
- `TetherComponent.cpp`:
  - the reel's end-of-arc sweep and the blocked test after long frames;
  - early touchdown counted as arrival within 2.5 m;
  - targeting from the chest rather than the camera.
- The soft-lock audit: can the cargo crate, the gate or the catwalk leave her with no way forward?
- The audio lifecycle: owned components versus fire-and-forget sounds; anything left playing after
  `EndPlay`.
- The self-test's honesty: it calls `TryFire`, `TryInteract` and `Skip` directly; only restart
  goes through Enhanced Input, so the other key bindings are covered only by reading the code.
