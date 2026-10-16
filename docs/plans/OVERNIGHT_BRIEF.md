# Overnight brief: Chapter One v2

*Written by Claude for Claude, 2026-10-16, before starting. It is the prompt this pass follows.
The owner asked for "It Takes Two quality" in movement, camera, character, maps, sound, story,
intro, puzzles and missions, and for a game that makes them say "wow" in the morning.*

## The goal in one line

Make the first five minutes feel like a polished co-op adventure's best moments: playful,
expressive movement; a camera you never fight; sound and music that sell every action; a story
you understand without reading; and at least two moments that make a player grin.

## Hard rules (unchanged)

- **Original work only.** It Takes Two is the quality bar, not a source. Use none of its
  characters, levels, story, dialogue, music, assets or exact gadgets. Genre-standard verbs are
  fine: double jump, dash, ground pound, grinding, swinging. Hazelight did not invent them.
- **Licences.** Only CC0 (or clearly redistributable) downloads. Verify each licence on the
  source page. Record source, author and licence in `docs/ASSETS.md`. Nothing ripped, nothing
  "free for personal use", no Sketchfab game rips.
- **Branches.** Work on `claude/chapter-one-v2`, stacked on PR #4. Draft PR. Never merge,
  never deploy, never force-push.
- **Honesty.** Report what was measured, how, and on which GPU. No invented frame rates, and no
  claimed playtests (no person plays tonight). Codex has not reviewed any of this.
- **No regressions.** The full e2e suite stays green. Add tests for every new mechanic. Intel UHD
  Low must not get slower than PR #4 (about 24 ms a frame in bundled Chromium).

## What "It Takes Two quality" means here (the checklist)

1. **Movement verbs that are fun on their own.**
   - Double jump with a flip.
   - Dash on the ground (a roll) and in the air (a horizontal burst that holds height).
   - Hold to sprint after a dash.
   - Ground pound (hover, then slam).
   - Grinding along pipes.
   - Each verb gets an animation, a particle burst, a sound, and a small camera response (an FOV
     kick on dash, shake on a pound).
   - One air dash and one double jump per airtime, refilled on landing, ledge catch or grind.
2. **A reason in the story.** Ivo has left Mara a *steam kicker*: a brass pressure canister on
   her belt that she, a tide-engine mechanic, knows how to use. It powers the double jump, the
   air dash and the pound. She picks it up in the shaft, a mission beat with its own short
   cutscene. Its gauge glows on her back and dims as she spends air.
3. **A spectacular set piece.** Mara enters the turbine hall by grinding down a long broken feed
   pipe, sparks flying, the camera pulled back to show the drop, and lands on tier one. The old
   rope and scaffold stay as a fallback.
4. **Toys and secrets.**
   - Five of *Ivo's marks* (chalk "IV") hidden off the main path. One needs a double jump; one is
     under a plate that only a ground pound breaks. A counter and a chime, with the score shown at
     the end.
   - A steam whistle to pull, for the joy of it.
5. **Sound that sells it.** Real recorded (CC0) footsteps that change with the surface (stone,
   metal), cloth and landing thumps, metal clanks for levers and valves, steam, sea and engine
   ambience, and music that changes with the place: quiet in the cell, driving in the hall,
   swelling at the ending. Separate music and effects volumes.
6. **An intro you watch, not read.** The night before, in-engine: Mara's workshop in Saltmere,
   rain on the window, the diversion plans on the bench. She falls asleep over them. A shadow
   passes the window and the lamp goes out. Then the cell. The narration becomes a few
   lower-third lines over that scene, all skippable.
7. **Presentation.**
   - Area titles as you enter each space ("The Maintenance Shaft"…).
   - Idle fidgets: arms folded, looking around.
   - Mara kneels to turn the low valve.
   - Ability prompts appear once, the moment she gets the kicker.
   - The end card counts Ivo's marks.
8. **Bugs.** No console errors on the full route. Every new mode leaves cleanly (respawn, pause,
   cinematics, checkpoints).

## Order of work (do the high-impact, low-risk things first)

1. Dev fix: the dev server ignores `artifacts/`.
2. Re-export `mara.glb` with the new clips: sit, slide, crouch, fixing, pick-up, folded arms.
3. Movement 2.0: controller states, input (Shift, Ctrl, gamepad B and RB), the avatar (flip,
   roll, tuck and slam, sprint), VFX, camera kicks, the kicker pickup and canister, and tests.
4. Sound: download, verify and record CC0 packs; sample playback with variations and surfaces;
   ambience beds; music with crossfades; volume settings.
5. The workshop intro cinematic.
6. Area titles, Ivo's marks, the whistle, the pound plate.
7. The grind pipe into the hall.
8. Polish: idle fidgets, the valve kneel, lighting touches.
9. Verify: full suite, the Intel and RTX frame times, a route audit, screenshots and a short
   showcase video (local only). Docs. Draft PR #5.

## Definition of done for each feature

It works from a fresh load and after respawn, restart and checkpoint teleports. It has a test (a
unit test for rules, e2e for behaviour), it is visible in a screenshot, it is documented in
STATUS/TESTING/GAME_DESIGN, and its asset licences are in ASSETS.md.
