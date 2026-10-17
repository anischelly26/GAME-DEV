# Visual art direction

Status: **direction** (2026-10-17). It extends "Look and sound" in [GAME_DESIGN.md](GAME_DESIGN.md)
and applies to Phase D (Chapter One polish) and every later space. *It Takes Two* is a reference for
readability and density only; nothing of its art is reproduced.

## The look in one line

A **handmade maritime-industrial toy world**: chunky, rounded, chipped shapes; warm practical light
against cold sea air; brass, iron, stone, wood and canvas that look used and cared for; one small,
bright, readable hero.

## Principles

1. **Mara is always the brightest warm thing near the centre of the frame.** Ochre jacket, coral
   scarf. Nothing else near her path uses those two colours at that saturation.
2. **Warm means go, cold means world, red means danger.** Amber service lights mark the route;
   teal and blue fill the world; the Watch's red lamp and alarm are the only reds.
3. **Every space frames the next.** From each checkpoint, the next goal is visible or announced by
   light or sound (the hall from the lookout; the hangar from the breach; the lighthouse from the
   yard).
4. **Big shapes first.** A space reads in three values (sky or void, mass, light) before detail.
   Detail clusters where the player stops and looks; corridors stay calm.
5. **Things look made.** Rivets, welds, patches, repairs, labels, chalk. Ivo's repairs are newer
   copper than everything around them.
6. **Toy scale, real light.** Shapes are slightly exaggerated (thick rails, big valves, round
   bollards); lighting and materials are physically based so the toy world feels solid.

## Palettes by chapter (built presets, `src/levels/chapters.ts`)

| Chapter | Time | Key light | Sky and fog | Accents |
| --- | --- | --- | --- | --- |
| One, *The Quiet Cell* | Night | Cold moon `#a9c8ff` | Deep teal `#14303a` fog | Amber lamps, steam white, chevron amber |
| Two, *The Warders' Green* | Dawn | Low gold sun `#ffc58f` | Blue to peach sky, grey-blue mist | Hedge greens, slate roofs, rust, children's paint |
| Three, *The Low Tide* | Late morning | High white sun `#fff0da` | Pale blue, little fog | Sea teal, sand, buoy red and white, lighthouse cream |
| Four (proposal) | Night, fog | Arcade neon and sodium lamps | Fog lit from below | Faded fairground colours, brass, glass |

## Lighting rules

- **One key, one fill, then practicals.** The key sets mood and shadows; the hemisphere fill keeps
  shadows readable (never pure black); practical lamps carry the story and the route.
- **Practical lamps are on the route.** If a lamp is lit, something is there.
- **Rim light on Mara** in dark spaces, so her silhouette reads (proposal: there is no rim light
  today; Phase D adds one and measures its cost).
- **God rays and fog shafts** only where light has a reason to be dusty (steam, sea spray,
  windows).
- **The render safety pass stays.** The sanitize pass clamps colour to 48 and removes NaN before
  bloom; every new light or emissive material is checked at High for black frames, and no material
  ships with zero roughness on a large surface.

## Materials

- Photographed CC0 sets (Poly Haven, ambientCG) for large surfaces; checked for tiling at play
  distance.
- Stone is chipped and rounded at the edges (bevelled geometry), never a sharp box.
- Metal is painted and worn: paint on flat faces, bare metal on edges and handles.
- Water: opaque at depth, clear and bright at the edge; foam where it meets things.
- Vegetation: dense near the path, sparse and in clumps far away; it moves in the wind.

## Readability rules for play

- Climbable edges are lighter and worn (a pale lip, scuffs), and consistent across chapters.
- Vaultable obstacles are knee-to-waist high, chunky, and have nothing on top.
- Hazards and gates are high-contrast and animated.
- Jumps the route needs have a landing spot visibly bigger than Mara's shadow.
- Mara's drop shadow (built) is always visible on the ground under her in the air.

## Quality profiles

Auto / High / Low stay. What Low changes today (`setQuality` in `src/core/Game.ts` and
`RenderPipeline`): pixel ratio 1 instead of up to 2, no GTAO, no bloom (and so no sanitize pass,
which only guards bloom), FXAA instead of 4x MSAA, a 1536 shadow map instead of 4096, and no
shadows from small props or point lights. Low must keep every gameplay cue (lamps, chevrons, the
Watch's lamp); it may only drop quality. Each visual feature added in Phases C to E states what it
does on Low.

## Assets

Only assets with a known licence (CC0 or CC BY with credit), recorded in [ASSETS.md](ASSETS.md):
source, author, licence and what it is used for. No game rips, no store assets without a licence
that allows this use, no copyrighted music.

## Phase D (Chapter One polish), the concrete list

From the audit; each item is checked by a screenshot from a fixed camera before and after.

1. The turbine hall reveal: stronger depth (fog layers between tiers, a far wall lit by the moon
   through a high window), a moving element in the distance (the flywheel).
2. The cell: inspectable details lit by the moon through the slot; more lived-in props.
3. The shaft: water on the floor with ripples under drips; amber service lights with halos.
4. The engine: steam vents on the 4.2 s breath, visible from far away.
5. The breach exit: a wider, more dramatic view over the sea, the hangar lights, Pip's arrival
   (Phase C).
