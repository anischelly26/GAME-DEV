# Repair pass on the Stormworks → house → reveal sequence (2026-10-30)

Each item from the review of the 2:11 recording of 2026-10-29, what caused it, and what was done. The
recording itself was not on this machine, so defects were reproduced in new captures. Everything
"verified" below is verified by the bot or by measurement. Nobody has played this pass by hand yet.

## Fixed, with the cause

| ID | Finding | Cause found | Fix | How it was checked |
| --- | --- | --- | --- | --- |
| C05 | Mara head-down in the tow and when swimming | Measured from the clips: `swimFwd` already lies flat (neck 27 cm ahead of the pelvis at the same height). The code added up to 70° on top, about 160° in all. The 70° was the web game's constant, carried over | One owner for her body in `MaraCharacter::Tick`: the clip lies her flat, the code only pitches that flat body along her travel. "Towed" is now an explicit state, not inferred from `IsFlying` | Bot: head leads her travel (cosine 0.96 in the tow); floats upright when still |
| C06 | Bubble away from her head | Fixed offset in the mesh's frame, so it never followed the head bone | Attached to the `Head` bone, offset computed from the bind pose | Bot: never more than 20 cm from the bone |
| C01 | Washing and Mara's head filling the view | The sheets have no collision, so the camera can end up behind one. Walls push the boom into her head | Sheets near the lens ride up to the rope; the boom rises over her as it shortens; she is hidden from the lens at the very last | Laundry: not yet seen in a capture of the exact spot, see below |
| C02, C03 | T-pose, checker materials, loading text, sky warning on arrival | The level was shown while animations, textures, meshes and shaders were still arriving. The sky warning fires while the template's sky mesh is not ready | `AReadyGate`: a title card over the paused game until nothing is compiling or streaming, with a timeout that logs. It tests conditions, not a delay | Bot through the real level change: no T-pose (hand 31 cm from the bind pose) |
| C04 | Lighthouse floating over blocks | It stood on stacked boxes, close to the house, with the scan's plaza fragments exposed | Moved to about 50 m from the jetty, on a crag of tilted slabs, its feet set into the rock's top | Screenshot `01_jetty` |
| C07 | Stale "Get the gauge back" | The objective was only set once | Cleared for the grab, "Steer around the floating wreckage" for the tow, "Find the gauge", then "Swim to the gauge" | Bot checks the tow's objective, watched or skipped |
| Q01 | Nacre as cables and a ball | Stretched spheres | A real tapered tube (one procedural mesh per arm), paler underside, suckers, wet rim. A lathed mantle that breathes. Eyes with bar pupils | Screenshots |
| Q02, Q05 | Red catwalk; silhouettes; "Swim to the light" among many lights | Alarm lamps at 12,800; windows and seeds brighter than anything that mattered | Alarm pulse reduced by about two thirds. Windows, seeds and lanterns dimmed. A soft light on Mara under water. A warm glint on the gauge, which is now the objective | Screenshots |
| Q06 | Small text | UI scale could fall to 0.6 | Larger everywhere, minimum 1.04 at 720p | Screenshots at 1536 wide |

Also from the review's leads:

- **Tow steering:** left and right came from world up each frame and could collapse on steep stretches.
  They are now carried along the path. Verified with real keys: 140 cm right in the hall, 140 cm left
  down the steep shaft, 140 cm up in the passage.
- **Water scope:** still the default physics volume, set at the reveal. See *Not done*.

## Found by moving the bot onto real keys

The bot now walks with W, presses E, steers with WASD, and swims with Space and C, through the input
mappings. That found a bug no earlier test could: **Space did not swim her up at all** (0 cm).
`ACharacter::bPressedJump` lasts a single frame when there is no jump hold time. She has her own flag
now (229 cm in one second).

## Audio: the numbers changed the plan

The review's −30.4 LUFS came from the capture. `tools/unreal/measure_audio.py` measures what the game
itself outputs (`-HouseRecordAudio`): **−22.7 LUFS integrated, −8.1 dBFS sample peak**, close to the
usual −24 LUFS home target. About 8 dB of the "quiet mix" was capture gain, so nothing was boosted.
Added instead: the splash and closing water at the surface, her swim strokes, the wobble of the bubble,
the storm through the cracks at the searchlight, and a cut to her heartbeat at the grab.

**Nobody has listened to any of this**, including me. These are levels, not judgements.

## Results (2026-10-31)

One continuous run, Stormworks then the house, 1600×900 on the RTX 2050 laptop: **67/67 and 37/37**,
mean frame 28.7 ms and 28.6 ms. The same result came from each of the last four runs.

- **Frame time:** the 37 ms seen earlier was not the new content. With no Ollama model loaded the house
  is back at about the old 27.6 ms. No matched before/after run was made.
- **GPU stall:** one run froze with GPU timeouts over 5 s. Ollama holds 2 GB of this card's 4 GB when a
  model is loaded and reloaded during that session; the link is likely, not proven.
- **Unfocused audio:** Unreal mutes an unfocused game, recordings included.
  `-ini:Engine:[Audio]:UnfocusedVolumeMultiplier=1.0` keeps it on.

## The packaged game (2026-11-01)

Windows Shipping build, 355 MB zip, title "It Only Needs Mara" (the internal project is still
`ItTakesOne`). Tested from the extracted zip: **67/67 and 37/37**, mean frame 22.5 ms (about 45 fps) at
1600×900, with no model in Ollama. Playable 15.4 s after a first launch and 11.3 s after a later one.
The 52 s freeze of an uncooked `-game` run does not happen.

The packaged run found a bug the editor cannot: the washing line was built only in `OnConstruction`,
which a cooked game does not run, so it was missing. `BeginPlay` now builds it when it is absent.

Rebuild: `RunUAT BuildCookRun -clientconfig=Shipping -build -cook -stage -pak -compressed -prereqs
-nodebuginfo -archive` (25 min here; `-skipcook` for code-only changes, 3 min). Mara, the sounds and the
cinematics are loaded by path, so `DefaultGame.ini` lists their folders under `DirectoriesToAlwaysCook`.

## Not done

- **Skipping the grab:** `-HouseSkipGrab` is written but has not been run.

- **Water volume:** the default physics volume still turns to water at the reveal. It must become a
  scoped volume before any dry space follows the conservatory.
- **Other sounds:** the footstep, tether and gauge sounds were not reworked.
- **Art direction:** the architecture is still mostly boxes. The cottage, the hall and the lantern
  houses have not had a real pass.
- **Cinematic staging:** the grab is still one 3 s shot. Rescue pacing was not rewritten.
- **Volume settings:** there is no settings screen to put them in.
- **Tether range:** the recording's out-of-range attempts and its catwalk fall need input logs.
- **Flaky Stormworks step:** the bot once walked off the gallery instead of onto the crate (1 run of 3).
