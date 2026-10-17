# IT TAKES ONE — Sketchfab asset triage and creative integration

**Date:** 2026-10-17  
**Status:** PROPOSED ONLY — not downloaded, not imported, not licensed/approved for shipping, not playtested.  
**Branch basis:** `claude/world-feel-design` (draft PR #9), stacked on `claude/game-feel` (draft PR #8).  
**Source:** Eight Sketchfab links supplied by the creative owner. The pages blocked full direct retrieval during research; searchable/indexed Sketchfab snippets supplied only partial model metadata. **Verify every exact current Sketchfab listing, downloadability, author permissions and license in a browser BEFORE downloading or using.** Do not treat "free to view" or a uploader-applied Creative Commons badge as proof of ownership.

This proposal does not modify `docs/ASSETS.md` because no new asset was acquired or integrated. Approved acquisitions must then be recorded there with URL, author, license, modifications, full model provenance, and title-screen/in-game attribution where required.

## Executive decision

Make one cohesive arc: **the tide engine's ruined factory → the warders' abandoned village → the copper deep → the clockwork arcade**. Every asset must either support a gameplay mechanic or tell the story. Asset variety alone does not create a good game.

Prioritize the **old factory for environment study**, the **copper octopus for a marine-machine set piece**, the **patchwork bear as an emotional prop**, and the **rabbits relief as a clue/puzzle prop** — all **conditional on confirmed rights and real asset inspection**. The **pirate map** can become a distant, original optional island much later. **Do not import** the KartRider map or the Jurassic: The Hunted dinosaur; both carry third-party game-IP provenance concerns. **Do not use** the paid, marked NoAI alien rhinoceros for AI-based transformation; it is also off-theme.

## Source-by-source triage

| Supplied asset | Known listing facts (unverified current terms) | Gameplay proposal | Decision |
| --- | --- | --- | --- |
| [Old factory FREE](https://sketchfab.com/3d-models/old-factory-free-9d0acdbe78944c098689c0d34853e57b) | Uploader dasy444; indexed **113.7k triangles**; listing indexed as downloadable / "Free" license type. Description says old factory originally created for a zombie-apocalypse setting. | Study the silhouette and spatial language for a ruined **pressure-exchange works**, accessible as a small high-value detour near the Pier Arcade; re-art-direct to the maritime copper world. | **Conditional prototype**; check exact Free Standard rights, collisions, PBR maps, and texture costs. |
| [Stitched patchwork bear](https://sketchfab.com/3d-models/stitched-patchwork-bear-2d-to-3d-supavoxel-4ede1a2907e54d41a561e52e13784734) | Indexed as free download and CC BY; about **1.5 million triangles**; described as image-to-3D SupaVoxel output. | A stationary weather-worn child's bear on the playground swing, later mirrored in the arcade memory theatre. It belongs to the missing lighthouse-keeper family's story. | **Strong narrative candidate; do not import raw.** Needs drastic mesh reduction, material cleanup, size inspection, and exact license/provenance confirmation. |
| [Copper octopus](https://sketchfab.com/3d-models/copper-octopus-hyper3d-vs-meshy-vs-supavoxel-32961ea78e3c4f7595e9469a9189e599) | Indexed as free download; generated from image with SupaVoxel; uploader page indicates about **486k vertices**. Rig and license need confirmation. | Inspiration for **The Copper Deep**: an old submerged maintenance automaton whose articulated arms hold the lighthouse intake gates. A playable interaction, not a random marine boss. | **Strongest spectacle idea; conditional**. Do not assume the model is rigged or game-ready. Prefer original lightweight rigged interpretation if unusable. |
| [Leaping Rabbits Relief](https://sketchfab.com/3d-models/leaping-rabbits-relief-meshy-3d-vs-supavoxel-f7eb1885d92f43fa9b44b5dfa2ed5450) | Indexed as free CC BY mesh generated via image-to-3D workflow; mesh cost needs inspection. | A relief carved by Edda, one of several **cam-pattern puzzle clues** in the arcade. Light passing through relief shadows reveals a valve order; offer non-color and non-audio cues. | **Conditional decorative/puzzle use**; heavily optimize or reproduce a new original relief if appropriate. |
| [KartRider village A07](https://sketchfab.com/3d-models/kartrider-village-a07-2b1d2cca2aa541a78872cb045b8d3f5b) | Named after the **KartRider** franchise; indexed as free/CC BY uploaded by another user. | **Do not import the map.** Instead study the broad idea of friendly readable silhouettes and build original village forms from properly licensed modular pieces. | **BLOCKED** pending evidence of rights from underlying game IP owner, not merely uploader's listing. |
| [Jurassic: The Hunted Tyrannosaurus Rex](https://sketchfab.com/3d-models/jurassic-the-hunted-tyrannosaurus-rex-52041d6b4f544b7c8ce34f5633bf56b0) | Description states rig and in-game scale are from the **Xbox 360 game** and notes extraction. | **Do not import or adapt the ripped game model.** If a chase is desired, design an original maritime automaton rather than a disconnected T-Rex. | **BLOCKED** without underlying rightsholder permission. |
| [Game pirate adventure map](https://sketchfab.com/3d-models/game-pirate-adventure-map-696dfa212fda4240817615bdccb373d0) | Uploader noyou; listed **CC BY**; ~**59.3k triangles**, ~45.3k vertices; downloadable (2020). | Possible later **Ghostlight Isle** exploratory stop, not a substitute for the current coast; repurpose a few geographic ideas with original staging, causeways and collectibles. | **Conditional future-use candidate**, license relatively promising, but inspect and art-direct. |
| [Alien rhinoceros](https://sketchfab.com/3d-models/alien-rhinoceros-bc9b2629050b4f479c0629cf345c9fe2) | Store product, not evidenced as free download; artist mitkoogrozev; **NoAI** marked; about 50.8k preview triangles, store asset variants/textures described. | Could inspire the idea of unusual wildlife much later, but not a maritime plot fit today; do not use the model or images as AI inputs. | **DEFER / DON'T BUY** unless it serves an owner-approved chapter, commercial license is reviewed, and no AI-use restrictions are breached. |

## Creative concept A: The Factory That Breathes (Chapter One / future pier underworks)

**Premise:** an abandoned pressure-exchange building beneath the seaside arcade is still receiving water and steam from Breakwater's central governor. This strengthens continuity between the prison and the amusement machines.

**A playable 90-second version:**
1. Mara and Pip enter a vast quiet pumpworks chamber. Bronze pistons move when the engine breathes; spotlight catches copper repairs tagged `IV`.
2. Player uses sprint → grind → double jump to access a valve cabinet. Landing targets are readable.
3. Pip crawls into a dry maintenance hatch to hold open a bypass, but the player must actually operate the valves and time the vent.
4. Water pressure briefly turns machinery into a musical sequence that sounds like the arcade automata.
5. The exit frames the glow of the distant pier and an important clue to Edda's spiral.

**Hard rule:** do not replace existing hall geometry with a foreign full model. Prototype as a smaller room or vista. Either optimize and substantially art-direct a permitted asset, or build a new original scene using modular pieces.

## Creative concept B: The Copper Deep (Chapter Three signature encounter, after current skiff passage)

**Premise:** submerged mechanical octopus, originally made for clearing tidal intake pipes, now obeys broken harbor safety rules. It is not evil; its job is to protect the lighthouse from damage, and the Watch has commandeered its signal.

**Three acts, player controlled:**
1. **Read it:** as the skiff rounds a buoy, a copper arm emerges and lifts a fallen navigation marker. Pip's eye/needle reacts. Silhouettes and mechanical noises establish enormous scale.
2. **Solve it:** players use the existing tide surge and steer to reach an intake with a pressure coupling; the octopus arms dynamically create safe/unsafe lanes with generous telegraphs, never random hitboxes.
3. **Befriend it:** Mara reroutes the coupling. The octopus recognizes Edda's maintenance pattern and opens a safe path to the lighthouse; one arm carries the skiff across a broken reef (still playable for final disembark). A small moment of connection replaces a generic kill-the-boss finale.

**Technical gate:** do not promise full eight-arm articulated behavior using raw generated geometry. First inspect the asset and create a low-poly original segmented skeleton / procedural arm test with independent, simplified colliders. Only substitute a downloaded source if rights, poly budget, UV quality, rigging and animations pass. Do not compromise the current 9 s water-surging challenge.

## Creative concept C: The Bear Who Stayed (Chapter Two → Four)

**Narrative prop, not a sidekick overload.** The patchwork bear belonged to the lighthouse keeper's child. First appear on the abandoned swing, wet and frayed, facing the water. Pip's gauge needle recognizes its stitched spiral. Mara can pick it up or leave it; do not force a collectible hunt.

In the Pier Arcade, a matching memory theatre booth once repaired toys. If the bear was found, Mara recognizes a name on the booth; if not, a nearby framed photograph delivers the same plot clue. This ensures main progression is never blocked by the optional pickup.

One short character beat:
- Mara: "Someone was waiting for him."
- Pip goes quiet and folds its fins.
No exposition dump, no high-emotion manipulation; leave space for the player to interpret the scene.

**Asset gate:** 1.5M triangles for a small prop is unjustified. Rebuild a low-poly proxy with baked normal/color maps, possibly lower than 5k–15k triangles depending camera distance and actual profiling. This is a *target to validate*, not a guarantee of retained visual fidelity.

## Creative concept D: The Rabbit Light (Chapter Four mystery)

A carved relief of leaping rabbits casts overlapping shadows across a wall. The shadows form an Edda spiral when the player rotates a mechanical shutter. This is a visual clue to the cam timing puzzle, but not a literal copyrighted or one-to-one asset copy. The solution must be readable without relying solely on color, sound or precise timing.

This should be a meaningful one-minute interaction, not an arbitrary keypad minigame.

## Character and world focus

Do not introduce eight unrelated speaking characters because eight assets were provided. Mara + Pip + Ivo + Sorn already give a coherent spine. The bear has human history; the octopus can have expressive mechanical body language and one story role. The factory and relief connect the mother's engineering to the world. A fantasy dinosaur and alien rhinoceros would currently confuse the tonal identity.

## Asset pipeline for Claude — mandatory checklist

1. **Rights first**: open the exact Sketchfab URL, record creator and listing license version, provenance of *every* mesh/texture/animation, and author rights. Reject any named game rip or uncertain derivative regardless of a "CC BY" badge. Preserve screenshots/evidence of license page in private project research if available. Never incorporate material marked NoAI into generative AI inputs.
2. **Acquisition only after clearance**: never scrape restricted downloads, never infer raw-asset URLs, never substitute an unrelated model. If unable to download, report as blocked and use an original placeholder created in code.
3. **Geometry and visual inspection**: use Blender/gltf-transform as appropriate for retopology, decimation, meshopt/Draco, normal/roughness baking, atlas consolidation, KTX2 where supported. Inspect appearance after optimization. Do not promise that auto-decimation creates a riggable creature.
4. **Physics**: create simplified Rapier colliders; never auto-use every render triangle as moving colliders. Test camera occlusion, nav paths and landings.
5. **Per-chapter costs**: lazy load per chapter; record download MB, triangle count, draw calls, GPU resources, JS heap, first-load time and before/after frame-time distribution on both target GPUs. Compare 95th/99th percentile as well as worst stalls. Do not assert a numeric budget works before measuring.
6. **License docs**: after approved import, update `docs/ASSETS.md` with author, exact source, license URL/type/version, transformations and credits. Remove an asset from build if rights cannot be proven.
7. **Tests**: load/collider/camera tests; cinematic skip/checkpoint tests; level navigation with `?watch=1` as appropriate; leak/disposal tests on repeated chapter transitions. Record actual commands/results and video evidence.
8. **Design quality gate**: play the entire route and judge whether the imported art fits lighting and scale. Replace a beautiful but incoherent model with an original, simpler scene if it makes the game better.

## Prioritized build order

**P0 — no asset changes yet:** Verify licenses and model provenance; profile the existing long frame stalls reported in PR #8, which take precedence over new rendering work.

**P1 — lowest-risk emotionally rewarding scene:** Chapter Two's patchwork bear as an original low-poly proxy plus the children's drawing; integrate conditional clue payoff later. No 1.5M raw geometry.

**P2 — one cinematic mechanic prototype:** Chapter Three's copper maintenance arm, with a primitive low-poly arm and a three-act gameplay test. If it is not genuinely more fun, cut it.

**P3 — place-making:** Rebuild one visual anchor in the underworks/factory style; contrast moonlit iron with copper warmth. Check framerate and player orientation.

**P4 — Chapter Four preproduction only:** Rabbit shadow relief / memory drum, and optional island mood references. Don't build full map until the transitions and gameplay loops work.

**Never:** copy KartRider village geometry, import extracted Jurassic: The Hunted T-Rex, or use the NoAI store rhino in image generation/AI conversion.

## Suggested first implementation PR

After the owner's approval of the direction, Claude should build only the **Bear + Copper Arm graybox proofs** with original licensed primitives/CC0 materials first. Stage the bear in Chapter Two and a single octopus-arm mechanism in Chapter Three using existing physics; add two Playwright tests per interaction and a before/after video. **Do not download any linked models until rights are verified.** Once the gameplay is proven fun, investigate permitted model substitution/optimization.

**Review state:** this document is a proposal. No code, licensed assets, gameplay tests, art import or player sessions were performed for this design-only change.
