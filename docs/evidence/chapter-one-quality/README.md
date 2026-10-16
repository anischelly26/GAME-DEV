# Chapter One quality pass: screenshots

Captured on branch `claude/chapter-one-quality` at commit `326114e`, using Edge on Windows 11 at
1280×720 with the Low preset.

- `scripts/capture.mjs --format jpg --only …` gives fixed viewpoints. Mara stands at a set spot,
  and the camera is placed as a player would leave it.
- `scripts/capture-ending.mjs` plays the split feed and the jump, then the ending.
- The transfer order was opened with E at the cell door.

The simulation is stepped deterministically, so these frames show framing, readability and
content, not motion or frame rate. In fixed-viewpoint captures the Warden's horn line sometimes
shows, because test mode starts without the opening.

| File | Area | What to look at |
| --- | --- | --- |
| `02-cell-wall.jpg` | Cell | Hatch wall, diagram, gauge, valve. The amber chevrons are on the vent branch: the bypass is open. |
| `03-transfer-order.jpg` | Cell | The warden's transfer order and Ivo's pencilled reply. |
| `05-gap.jpg` | Shaft (first traversal) | The railing along the channel's near lip, its torn end, and the lit crossing at the right. The lit far landing leads to the lookout. |
| `06-lookout.jpg`, `07-lookout-wide.jpg` | Lookout (the machinery well reveal) | The engine column and the hall through the ruined cell front. |
| `10-vault-rail.jpg` | Tier one | The striped barrier beam. |
| `11-ledge-gantry.jpg` | Tier one | The spares rack and the gantry edge to climb. |
| `13-engine-gantry.jpg` | Collar | The BRAKE gantry and the collar. |
| `18-feed-junction.jpg` | Split feed | Feed to VENT: chevrons run along the cracked main to the steam curtain; the ram's pipe is dark. |
| `19-ram-primed.jpg` | Split feed | Feed to RAM: chevrons run along the new feed pipe round the corner and down to the ram. |
| `ending/01-…`, `ending/02-…` | Ending | Out of the breach, then over the shoulder to sea. The hangar is already visible at the left. |
| `ending/03-…`, `ending/04-…` | Ending | The intercom names the hangar; its work lights come up behind the floatplane. |
| `ending/05-ivo.jpg`, `ending/06-chapter-complete.jpg` | Ending | "Ivo. It has to be." Then "Chapter One complete" over the view, with time, falls and the choices. |

The opening (the cards, Mara waking, the chapter title) is in
[../chapter-one/](../chapter-one/).
