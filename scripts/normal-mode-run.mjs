#!/usr/bin/env node
/**
 * Plays the whole route in NORMAL mode (no ?test flag): title screen, Begin, real-time loop with
 * the fixed-step accumulator, pointer-lock request, HUD and audio paths, exactly as a player gets
 * them. The autopilot supplies the inputs. Reports completion, falls, wall-clock time and the
 * in-game frame-rate estimate (headless; not representative of real hardware).
 *
 *   npm run dev            (in another terminal)
 *   node scripts/normal-mode-run.mjs [--url http://localhost:5173] [--channel msedge] [--quality high|low]
 */
import { chromium } from 'playwright';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] ?? '']] : acc), []),
);
const url = args.url || 'http://localhost:5173';
const quality = args.quality || 'high';
const browser = await chromium.launch({ channel: args.channel || undefined, args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => (m.type() === 'error' ? errors.push(m.text()) : undefined));

const t0 = Date.now();
await page.goto(`${url}/?autoplay=1&quality=${quality}`);
await page.locator('[data-a="start"]').click({ timeout: 180000 });
const begun = Date.now();
console.log(`title -> Begin after ${((begun - t0) / 1000).toFixed(1)} s (includes loading)`);
const fps = [];
let s = null;
while (Date.now() - begun < 12 * 60 * 1000) {
  await page.waitForTimeout(2000);
  s = await page.evaluate(() => ({ ...window.__GAME.state(), fps: window.__GAME.fps() }));
  fps.push(s.fps);
  if (s.complete && s.flags.includes('engine.finished')) break;
  if (s.autopilot && s.autopilot.state === 'failed') break;
}
const sorted = [...fps].sort((a, b) => a - b);
console.log(
  JSON.stringify(
    {
      quality,
      gameState: s?.gameState,
      complete: s?.complete,
      finished: s?.flags.includes('engine.finished'),
      autopilot: s?.autopilot ? `${s.autopilot.state} ${s.autopilot.step}/${s.autopilot.total} ${s.autopilot.message ?? ''}` : null,
      falls: s?.falls,
      wallClockSeconds: Math.round((Date.now() - begun) / 1000),
      headlessFps: { median: sorted[Math.floor(sorted.length / 2)], min: sorted[0] },
      pointerLocked: await page.evaluate(() => !!document.pointerLockElement),
      consoleErrors: errors,
    },
    null,
    2,
  ),
);
await browser.close();
process.exit(s?.complete && errors.length === 0 ? 0 : 1);
