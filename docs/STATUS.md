# Status

**Branch:** `claude/first-playable` (draft PR into `main`). The revision is in the PR and in
`git log`. This file is updated with each iteration.
**Build:** Chapter 1 first playable section, *The Quiet Cell*. Production gate **A** (from the
prompt pack) is ready for independent review. It has **not** been reviewed or approved by Codex
yet.

## Implemented

- **Runtime.** Browser game (three.js r186 + Rapier 0.21 + Vite). Fixed 60 Hz simulation with
  render interpolation; title, pause and completion screens; settings saved locally.
- **Controls.** Keyboard and mouse (pointer lock or drag-to-look), standard gamepads, AZERTY-safe
  physical keys. Presses are queued so none are lost between frames. Input is released on pause
  and on focus loss.
- **Movement.** Kinematic character controller with fast acceleration and stopping, coyote time,
  jump buffering, variable jump height, a ledge assist for jumps that fall just short, and
  moving-platform carry (built, not used in this slice).
- **Camera.** Orbit camera with sphere-cast collision, instant pull-in and smooth return, an
  over-the-shoulder tilt when walls force it close, per-area camera zones, avatar fade when very
  close, manual recenter, and per-checkpoint respawn framing.
- **Slice content.** Mara's cell with the pressure-hatch puzzle (diagram, bypass valve, gauge,
  piston, lever, latch); maintenance shaft with a practice jump and a 2.0 m drainage gap; service-
  light checkpoints; fall recovery; the lookout reveal of the turbine hall and harbour beacon;
  intercom line; completion card with replay.
- **Systems.** Interaction (focus by distance and facing, contextual prompts), flags and
  objectives, forward-only checkpoints, trigger volumes, subtitles, three-tier hints (timed and
  on demand), procedural audio, debug overlay, physics overlay, checkpoint teleports, and an
  autopilot that plays the route through real inputs.

## Verification

Environment: Windows 11 Pro, NVIDIA GeForce RTX 2050 laptop GPU, Node 22.13.1. Browser checks ran
headless in Microsoft Edge (Chromium, GPU) and in Playwright's bundled Chromium 1243 (software
rendering).

**Verified by execution**

- `npm run typecheck`, `npm test` (20 unit tests) and `npm run build` pass.
- End-to-end suite, 8/8 passing in Edge (1.1 min) and 8/8 in Playwright's bundled Chromium with
  software rendering (9.5 min): boot and render without console errors; movement, stopping and
  jumping; the wrong-state lever; full route by autopilot with real physics (zero falls); fall
  recovery keeping puzzle state; restart after completion gives a fresh puzzle; pause; jump
  measurement.
- Measured running jump 3.66 m, apex 1.38 m. The required gap is 2.0 m (55%) and the practice
  girder is 0.6 m.
- The production build (`npm run preview`) boots to the playing state.
- Screenshots of each area were inspected while iterating on art and camera.

**Reviewed in code only**

- Gamepad mapping (no controller attached during testing).
- Pointer-lock behaviour and pausing on focus loss in a real, headed browser window (automation
  runs headless).
- Audio: every effect is code-reviewed, but no listening test was possible here.
- Camera behaviour under real mouse input (automated tests drive the camera API directly).

**Not yet verified**

- A human first-time playtest: comprehension, fun, difficulty.
- Frame rate on real hardware. Headless numbers are not representative and are not reported as
  performance.
- Firefox and Safari.
- Small screens and touch: there are no touch controls.

## Known issues and limitations

- **Software rendering is slow and memory-heavy.** In Playwright's bundled headless Chromium, the
  page crashed once while a probe script rendered 480 consecutive frames at High quality. Test
  mode now defaults to Low quality, and the e2e suite (which renders sparsely) passes there. Avoid
  editing source files while tests run against a dev server: hot reload restarts the page mid-test.
- **Bundle size.** 5 MB of JS (1.9 MB gzipped), mostly Rapier's embedded WASM. Fine locally;
  worth splitting before any public hosting.
- **Placeholder art and sound.** Mara is a primitive proxy model with procedural animation, and
  textures and sounds are procedural placeholders (see [ASSETS.md](ASSETS.md)).
- **Back of Mara's head** reads as a dark disc at some angles: a proxy-model limitation.
- **No persistent save.** Reloading the page restarts the section.
- **The lookout is the end.** The turbine hall beyond is a backdrop. Its walkways have colliders
  for the next increment, but the lookout railing keeps the player in.
- **The reveal locks control for about 7 seconds** (camera move, lamps, intercom). It cannot be
  skipped yet.

## Temporary assets

All content is procedural and original. Proxy items to replace: the Mara model and animation,
synthesised audio, and the stone, metal and fabric textures. Nothing third-party is bundled
besides the code libraries listed in [ASSETS.md](ASSETS.md).

## Next milestone

After Gate A review fixes: a **parkour practice route** and **The Breathing Engine** set piece in
the turbine hall, on the separate branch `claude/breathing-engine` (design in
[GAME_DESIGN.md](GAME_DESIGN.md#next-increment-designed-not-built-parkour-practice-route--the-breathing-engine)).
