#!/usr/bin/env node
/**
 * Turntable screenshots of the character from the dev viewer (`/?viewer=mara`), posed with
 * frames from her animation clips.
 *
 *   npm run dev            (in another terminal)
 *   node scripts/capture-character.mjs [--url http://localhost:5173] [--channel msedge] [--out artifacts/character]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] ?? '']] : acc), []),
);
const url = args.url || 'http://localhost:5173';
const out = args.out || 'artifacts/character';
const only = args.only ? args.only.split(',') : null;
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: args.channel || undefined, args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 900, height: 1100 } });
const errors = [];
page.on('console', (m) => (m.type() === 'error' ? errors.push(m.text()) : undefined));
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`${url}/?viewer=mara&dev=1`);
await page.waitForFunction(() => window.__VIEWER?.ready, null, { timeout: 120000 });

const views = [
  // name, clip, clip time, [angle, distance, camera height, look height]
  ['front', 'idle', 0.5, [0, 3.6, 1.0, 0.86]],
  ['three-quarter', 'idle', 0.5, [0.75, 3.6, 1.1, 0.86]],
  ['side', 'idle', 0.5, [Math.PI / 2, 3.6, 1.0, 0.86]],
  ['back', 'idle', 0.5, [Math.PI, 3.6, 1.1, 0.86]],
  ['face', 'idle', 0.5, [0.35, 0.75, 1.55, 1.52]],
  ['hands', 'idle', 0.5, [0.6, 1.1, 1.0, 0.8]],
  ['boots', 'idle', 0.5, [0.6, 1.0, 0.45, 0.15]],
  ['walk', 'walk', 0.3, [1.2, 3.6, 1.0, 0.86]],
  ['jog', 'jog', 0.25, [1.2, 3.6, 1.0, 0.86]],
  ['jump', 'jumpLoop', 0.6, [1.0, 3.8, 1.2, 0.95]],
  ['climb', 'climb', 0.3, [0.8, 3.8, 1.3, 1.0]],
];
for (const [name, clip, time, v] of views) {
  if (only && !only.includes(name)) continue;
  await page.evaluate(([c, t, view]) => {
    window.__VIEWER.play(c, t);
    window.__VIEWER.view(...view);
  }, [clip, time, v]);
  await page.waitForTimeout(150);
  await page.screenshot({ path: join(out, `${name}.png`) });
}
console.log('clips', JSON.stringify(await page.evaluate(() => window.__VIEWER.clips)));
await browser.close();
if (errors.length) {
  console.error(`\n${errors.length} console error(s)`, errors.slice(0, 3));
  process.exit(1);
}
