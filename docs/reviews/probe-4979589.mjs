// Independent review probes. Does not change implementation. Run from repository root.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';
const out = 'artifacts/codex-review-4979589';
mkdirSync(out, { recursive: true });
const server = await createServer({ server: { host: '127.0.0.1', port: 5213, strictPort: true } });
await server.listen();
let browser;
const results = { errors: [], measurements: {} };
try {
  browser = await chromium.launch({ channel: 'msedge', args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  results.browser = browser.version();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', e => results.errors.push(String(e)));
  await page.goto('http://127.0.0.1:5213/?test=1&dev=1&quality=low');
  await page.waitForFunction(() => window.__GAME?.ready, null, { timeout: 120000 });
  results.renderer = await page.evaluate(() => {
    const gl = __GAME.game.pipeline.renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  });
  await page.evaluate(() => __GAME.stepFast(60));
  await page.mouse.move(600, 360);
  await page.mouse.down({ button: 'right' });
  const before = await page.evaluate(() => ({ yaw: __GAME.game.camera.yaw, pitch: __GAME.game.camera.pitch }));
  await page.mouse.move(601, 361);
  await page.waitForFunction(y => Math.abs(__GAME.game.camera.yaw - y) > 0.001, before.yaw);
  const after = await page.evaluate(() => ({ yaw: __GAME.game.camera.yaw, pitch: __GAME.game.camera.pitch }));
  await page.mouse.up({ button: 'right' });
  results.measurements.mouseOnePixel = { before, after, yawDelta: after.yaw - before.yaw, pitchDelta: after.pitch - before.pitch };
  await page.screenshot({ path: `${out}/probe-mouse-one-pixel.png` });
  results.measurements.sensitivity = [];
  for (const sensitivity of [0.2, 3]) {
    await page.evaluate(() => __GAME.pause());
    await page.locator('[data-s="sensitivity"]').fill(String(sensitivity));
    await page.locator('[data-a="resume"]').click();
    await page.evaluate(() => { document.exitPointerLock(); __GAME.setCamera(0, 0.32); });
    await page.mouse.move(600, 360);
    await page.mouse.down({ button: 'right' });
    const b = await page.evaluate(() => __GAME.game.camera.yaw);
    await page.mouse.move(601, 360);
    await page.waitForFunction(y => Math.abs(__GAME.game.camera.yaw - y) > 0.001, b);
    const a = await page.evaluate(() => __GAME.game.camera.yaw);
    await page.mouse.up({ button: 'right' });
    results.measurements.sensitivity.push({ setting: sensitivity, yawDelta: a - b });
  }
  // Test actual keyboard event handling, with deterministic simulation timing.
  await page.evaluate(() => { __GAME.restart(); __GAME.setCamera(0, 0.32); __GAME.stepFast(30); });
  const kbBefore = await page.evaluate(() => __GAME.state());
  await page.keyboard.down('KeyW');
  await page.evaluate(() => __GAME.stepFast(20));
  await page.keyboard.up('KeyW');
  results.measurements.keyboardMovement = { before: kbBefore, after: await page.evaluate(() => __GAME.state()) };
  // Observe repeated unsolicited hints without manually requesting a hint.
  results.measurements.hints = await page.evaluate(() => {
    __GAME.restart();
    const lines = [];
    __GAME.game.events.on('line', l => lines.push({ time: __GAME.game.time, ...l }));
    const start = __GAME.game.time;
    __GAME.stepFast(60 * 280);
    return { start, lines, state: __GAME.state() };
  });
  // Paused UI input should not become queued gameplay on resume.
  await page.evaluate(() => { __GAME.restart(); __GAME.stepFast(30); __GAME.pause(); });
  await page.keyboard.press('Space');
  await page.locator('[data-a="resume"]').click();
  const p0 = await page.evaluate(() => __GAME.state());
  await page.evaluate(() => __GAME.stepFast(10));
  results.measurements.pauseInput = { before: p0, after: await page.evaluate(() => __GAME.state()) };
  // Time control lock during lookout reveal using the documented dev fixture.
  results.measurements.revealLock = await page.evaluate(() => {
    __GAME.restart(); __GAME.teleport('lookout');
    __GAME.game.interactions.get('lookout-light').interact();
    let lockedSteps = 0;
    for (let i = 0; i < 1800; i++) {
      __GAME.game.fixedStep();
      if (__GAME.game.player.frozen) lockedSteps++;
      if (__GAME.state().flags.includes('reveal.done')) break;
    }
    return { lockedSeconds: lockedSteps / 60, state: __GAME.state() };
  }).catch(e => ({ diagnostic: String(e) }));
  await page.evaluate(() => { __GAME.restart(); __GAME.setCamera(Math.PI, 0.05); __GAME.step(30); });
  await page.screenshot({ path: `${out}/probe-character-front.png` });
  // Confirm camera on normal realtime build, through Begin and captured mouse.
  await page.goto('http://127.0.0.1:5213/?dev=1&quality=low');
  await page.locator('[data-a="start"]').click({ timeout: 120000 });
  await page.mouse.move(600, 360);
  const normalBefore = await page.evaluate(() => ({ yaw: __GAME.game.camera.yaw, state: __GAME.state().gameState, locked: !!document.pointerLockElement }));
  await page.mouse.move(601, 360);
  await page.waitForFunction(y => __GAME.game.camera.yaw !== y, normalBefore.yaw);
  results.measurements.normalModeMouse = { before: normalBefore, after: await page.evaluate(() => ({ yaw: __GAME.game.camera.yaw, state: __GAME.state().gameState })) };
  console.log(JSON.stringify(results, null, 2));
} finally {
  writeFileSync(`${out}/independent-probes.json`, JSON.stringify(results, null, 2));
  await browser?.close();
  await server.close();
}
