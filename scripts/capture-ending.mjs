#!/usr/bin/env node
/**
 * Screenshots of Chapter One's ending: the autopilot plays the split feed and the jump to the exit
 * gantry, then frames are taken at fixed times into the ending sequence (over-the-shoulder view,
 * the hangar lights coming up, the completion card over the vista).
 *
 *   npm run dev            (in another terminal)
 *   node scripts/capture-ending.mjs [--url http://localhost:5173] [--channel msedge] [--size 1280x720] [--quality low] [--out artifacts/ending] [--format jpg]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] ?? '']] : acc), []),
);
const url = args.url || 'http://localhost:5173';
const [w, h] = (args.size || '1280x720').split('x').map(Number);
const out = args.out || 'artifacts/ending';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: args.channel || undefined, args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: w, height: h } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(`${url}/?test=1&dev=1&quality=${args.quality || 'low'}`);
await page.waitForFunction(() => window.__GAME?.ready, null, { timeout: 120000 });
await page.evaluate(() => window.__GAME.teleport('engine-top'));
await page.evaluate(() => window.__GAME.autopilot('feed'));
for (let i = 0; i < 200; i++) {
  const done = await page.evaluate(() => {
    window.__GAME.stepFast(30);
    return window.__GAME.state().flags.includes('engine.finished');
  });
  if (done) break;
}
const shots = [
  [1.5, '01-out-of-the-breach'],
  [5.0, '02-over-the-shoulder'],
  [11.5, '03-hangar-named'],
  [15.0, '04-hangar-lit'],
  [19.0, '05-ivo'],
  [24.0, '06-chapter-complete'],
];
let t = 0;
for (const [at, name] of shots) {
  for (let left = Math.round((at - t) * 60); left > 0; left -= 30) await page.evaluate((k) => window.__GAME.step(k), Math.min(30, left));
  t = at;
  await page.waitForTimeout(args.wait ? Number(args.wait) : 300);
  await page.screenshot(args.format === 'jpg' ? { path: join(out, `${name}.jpg`), quality: 82 } : { path: join(out, `${name}.png`) });
  console.log(`${name} at ${at}s`);
}
await browser.close();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
