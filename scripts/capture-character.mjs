#!/usr/bin/env node
/**
 * Turntable screenshots of the character model from the dev viewer (`/?viewer=mara`).
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
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'info') console.log(`[${m.type()}] ${m.text()}`);
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`${url}/?viewer=mara&dev=1${args.workers === '0' ? '&workers=0' : ''}`);
await page.waitForFunction(() => window.__VIEWER?.ready, null, { timeout: 120000 });

const views = [
  // name, pose, [angle, distance, camera height, look height]
  ['front', 'relaxed', [0, 3.6, 1.0, 0.86]],
  ['three-quarter', 'relaxed', [0.75, 3.6, 1.1, 0.86]],
  ['side', 'relaxed', [Math.PI / 2, 3.6, 1.0, 0.86]],
  ['back', 'relaxed', [Math.PI, 3.6, 1.1, 0.86]],
  ['face', 'relaxed', [0.35, 0.75, 1.52, 1.5]],
  ['face-front', 'relaxed', [0, 0.7, 1.5, 1.5]],
  ['torso', 'relaxed', [0.5, 1.5, 1.25, 1.15]],
  ['hands', 'relaxed', [0.6, 1.0, 0.95, 0.75]],
  ['boots', 'relaxed', [0.6, 1.0, 0.45, 0.12]],
  ['stride', 'stride', [1.2, 3.6, 1.0, 0.86]],
  ['bind', 'bind', [0, 3.6, 1.0, 0.86]],
  ['hang', 'hang', [0.6, 3.8, 1.3, 1.0]],
  // The Low-quality level of detail (integrated GPUs).
  ['low-three-quarter', 'relaxed', [0.75, 3.6, 1.1, 0.86], 'low'],
  ['low-face', 'relaxed', [0.35, 0.75, 1.52, 1.5], 'low'],
];
for (const [name, pose, v, detail] of views) {
  if (only && !only.includes(name)) continue;
  await page.evaluate(([p, view, d]) => {
    window.__VIEWER.detail(d);
    window.__VIEWER.pose(p);
    window.__VIEWER.view(...view);
  }, [pose, v, detail ?? 'high']);
  await page.waitForTimeout(150);
  await page.screenshot({ path: join(out, `${name}.png`) });
}
console.log('stats', JSON.stringify(await page.evaluate(() => window.__VIEWER.stats)));
await browser.close();
if (errors.length) {
  console.error(`\n${errors.length} console error(s)`);
  process.exit(1);
}
