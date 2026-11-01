# The house under Knoll Rock (Unreal Engine 5.8)

The first playable slice of [STORY_HOUSE_AND_NACRE.md](STORY_HOUSE_AND_NACRE.md), steps 1 to 12. Mara
arrives at Ivo's house in the storm. Something in the drains steals his gauge. A Watch searchlight
sends it into hiding, then it grabs her and tows her down through the folding house. Under water she
meets Nacre, who gives the gauge back. It ends on "To be continued: the Sunken Conservatory".

It runs in the in-repo Unreal project (`unreal/ItTakesOne.uproject`), beside the Stormworks map, and
reuses its hero, materials, sounds and cinematic rules.

**Played by whom:** the scripted self-test bot (below); the owner played the build before the repair pass.
**No outside player has tried it, and nobody has reviewed the sound.** How long it takes, whether the tentacle reads as funny or
scary, and whether the tow is fun to steer are all unknown until someone plays it.

## Open it

1. Open `unreal/ItTakesOne.uproject`.
2. Open the map `/Game/ItTakesOne/Maps/House` and press **Play**. The map sets its own game mode
   (World Settings → GameMode Override = `HouseGameMode`).

## Controls

| Action | Keyboard and mouse | Gamepad |
| --- | --- | --- |
| Move, look | WASD, mouse | Left stick, right stick |
| Jump; swim up | Space | A / Cross; RB |
| Swim down | C or Left Ctrl | LB |
| Look at the gauge; take it back | **E** or left mouse | Right trigger |
| Skip the grab's cinematic | Space, Enter or E | A or B |
| Steer during the tow | WASD | Left stick |

## The beats

| # | Where | What happens | Ends when |
| --- | --- | --- | --- |
| 1 | The jetty | Full storm, the cottage window warm, the lighthouse above | She walks in the door |
| 2 | Inside | The storm is muffled (a low-pass on the wind), a clock ticks, the lighthouse hum carries Ivo's motif | — |
| 3 | Three details, none required | The kettle's steam bends toward the drain as if sniffed (funny); her childhood height marks on the hall doorframe (comforting); water climbs out of a glass on the windowsill, and her reflection in the dark window turns its head late (wrong). Under the floor, something copies her steps a beat late, and takes one step more when she stops | — |
| 4 | The bench | **E** on Ivo's gauge: "He kept it." | She turns away |
| 5 | The sink | A pale tentacle comes up the drain and takes the gauge. Looked at, it freezes ("That is not a pipe."). Looked away from, it creeps on | It hides behind the teacup |
| 6 | The table, the floor lamp | Chased, it slips back down the sink and up the floor drain, behind the lampshade | She gets close |
| 7 | The windows | A Watch searchlight sweeps the room. The tentacle flattens and turns deep blue ("hide"). The house shakes; the storm gets back in through the cracks | 3 s |
| 8 | The grab (3 s cinematic) | Arms from every drain. Everything outside cuts to her heartbeat; an air bubble wobbles over her head; the hall door bursts open, she is drawn through | It ends, or Space |
| 9 | The tow | The hall stretches, loose doors float, the hall tips into a flooded shaft lit by seeds. She steers; floating things knock her aside; it cannot be failed | The bottom |
| 10 | The conservatory | She swims. Houses hang like lanterns; windows open on dawn, noon and night skies. The camera drifts to the largest lantern for a second. Nacre's whole shape passes once across the dawn window, in silhouette, and sinks into the dark below her; then only its gold eyes show, and a pale arm comes up holding out the gauge | She takes it (**E**) |
| 11 | Thanks | Nacre flushes coral, looks away, taps the glass three times. "...You could have asked." | The end card |

## How it is built

