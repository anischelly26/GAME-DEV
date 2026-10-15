#!/usr/bin/env node
/**
 * Screenshots of Chapter One's opening (Mara wakes up in the cell) at fixed story times.
 *
 *   npm run dev            (in another terminal)
 *   node scripts/capture-opening.mjs [--url http://localhost:5173] [--channel msedge] [--size 1600x900] [--out artifacts/opening] [--format jpg]
 *
 * Steps the simulation deterministically with rendering on every step (`__GAME.step`), so the
 * character animation advances at game speed. Console errors make the script exit non-zero.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] ?? '']] : acc), []),
);
const url = args.url || 'http://localhost:5173';
const [w, h] = (args.size || '1600x900').split('x').map(Number);
const out = args.out || 'artifacts/opening';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: args.channel || undefined, args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: w, height: h } });
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(`${url}/?test=1&dev=1&intro=1&quality=${args.quality || 'high'}`);
await page.waitForFunction(() => window.__GAME?.ready, null, { timeout: 120000 });

// Story time (seconds) -> shot name. Times follow QuietCellLevel.playOpening.
const shots = [
  [2.5, '01-card-saltmere'],
  [8.5, '02-card-asleep'],
  [13.0, '03-card-woke-up'],
  [15.6, '04-cell-asleep'],
  [17.4, '05-getting-up'],
  [19.0, '06-standing'],
  [20.6, '07-looking-around'],
  [23.0, '08-breakwater'],
  [27.5, '09-chapter-title'],
  [31.5, '10-control'],
];
let t = 0;
for (const [at, name] of shots) {
  const n = Math.round((at - t) * 60);
  // Rendered steps in chunks keep each evaluate call short.
  for (let left = n; left > 0; left -= 60) await page.evaluate((k) => window.__GAME.step(k), Math.min(60, left));
  t = at;
  await page.waitForTimeout(150);
  await page.screenshot(args.format === 'jpg' ? { path: join(out, `${name}.jpg`), quality: 82 } : { path: join(out, `${name}.png`) });
  console.log(`${name} at ${at}s`);
}
await browser.close();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
