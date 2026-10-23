# Opening the game's worlds in Unreal Engine

*It Takes One* is a web game (TypeScript, three.js, Rapier). Unreal Engine cannot open or run that
code. What can move to Unreal is the **art**: every chapter's world (meshes, materials, textures,
lights) and Mara (her skinned mesh and all 29 animations), as glTF binary files (`.glb`) that
Unreal Engine 5 imports directly.

**What does not come along:** the gameplay. Mara's controller, the camera, the Watch, the puzzles,
swimming, the skiff, the swing and slide, the cutscenes, the sounds and music, the physics
colliders, the sky, the water's waves and the glows are all code in this repository. In Unreal they
have to be rebuilt (Blueprints or C++). The sea becomes a flat translucent surface.

**Tested how:** each file was parsed with glTF-Transform and loaded back into an empty three.js
scene and rendered (Mara with an animation playing). **Not tested in Unreal**: Unreal Engine was not
installed on the machine that made the export.

## The files

`node scripts/export-unreal.mjs` (with `npm run dev` running) writes them to
`../ItTakesOne-Unreal/Import/` (outside the repository; they are generated, about 92 MB):

| File | What | Size |
| --- | --- | --- |
| `Chapter1_TheQuietCell.glb` | Breakwater: the cell, the shaft, the turbine hall, the engine, the hangar spur; 22 lights | 23.5 MB |
| `Chapter2_TheWardersGreen.glb` | The cove, the village, the playground (the slide is CC BY), the yard | 37.9 MB |
| `Chapter3_TheLowTide.glb` | The slipway, the sea, the skiff, the rocks, the lighthouse (CC BY) | 12.2 MB |
| `MovementLab.glb` | The movement lab's stations | 10.4 MB |
| `Mara.glb` | The toy hero: skinned mesh, skeleton (Unreal-style bone names), 29 animations | 8.2 MB |
| `export-report.json` | What each file holds and what was left out | |

## In Unreal Engine 5

1. **Install** Unreal Engine 5 from the Epic Games Launcher (Unreal Engine → Library → +). It needs
   about 40–60 GB; in the install options you can untick the Android, iOS and Linux platforms.
2. **Create a project:** Games → **Third Person** → Blueprint, Desktop, **Scalable** quality (kinder
   to a laptop GPU), no starter content. This gives you a character you can walk around with.
3. **A clean level:** File → New Level → **Basic** (it has a sun, sky and fog). Delete its floor.
4. **Import a chapter:** File → **Import Into Level…** → pick e.g. `Chapter2_TheWardersGreen.glb` →
   choose a content folder (e.g. `/Game/Chapters/Chapter2`) → Import. The meshes, materials,
   textures and lights are created and placed where they are in the game (Unreal converts metres
   to centimetres and Y-up to Z-up).
5. **Walk on it:** select the imported static meshes in the Content Browser → right-click → Asset
   Actions → Bulk Edit via Property Matrix → Collision → Collision Complexity → **Use Complex
   Collision As Simple**. Put a **Player Start** where you want to begin, then Play.
6. **Mara:** Content Browser → Import → `Mara.glb`. You get a skeletal mesh, its skeleton and 29
   animation sequences (idle, walk, jog, sprint, jumps, climb, vault, swim, drive, ...). Her bones
   use Unreal mannequin names (`pelvis`, `spine_01`, ...), which should make retargeting to or
   from the Unreal mannequin easier; that has not been tried.
7. If the editor is slow: Settings (top right) → Engine Scalability Settings → Medium.

## Licences

Everything in the files is CC0 except two models under **CC BY 4.0**, which must keep their credit
wherever the files go (a game, a video, screenshots): the **children's slide** (Chapter Two) by
sergeilihandristov and the **Seven Foot Knoll Lighthouse** (Chapters Two and Three) by Katie
Wolfe. Full sources: [ASSETS.md](ASSETS.md); the export folder has a `CREDITS.md`.
