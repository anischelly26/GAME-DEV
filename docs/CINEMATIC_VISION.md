# Cinematic vision

Status: **proposal** (2026-10-17). What "cinematic" means for *It Takes One*, how scenes are built
in this engine, and the rules every scene follows. The story is in
[STORY_CONTINUITY.md](STORY_CONTINUITY.md); characters in [CHARACTER_BIBLE.md](CHARACTER_BIBLE.md).
*It Takes Two* is a quality reference for pacing and readability only; no shot, line, character
or sequence of it is reproduced.

## What we want the player to feel

The owner's words: "an adventure that feels alive, not just a series of obstacle courses". In
practice:

1. **Every space is a place before it is a course.** Something lives there or used to: a lamp left
   on, a child's drawing, a kettle, a Watch with a routine.
2. **Movement and story share the screen.** The best moments happen while the player has control
   (a cable ride with the prison falling away, the surge lifting the skiff over the bar). Cutscenes
   are short and earn their place.
3. **Each chapter ends on a reveal that pulls into the next**, not a menu.
4. **Funny and warm in the small moments**, quiet and big in the large ones.

## Scene types, from most to least player control

| Type | Control | Length | Use it for | Example |
| --- | --- | --- | --- | --- |
| Played set piece | Full; camera framed by a zone or rail | 10 to 60 s | Spectacle that is also play | The cable ride down to the spur; the surge over the bar |
| Look-at | Full; the camera eases toward a subject for 1 to 2 s, the stick cancels it | 1 to 2 s | Reveals the player might miss | The lighthouse first seen from the yard |
| Barks | Full; a subtitle and a gesture | 1 to 3 s | Character, humour, hints | Mara: "Fresh copper." Pip's chirps |
| Short scene | None; letterboxed; skippable | 4 to 15 s | Arrivals, endings, key emotional beats | Pip's crash landing |
| Long scene | None; letterboxed; skippable | 15 to 45 s | One per chapter at most | The opening workshop (built, 39 s) |

Rule of thumb: if the player could be doing the thing on screen, let them.

## How scenes are built here (engine rules)

What exists: in-engine timelines of cues (`{ at, watchOnly, run }`), `ThirdPersonCamera.playShot`
(an eased move between two framings with a field of view), the HUD letterbox and lower-third
captions, `Dialogue` lines with subtitles, and skip (Space, E or A) that jumps to the end state.

What Phase C adds (see [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md)):

- **`Cinematic` director.** One object per scene: a list of shots and cues, a skip handler that
  sets the end state, and a `dispose()` that removes everything it added (no listeners, meshes or
  audio nodes left behind). Tests can run any scene with `?watch=1` and assert its end state.
- **Shot kinds:** `cut` (instant), `ease` (existing `playShot`), `orbit` (around a subject),
  `follow` (rides along a path or object, for the cable and the beam), `handheld` (a low-amplitude
  noise on top of any shot, for tension).
- **Actors:** Mara and Pip can be posed and animated by a scene (play clip, look at, walk to point)
  through the same avatar the player drives, so there is no swap to a separate cinematic model.
- **Transition shots:** a scene can end on a held shot during which the next chapter loads; the
  next chapter's opening starts on a matching framing (see "Seamless transitions").

## Seamless transitions between chapters

Today a chapter change is a page reload (`location.assign`) with a loading screen and a title card.
The target, in two steps:

1. **Masked reload (Phase C, low risk).** The ending scene finishes on a held, slow shot (the cable
   disappearing into fog; the beam crossing the bay). That frame is captured to an image, the next
   chapter loads behind it, and its opening starts from a matching shot. The reload is kept: it
   guarantees that nothing from the previous chapter leaks (memory, listeners, audio nodes).
2. **In-page switch (later, only if measured to be safe).** Dispose the level, reuse the renderer,
   physics world and audio context, load the next level. This needs a disposal audit with a test
   that counts geometries, textures, listeners and audio nodes before and after three chapter
   switches. It is not started until step 1 is in and the counts can be measured.

| Ending → opening | Held shot (hides the load) | Matching opening shot |
| --- | --- | --- |
| One → Two | Mara and Pip on the cable, from behind, sliding into the mist over the spur | The cable's foot in the cove at first light; Mara drops onto the shingle |
| Two → Three | Through the causeway gate: the tide going out, the skiff on its buoy | The top of the slipway, the same skiff |
| Three → Four | The beam sweeping across the bay to the pier; the arcade's lights flicker on in the fog | The pier at night, from the water |

## Rules for every scene

- **Skippable**, always, after 0.5 s; skipping lands in exactly the state the scene would have.
- **Short.** No scene over 45 s; most under 12 s. One long scene per chapter at most.
- **No exposition dumps.** A line says what a character feels or wants, not what the plot is.
- **Readable silhouettes.** Characters are framed against a contrasting background; the key light
  comes from behind or the side, never flat on.
- **The subject leads, the camera follows.** No camera move without motivation (a character
  moves, something is revealed).
- **Field of view** (vertical): 38 to 50° for faces and hands, 50 to 60° for places. Gameplay is
  about 59° (90° horizontal at 16:9, the default setting), widening up to 3° with speed.
- **Letterbox** only for scenes without control; never during play.
- **Subtitles** on by default, lower third, with the speaker's name in their colour.
- **No placeholder speech.** Until real performances exist: subtitles, timing, faces, gestures and
  mechanical sound (Pip's chirps, the Watch's horn, the intercom's crackle).
- **Respect the render safety pass.** Scenes may brighten lights, but never push values the
  sanitize pass has to clamp in every frame; check scenes at High for black frames.
- **Test it.** Every scene has an e2e test that runs it with `?watch=1` and checks its end state,
  and one that skips it and checks the same state.

## Comedy, warmth, awe: where each lives

| Tone | How | Where |
| --- | --- | --- |
| Comedy | Physical timing: Pip's overconfidence, a Watch reading its own rules aloud, Mara's deadpan | Barks during play; short scenes |
| Warmth | Small gestures: Mara catching Pip, Pip clinging to her canister, a repaired thing working | Short scenes; idle animations |
| Awe | Scale and light: the hall reveal, the lighthouse beam, the sea from the cable | Played set pieces and look-ats |
| Tension | Sound and framing: the Watch's lamp, a low handheld camera, music dropping out | Stealth spaces |
| Sadness | Absence: the empty village, the children's drawings, Ivo's recording | Look-ats and one short scene per chapter |
