#!/usr/bin/env node
/**
 * What a player sees along the whole chapter: the autopilot plays the route through the input
 * pipeline (deterministic steps, a render on every step) and a screenshot is taken from the normal
 * gameplay camera every few seconds, with the state at that moment (checkpoint, objective, mode,
 * camera zone and distance, the subtitle on screen). Used for the readability audit in
 * docs/CHAPTER_ONE_AUDIT.md.
 *
 *   npm run dev            (in another terminal)
 *   node scripts/audit-route.mjs [--url http://localhost:5173] [--channel msedge] [--every 2.5] [--quality low] [--intro 1] [--out artifacts/audit]
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] ?? '']] : acc), []),
);
const url = args.url || 'http://localhost:5173';
const every = Number(args.every || 2.5);
const out = args.out || 'artifacts/audit';
const [w, h] = (args.size || '960x540').split('x').map(Number);
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: args.channel || undefined, args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: w, height: h } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(`${url}/?test=1&dev=1&quality=${args.quality || 'low'}&intro=${args.intro || 0}`);
await page.waitForFunction(() => window.__GAME?.ready, null, { timeout: 120000 });
await page.evaluate(() => {
  window.__line = '';
  window.__GAME.game.events.on('line', (l) => (window.__line = `${l.speaker}: ${l.text}`));
});
if (args.intro === '1') await page.evaluate(() => window.__GAME.step(60 * 30));
await page.evaluate((part) => window.__GAME.autopilot(part || undefined), args.part || '');

const log = [];
for (let i = 0; i < 400; i++) {
  await page.evaluate((n) => window.__GAME.step(n), Math.round(every * 60));
  const s = await page.evaluate(() => {
    const g = window.__GAME.game;
    const st = window.__GAME.state();
    return {
      t: +g.time.toFixed(1),
      cp: st.checkpoint,
      objective: st.objective,
      mode: g.player.mode,
      grounded: g.player.grounded,
      feet: st.feet.map((v) => +v.toFixed(2)),
      zone: g.camera.activeZone,
      camDist: +g.camera.distance.toFixed(2),
      line: window.__line,
      autopilot: st.autopilot ? `${st.autopilot.state} ${st.autopilot.step}/${st.autopilot.total}` : null,
      complete: st.complete,
    };
  });
  const name = `${String(i).padStart(3, '0')}-${s.cp}.jpg`;
  await page.screenshot({ path: join(out, name), quality: 70 });
  log.push({ shot: name, ...s });
  console.log(`${name} t=${s.t} ${s.mode} zone=${s.zone} dist=${s.camDist} obj="${s.objective}" ${s.autopilot}`);
  if (s.complete || /failed|done/.test(s.autopilot ?? '')) break;
}
writeFileSync(join(out, 'log.json'), JSON.stringify(log, null, 2));
await browser.close();
if (errors.length) console.error(errors.join('\n'));
