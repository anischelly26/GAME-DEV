#!/usr/bin/env node
/**
 * Capture review screenshots of the slice at fixed viewpoints.
 *
 *   npm run dev            (in another terminal)
 *   node scripts/capture.mjs [--url http://localhost:5173] [--channel msedge|chrome] [--size 1600x900] [--out artifacts/shots]
 *
 * Uses the dev/test API (window.__GAME) to step the simulation deterministically, so every run
 * frames the same views. Console errors are printed and make the script exit non-zero.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] ?? '']] : acc), []),
);
const url = args.url || 'http://localhost:5173';
const [w, h] = (args.size || '1600x900').split('x').map(Number);
const out = args.out || 'artifacts/shots';
const only = args.only ? args.only.split(',') : null;
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: args.channel || undefined, args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: w, height: h } });
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') console.log(`[${m.type()}] ${m.text()}`);
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(`${url}/?test=1&dev=1&quality=${args.quality || 'high'}`);
await page.waitForFunction(() => window.__GAME?.ready, null, { timeout: 120000 });
const G = (fn, arg) => page.evaluate(fn, arg);

const shots = [
  // name, checkpoint, setup steps (fixed steps), camera yaw/pitch
  { name: '01-cell-start', cp: 'cell', steps: 90 },
  { name: '02-cell-wall', cp: 'cell', pre: () => G(() => window.__GAME.setPlayer(0.4, 4.6, 29.2, Math.PI)), steps: 60, cam: [0.15, 0.18] },
  { name: '03-cell-from-door', cp: 'cell', pre: () => G(() => window.__GAME.setPlayer(-0.3, 4.6, 28.4, 0)), steps: 60, cam: [Math.PI + 0.3, 0.25] },
  { name: '04-landing', cp: 'landing', steps: 90 },
  { name: '05-gap', cp: 'landing', pre: () => G(() => window.__GAME.setPlayer(0.6, 4.6, 23.6, Math.PI)), steps: 60, cam: [0.1, 0.42] },
  { name: '06-lookout', cp: 'lookout', steps: 90 },
  { name: '07-lookout-wide', cp: 'lookout', pre: () => G(() => window.__GAME.setPlayer(0.3, 4.6, 14.2, Math.PI)), steps: 60, cam: [0.35, 0.05] },
  // Increment 2: practice route and the Breathing Engine (checkpoint framings).
  { name: '09-route-start', cp: 'route', steps: 60 },
  { name: '10-vault-rail', cp: 'route', pre: () => G(() => window.__GAME.game.level.engine.debugFrame('vault')), steps: 30 },
  { name: '11-ledge-gantry', cp: 'route', pre: () => G(() => window.__GAME.game.level.engine.debugFrame('ledge')), steps: 30 },
  { name: '12-shuttle', cp: 'shuttle', steps: 60 },
  { name: '13-engine-gantry', cp: 'engine', steps: 60 },
  { name: '14-upper-gantry', cp: 'engine-top', steps: 60 },
  { name: '15-steam-curtain', cp: 'engine-top', pre: () => G(() => window.__GAME.game.level.engine.debugFrame('steam')), steps: 40 },
  { name: '16-breach-piston', cp: 'breach', steps: 60 },
  { name: '17-exit-gantry', cp: 'exit', steps: 60 },
  // Character and polish comparisons (matched framings for before/after review).
  // c1 repeats the framing of Codex's probe-character-front.png (restart, camera yaw pi, pitch 0.05).
  { name: 'c1-mara-front-probe', cp: 'cell', pre: () => G(() => window.__GAME.restart()), steps: 30, cam: [Math.PI, 0.05] },
  { name: 'c2-mara-portrait-front', cp: 'landing', portrait: [0, 1.5, 1.45, 1.15] },
  { name: 'c3-mara-portrait-three-quarter', cp: 'landing', portrait: [0.75, 1.35, 1.5, 1.2] },
  { name: 'c4-mara-portrait-side', cp: 'landing', portrait: [Math.PI / 2, 1.5, 1.3, 1.0] },
  { name: 'c5-mara-portrait-back', cp: 'landing', portrait: [Math.PI, 1.6, 1.5, 1.1] },
  { name: 'c6-mara-face', cp: 'landing', portrait: [0.3, 0.55, 1.52, 1.5] },
  { name: 'c7-mara-boots-hands', cp: 'landing', portrait: [0.5, 0.95, 0.75, 0.55] },
];

for (const s of shots) {
  if (only && !only.some((o) => s.name.includes(o))) continue;
  await G((id) => window.__GAME.teleport(id), s.cp);
  if (s.pre) await s.pre();
  if (s.cam) await G(([y, p]) => window.__GAME.setCamera(y, p), s.cam);
  if (s.portrait) {
    // Close camera around Mara: [angle from her facing, distance, camera height, look height].
    await G((n) => window.__GAME.step(n), 30);
    await G(([a, d, ch, lh]) => {
      const g = window.__GAME.game;
      const f = g.player.feet;
      const yaw = g.player.facing + a;
      const cam = g.camera.camera.position.clone().set(f.x + Math.sin(yaw) * d, f.y + ch, f.z + Math.cos(yaw) * d);
      const look = cam.clone().set(f.x, f.y + lh, f.z);
      g.camera.playShot(cam, look, 0.001);
    }, s.portrait);
  }
  await G((n) => window.__GAME.step(n), s.steps ?? 20);
  await page.screenshot({ path: join(out, `${s.name}.png`) });
  console.log('captured', s.name, JSON.stringify(await G(() => window.__GAME.state().feet)));
}

console.log('fps (headless, not representative):', await G(() => window.__GAME.fps()));
await browser.close();
if (errors.length) {
  console.error(`\n${errors.length} console error(s)`);
  process.exit(1);
}