- **C++** (`unreal/Source/ItTakesOne/House`):
  - `AHouseDirector` runs the beats, the soundscape (storm, room, deep), the lightning, the shaking
    and the fog.
  - `ANacreTentacle` is one tentacle, drawn as one instanced mesh of spheres along a curve. It
    grows, carries things, freezes, curls and changes colour.
  - `AHouseDetail` is one of the small things: the gauge, the kettle, the marks or the glass.
  - `AHouseReflection` is her reflection in the west windows. It is a mirrored copy of her, posed
    from her own skeleton every frame and up to 0.9 s behind, standing outside the glass with a
    dark backdrop.
  - `ADescentRide` is the steered tow along a spline.
  - `AHouseGameMode` and `AHouseHUD` handle input, objective, prompts, letterbox and end card.
  - `AHouseSelfTest` is the bot.
  - Mara gained swimming (`MaraCharacter`, `MaraAnimInstance`) and the bubble.
- **Level:** `tools/unreal/build_house.py` builds the map, the house's materials and the grab's
  Level Sequence (`/Game/ItTakesOne/House/Cinematics/LS_House_Grab`). It first runs
  `make_house_sounds.py` and imports the sounds as `/Game/ItTakesOne/Stormworks/Audio/H_*`. It needs
  the Stormworks build first, for the materials and attenuation it reuses. To rebuild, headless:

      UnrealEditor-Cmd.exe unreal/ItTakesOne.uproject -run=pythonscript -script="<repo>/tools/unreal/build_house.py" -nullrhi -unattended

  The log goes to `unreal/Saved/House_build.log`.

## The self-test

    UnrealEditor.exe unreal/ItTakesOne.uproject /Game/ItTakesOne/Maps/House -game -windowed -ResX=1280 -ResY=720 -HouseSelfTest -log -nosplash

The bot plays the whole slice: it walks the route, looks at each detail, inspects the gauge, watches
the theft and the chase, waits out the searchlight and the grab, rides the tow without steering,
swims to Nacre and takes the gauge. It writes `unreal/Saved/HouseSelfTest/results.txt`, in the same
format as the Stormworks test (last line `SELFTEST RESULT: N passed, M failed, T s`), and 16
screenshots beside it.

Latest run (2026-11-01, packaged game from its zip): **37/37 in 65.5 s**. Mean frame 22.7 ms at 1600×900 on the RTX 2050 laptop.
Its screenshots and results are in [evidence/house-slice](evidence/house-slice).

## Rules worth knowing when changing it

- **The tentacle and looking at it:**
  - Looked at (camera within 22° of its tip, closer than 11 m), it freezes, but only once it holds
    the gauge; the snatch itself is too quick to stop.
  - Stared at for 5 s, it flushes coral (embarrassed) and slips on for 2.5 s, so nobody can stall
    the house by watching it.
- **The chase:**
  - It leaves the teacup when she comes within 2.2 m, or after 20 s.
  - It leaves the lampshade when it is there and she is within 1.8 m, or after 20 s.
- **The reveal:**
  - The camera starts just short of the largest lantern and is drawn to it for about a second.
    After that it is the player's.
  - Nacre's body is never lit: it shows as a shape against the dawn window (7 s), then rests in
    the dark. Its arm with the gauge comes up after 6 s.
- **Motion blur** is off in the house: the tow passes close to things, and steering needs them
  sharp.

## Assets

- **Sounds:** all 17 synthesised by `make_house_sounds.py`. There are no recordings and no licences.
  The tow's knocks reuse the Stormworks recorded landings (Kenney, CC0; see [ASSETS.md](ASSETS.md)).
- **Lighthouse:** the Seven Foot Knoll scan (Katie Wolfe, **CC BY 4.0**; see ASSETS.md), on Knoll
  Rock about 25 m from the jetty. The credit applies to any build, video or screenshot.
- **Everything else:** engine basic shapes and the C++ above.

## Known gaps

- Nobody has played it. Every number here (timings, distances, tow speed) is a first guess checked
  only by the bot.
- Placeholder art throughout: Nacre is spheres, the lantern-houses are boxes, and the skies are flat
  colour panes.
- Mara's swim animation is the existing swim clip. There is no underwater breath or bubble trail.
