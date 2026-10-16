# Chapter One: player-experience audit

**Pass:** branch `claude/chapter-one-quality`, after `2cb6520` (PR #3).

**Method.** `scripts/audit-route.mjs` plays the whole chapter through the real input pipeline,
using the autopilot. It records what the normal gameplay camera shows every 2 s, together with
the checkpoint, objective, camera zone, arm length and the subtitle on screen. Problems were
then reproduced and probed directly:

- `Physics.debugSphereCast` shows what the camera hits;
- `tests/e2e/jumps.spec.ts` plays every jump with real keys;
- `scripts/trace-stalls.mjs` and `scripts/count-draws.mjs` cover performance.

**Limits of the method.**

- The autopilot never turns the camera, and it is faster than a person. A few cramped frames in
  the audit are artifacts of that; they are noted below.
- **No person has played this pass.** Comprehension, fun and feel are not established.

## What a player would have hit, and what changed

| # | Moment | Problem | Change | Evidence |
| ---: | --- | --- | --- | --- |
| 1 | Everywhere | **Subtitles lagged events.** Lines queued behind each other: the cell's "Fresh copper…" line played on tier one, and puzzle remarks covered the intercom at the ending. | Remarks expire after 3 s in the queue. Puzzle feedback waits up to 6 s with priority. Story lines (intercom, horn, cinematics) never expire and cut in after a remark has shown for 0.9 s. | `tests/unit/dialogue.test.ts`; audit frames |
| 2 | Shaft | **The practice jump led into the real one.** A running jump over the girder landed at the drainage channel's lip, and a held key carried Mara in. | The girder vaults at a run. A railing guards the near lip except at a lit crossing where the old catwalk broke away. | `jumps.spec.ts`: "girder … W" now ends between the girder and the railing |
| 3 | Shaft, lookout | **Tutorial text** ("Press Space to jump", "The rope … has dropped", "Lit service lights mark…"). | Removed. The jump key appears only after 7 s at the girder without a jump. A remark about the rope gate comes only after 16 s at the lookout. | Code; audit |
| 4 | Climb on tier one, out of the hatch | **The camera collapsed into Mara** (0.35–0.45 m) against a lintel or wall above. | The arm tries lower angles, then a shoulder shift of up to 0.9 m, keeping the yaw. Hatch: 0.45 → 4 m. Climb: 0.35 → 1.1 m. | Audit arm lengths; camera unit tests |
| 5 | Tier one | **The camera could pass behind the cell bars into the dark recesses and see through the hall.** The openings had no colliders. | Each opening is closed at the bars for the camera and the player. | Probe frames |
| 6 | Collar ride | **The flywheel filled 60% of the frame.** It is visual-only, so the camera went behind it. | Camera-only colliders on the flywheels (new `CAMONLY` layer). | Audit frame 016 |
| 7 | Tier three, breach | **A black band filled the top third.** The roof ring's unlit underside sat right over the camera. | A tier-three camera zone with a shorter arm. | Audit frames 019–023 |
| 8 | Any jump | **The camera turned itself mid-air** (review 492bce4 R3), and turning the mouse mid-jump bent a held key. | Assist only on the ground, moving forward, outside precision volumes, and after the player leaves the camera alone. In the air, a held direction keeps its takeoff camera yaw. | `jumps.spec.ts`, camera rotating: without the latch, 6 of 10 cases bend 6.5–8° |
| 9 | Close camera | Mara's dithered fade read as grain at 0.7–1.25 m. | Fade only inside 0.38–0.72 m. | Audit frames |
| 10 | Cell | **Nothing said why she is here, or that someone expected her.** | The warden's transfer order nailed inside her door ("Received: night tide, asleep … Hold in cell C-4 until she signs"), with Ivo's pencilled reply. Dust falls off the hatch wall at each breath of the engine. | `docs/evidence/chapter-one-quality/` |
| 11 | Both puzzles | **Cause and effect lived in gauges only.** The ram had no visible connection to the feed. | Amber chevrons on the pipework light up and run toward wherever the pressure goes (cell: vent or piston; breach: steam curtain or ram). A new feed pipe runs round the wall to the ram. | Screenshots |
| 12 | Ending | **No destination to see.** The completion menu overlapped the story card, and stale lines played over it. | A seaplane hangar on a rock spur beyond the breach; its lights come up as the intercom names the aircraft. "Chapter One complete" is a title card laid over that view. | `scripts/capture-ending.mjs` |
| 13 | First drop into the hall | **A 0.3–1 s stall on the Intel GPU** (first-sight buffer and texture uploads). | One warm-up draw at load, with culling off. | `trace-stalls.mjs`: worst frame 638–1048 → 326 ms |
| 14 | Everywhere, Intel UHD | **The shadow pass redrew 392 casters a frame**, 241 of them tiny props. | On Low, props under 0.25 m no longer cast moon shadows. | `count-draws.mjs`: route 601 → 362 calls |

## Known remaining issues, from the audit

- **The deck lever on the collar** stands 0.8 m from the engine column. With the camera pointed
  at the column (as the autopilot leaves it), the arm is pinned and Mara fades out. A player
  walking up to the lever has the camera behind them. The camera does not auto-turn during
  interactions, by design.
- **Directly after dropping off the gantry** the arm takes about 2 s to ease back out (0.75 m).
  The view of the shuttle ahead stays readable.
- **The hall is still dark in places.** The route lamps mark the way, but there is no extra
  real-time light (deliberately, for the Intel GPU).
- **Sound** is unchanged: synthesised placeholders. The flow strips have no sound of their own.
