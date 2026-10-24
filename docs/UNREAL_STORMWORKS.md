# The Stormworks Escape (Unreal Engine 5.8)

A short playable sequence built in Unreal Engine around one new mechanic: **Ivo's maintenance
tether**. It is a separate piece of work from the web game. It lives in the owner's Unreal project
(`ItTakesOne-Unreal/e`, made from the Third Person template), and its code and build scripts are
in this repository (`unreal/Source`, `tools/unreal`).

**Played by whom:** only by the scripted self-test bot (below), in the real game window with real
rendering. **No person has played it yet.** First-play length, difficulty and whether the tether
feels good in the hand are unknown until someone does.

## Open it

1. Open `ItTakesOne-Unreal/e/e.uproject` (or the desktop shortcut "It Takes One (Unreal)").
2. Content Browser → `Content/ItTakesOne/Maps/` → **Stormworks**.
3. Press **Play**. The level sets its own game mode (World Settings → GameMode Override =
   `StormworksGameMode`); you play the template's character.

## Controls

| Action | Keyboard and mouse | Gamepad |
| --- | --- | --- |
| Move, look | WASD, mouse (the template's) | Left stick, right stick |
| Jump | Space | A / Cross |
| **Tether** (fire at the targeted ring) / read a note / close it | **E** or left mouse | Right trigger |
| Let go while carried (keeps the momentum) | Space | A / Cross |
| Back to the last checkpoint | **R** | View / Back |

The HUD shows the target: a teal ring with "[E] Tether" (an anchor) or "[E] Pull" (a machine), or
a grey ring with "Too far" when the ring you aim at is out of reach.

## The tether

One rule for the player: **a teal brass ring means the tether works here.** Every ring looks the
same; there are two kinds.

- **Pull:** the ring is on a machine (a crate on a girder, a coupling lever, the gate). A tug runs
  the machine to the other end of its straight track, then the cable lets go. A second tug runs it
  back (unless it is one-way). She walks at 30% speed while the cable is taut.
- **Anchor:** the cable carries her along a fixed arc (a quadratic curve that rises above the
  straight line) and sets her down on the ring's landing spot, in 0.55 to 1.5 s depending on the
  distance. Space lets go early and keeps her momentum.

What makes it predictable:

- **What you aim at is what you get.** The ring nearest the centre of the view (within a 26° cone,
  in line of sight from her chest) is the target. If it is beyond the 12 m reach, the HUD says
  "Too far" and firing does nothing (a refusal sound). It never quietly picks another ring.
- The cable is visible (a `UCableComponent` from her right hand) and the hook takes 0.14 s to fly,
  so the latch can be seen and heard. Then the camera kicks a little and the ring flashes.
- **The camera is never taken away.** Nothing moves or locks the camera during the carry or the
  climax; the only effect is a small shake on the latch and the landing.
- A carry that is blocked (1.2 m behind where the arc had her for 0.2 s) ends where she is,
  rather than pushing her through a wall. Long frames (over 50 ms) do not count towards that.
- A hitch does not throw her off the arc. Her movement ticks after the tether in every frame, so
  the carry's velocity always matches the frame it is used in. Before this was fixed, a 250 ms
  frame in mid-flight (a screenshot was enough) sent her up to 6 m past the landing. The self-test
  now stalls the game for 0.3 s in the middle of a carry on purpose.

## The sequence (six beats, about 50 s for the bot)

The map is laid out along a seawall running north. The coordinates are in metres: X north, Y east.

1. **The view** (Ivo's workshop). The north window frames the storm, a signal tower, and the
   lighthouse on Knoll Rock burning far out at sea. Warm lamps inside, storm blue outside.
   Objective: "Find a way out of the workshop".
2. **Learn it safely.** The tether lies on Ivo's workbench (walk into it). A crate blocks the door.
   Its ring is the first one she sees, and nothing can go wrong: one tug slides the crate into
   an alcove. Tug it again and it comes back.
3. **Combine.** The seawall gallery is broken: an 11 m gap over the sea. The far anchor is visible
   from the edge, but it is grey ("Too far"). A cargo crate sits on a girder across the gap, parked on
   the far side. Pull it to the near edge, climb onto it, and from there the anchor is in reach:
   tether across. (The rope and a chalk "IV →" on the wall say someone did this before.)
4. **The complication.** At the far end the sluice gate is shut. Its storm coupling (a brass lever
   with a ring, "STORM COUPLING — engage only at high water") is the only way through. Pulling it
   starts the prison's storm engine: the gate grinds open, alarms flash red, the storm gets
   louder, and the old catwalk beyond is armed to collapse.
5. **The climax** (about 8 s). As soon as she steps on the catwalk, it starts falling apart
   behind her, one segment at a time, each telegraphed by a shudder and a flickering warning
   light. On the way she tethers across one break, jumps the next, and tethers up to the signal
   tower's roof. If she falls, she is back at the gate with the catwalk rebuilt.
6. **Relief.** The tower roof: a checkpoint, the lighthouse ahead across the water, and Ivo's hut
   with his note pinned to the wall (E to read). The note sets up what comes next (the lamp on
   Knoll Rock, a skiff, the tide). Reading it ends the sequence.

**Failure and recovery.** Falling below 7 m under the seawall puts her back at the last
checkpoint (five: the workshop, the gallery, the far gallery, the gate, the tower). What she has
solved stays solved (the crates stay where she pulled them). R returns to the checkpoint at any
time.

## The code

C++ module `ItTakesOne` (`unreal/Source/ItTakesOne`). Each piece is a reusable Actor or
Component placed in the level; the level has no Blueprint logic.

| Class | What |
| --- | --- |
| `UTetherComponent` | The mechanic: targeting, the Pull and Anchor states, the cable, input (its own Enhanced Input mapping context, built at run time, layered over the template's), the camera shake, the counters the self-test reads |
| `ATetherPoint` | A brass ring: Anchor (with a landing spot) or Pull (mounted on a machine); its glow shows targeted, out of reach or idle |
| `ATetherMovable` | A body on a straight track (eased), one-way or back and forth, with its own grind sound; the rail has no collision |
| `ATetherPickup` | The tether on the workbench |
| `ACollapsingWalkway`, `ACollapsingSegment` | The catwalk: armed, triggered on entry, falls segment by segment, resets on respawn |
| `AStormDirector` | The storm (lightning, thunder, wind) and the storm engine (the coupling → the gate, the alarms, the catwalk) |
| `AStormCheckpoint` | A forward-only trigger box with a spawn point and an objective |
| `AStoryNote` | A readable note (the HUD shows it as a paper panel) |
| `AStormworksGameMode` | The template's character and controller, plus the tether; respawn, falls, checkpoints, notes, messages, the end |
| `AStormworksHUD` | Canvas HUD: objective, reticle, target ring and prompt, messages, the note, the end card, the respawn fade |
| `ALighthouseBeam`, `AStormRain` | The turning beam (two spot lights), and rain streaks that follow the camera |
| `AStormworksSelfTest` | The scripted playthrough (only with `-StormSelfTest`) |

`StormworksGameMode` uses `/Game/ThirdPerson/Blueprints/BP_ThirdPersonCharacter` and
`BP_ThirdPersonPlayerController`, so it needs the Third Person template's content in the project.

## Rebuild it from the repository

From a project made from the Third Person template (C++ or Blueprint), with the editor closed:

1. **The code.** Copy `unreal/Source` into the project as `Source` (on the owner's machine it is a
   directory junction to the repository), and add the module to the `.uproject`:
   `"Modules": [{"Name": "ItTakesOne", "Type": "Runtime", "LoadingPhase": "Default"}]`.
   Build: `Engine\Build\BatchFiles\Build.bat ItTakesOneEditor Win64 Development -Project=<path>.uproject -WaitMutex`
   (Visual Studio 2022 Build Tools with the C++ workload). 
2. **The sounds.** `python tools/unreal/make_stormworks_sounds.py` writes 19 WAV files to
   `ItTakesOne-Unreal/Import/Stormworks/Audio/`.
3. **The Chapter Three import** (for the lighthouse scan): `tools/unreal/import_it_takes_one.py`,
   see [UNREAL_EXPORT.md](UNREAL_EXPORT.md). Without it, the builder puts a plain stone tower
   in its place.
4. **The level.** `UnrealEditor-Cmd.exe <path>.uproject -run=pythonscript -script="<repo>/tools/unreal/build_stormworks.py" -nullrhi -unattended -nosplash`.
   It imports the sounds and seven Poly Haven texture sets from `public/assets/textures`, builds the
   materials and lays out `/Game/ItTakesOne/Maps/Stormworks` (169 actors); about 2 minutes here.
   Rebuilding replaces the map and the `/Game/ItTakesOne/Stormworks` assets. Log:
   `Saved/Stormworks_build.log`.

## The self-test

`powershell -File tools/unreal/run_selftest.ps1` starts the game (standalone, rendered, 1280×720)
with `-StormSelfTest`. A bot plays the whole route through the same functions the input calls
(movement input, control rotation for the aim, `TryFire`, and for restart the real Enhanced Input
action). It takes screenshots and writes `Saved/StormworksSelfTest/results.txt`, then quits.
`-Clip` also saves a frame every 0.1 s through the climax, and `python tools/unreal/make_clip.py`
turns those into a GIF.

**Results with the committed game code** (six runs, 2026-10-24): 40/40 in four runs. In the other
two, one check failed each time, and both were the test's fault: a 260 ms screenshot hitch landed
right next to the check (the restart press, the first aim). Both checks now wait past the hitch,
and the run after that passed 40/40. One more launch, with `-Clip`, passed 40/40 too.

What it checks (40 checks, one with a deliberate 0.3 s stall in mid-carry; the latest results are in
[evidence/stormworks/results.txt](evidence/stormworks/results.txt)):

- the start: the character, the tether not yet picked up, checkpoint 0, the objective; Tether does
  nothing before the pickup;
- the pickup; the door crate is targeted and one tug opens the door;
- **repeated interaction**: the crate back over the door and off again (three arrivals);
- **leaving and returning**: after walking to the gallery and back, the ring is targeted again;
- "Too far": the far anchor is reported out of reach from the edge, and firing at it is refused;
- the combination: the cargo crate runs to the near edge, she stands on it, the anchor is in
  reach, the carry lands her on the far gallery, the checkpoint;
- **a missed jump and recovery**: walking off into the sea counts a fall, puts her back at the far
  gallery checkpoint and leaves the crate where she pulled it;
- the coupling starts the storm engine, the gate opens, the catwalk is armed;
- a fall during the climax rebuilds every segment and puts her back at the gate;
- the climax: carried over the first break, jumps the second (it logs the jump's arc), carried up
  onto the roof, the roof checkpoint;
- the note is in reach, opens (the sequence is complete), closes;
- **restart from the checkpoint**: R is bound, pressing it puts her at the last checkpoint;
- **not stuck at the end**: she can still walk about.

The bot does not hesitate, turn the camera like a person, miss a ring by a few degrees, or try to
break the level. It is a regression check, not a playtest.

## Measured

On the owner's laptop: NVIDIA GeForce RTX 2050 (laptop), 8 GB RAM, Windows 11, UE 5.8, 1280×720
window, the engine's default scalability. These frame times come from the self-test's own counter
over the whole run (about 2,100 frames). They include the bot's screenshots and the start of the
level.

| Run | Mean frame | Frames over 33 ms |
| --- | --- | --- |
| Virtual Shadow Maps, volumetric fog on: three runs | 23.2, 23.3, 23.3 ms (43 fps) | 29, 33, 26 |
| Virtual Shadow Maps, `r.VolumetricFog 0`: two runs (a third crashed, below) | 21.9, 22.2 ms (45 fps) | 30, 26 |
| `r.Shadow.Virtual.Enable 0` (regular shadow maps), fog on: five runs | 23.3, 24.1, 24.5, 25.7, 24.8 ms | 29, 40, 39, 43, 35 |
| **As committed** (regular shadow maps, fog on): six runs | 23.4, 23.8, 24.0, 25.0, 24.9, 24.5 ms (40–43 fps) | 36, 33, 41, 84, 72, 62 |

Volumetric fog costs about 1.2 ms a frame here; it stays on (it carries the lighthouse beams and
the depth of the storm). Every run has at least one frame of 400 ms or more: the engine clamps game
time at 0.4 s, so the real worst frame is not known. Earlier runs, before the last layout changes,
measured 26.4 and 32.5 ms mean, so these numbers vary between builds and sessions; they are not a
performance claim.

### Shadows

With Virtual Shadow Maps (the template's default), 2 of 9 launches ended in a GPU crash in the
first two seconds: `DXGI_ERROR_DEVICE_HUNG`, an Aftermath page fault in the VSM shader
`CullPerPageDrawCommandsCs` (non-Nanite instance culling for shadow pages). With regular shadow
maps, 0 of 13 launches crashed. Regular shadow maps were about 1 ms slower in these runs,
but the laptop was also warming up over back-to-back runs. A crash on 1 launch in 4 or 5 is worse
than 1 ms, so the project now uses regular shadow maps. That avoids the crashing shader; it does
not prove the cause, and it is a workaround for an engine or driver fault.

## Known defects and temporary work

- **A GPU crash (device hung) in the engine's Virtual Shadow Maps**: 2 of 9 launches with them on,
  both in the first two seconds (frame about 77), both an Aftermath page fault in the VSM shader
  `CullPerPageDrawCommandsCs`. The project now uses regular shadow maps (see *Measured → Shadows*),
  which avoids that shader. That is a workaround for an engine or driver fault, not a fix. Whether
  the crash comes back with other content is unknown.
- **The hero is the template's mannequin**, not Mara. Mara is imported (`/Game/ItTakesOne/Mara`)
  but not retargeted onto the template's animation Blueprint. The tether's hand is the
  mannequin's `hand_r`.
- **Greybox with real textures.** The architecture is engine boxes and cylinders with CC0 Poly
  Haven materials (triplanar), not modelled pieces. The sea is a flat dark plane. The rain is
  streaks around the camera; there are no splashes or wet decals.
- **Sounds are synthesised placeholders** (noise, sines and envelopes): the grind, the latch, the
  thunder, the wind. They do their job of feedback, but they are not final audio.
- The lighthouse scan is about 80 m from the tower roof and mostly hidden by the storm: what reads
  is the beam and the lens.
- At the storm coupling, standing close and aiming up at its ring puts the camera low behind her
  (screenshot 09). After the coupling is engaged, its ring still shows "[E] Pull", though a pull
  does nothing.
- The HUD is drawn with the Canvas (no UMG widgets) and uses the engine's default font.
- No pause menu or settings in this map; Esc is the template's.
- Not tested: a gamepad by hand, other resolutions, a packaged build.

## Changes made to the owner's project (outside the repository)

- `e.uproject`: the **PerformanceCaptureToolkit** plugin (added from Fab) is disabled: it needs
  `MetaHumanBodyTracker`, which is not installed, and the project would not open. Re-enable it in
  Edit → Plugins once that dependency is installed. The `ItTakesOne` module is added. Backup:
  `e.uproject.before-ittakesone`.
- `Config/DefaultEngine.ini` (backup: `DefaultEngine.ini.before-ittakesone`), three lines:
  `r.RayTracing=False` (the template turns hardware ray tracing on; the RTX 2050 has 4 GB);
  `r.Shadow.Virtual.Enable=0` (regular shadow maps instead of Virtual Shadow Maps, because of
  the GPU crash above; to undo: Project Settings → Rendering → Shadows → Shadow Map Method →
  Virtual Shadow Maps); `EditorStartupMap` = Stormworks, so the project opens on it.
- `Source/` is a directory junction to this repository's `unreal/Source`. Deleting the project's
  `Source` folder through Explorer follows the junction: remove the junction itself
  (`rmdir Source` in a command prompt), never its contents.

## Areas for an independent review (Codex)

- `TetherComponent.cpp`: the reel (the arc, the blocked test, early touchdown counted as arrival
  within 2.5 m) and what happens if the carry ends in an odd place, e.g. against the tower wall.
- Targeting: the 26° cone and the line of sight from the chest, not the camera. A ring that is
  visible on screen but hidden from her chest is not targetable; is that readable for a player?
- The soft-lock audit: can the cargo crate, the gate or the catwalk leave her with no way forward
  (for example, the crate pulled back to the far side while she is on the far gallery)?
- `CollapsingWalkway`: resetting when she respawns mid-collapse; the checkpoint order
  (`ClimaxCheckpointOrder` = 3).
- The respawn path (`Respawn`): tether state, the open note, the end card.
- The self-test's honesty: it calls `TryFire` directly for the tether (only restart goes through
  Enhanced Input), so the tether's key bindings are covered only by reading the code.
