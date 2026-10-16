#!/usr/bin/env node
/**
 * Screenshots of Movement 2.0 mid-move, in the cell (lit and uncluttered): the steam kicker on Mara's back, the double
 * jump's flip, the air dash, the ground dash (a roll) and the ground pound's ring.
 *
 *   npm run dev            (in another terminal)
 *   node scripts/capture-moves.mjs [--url http://localhost:5173] [--channel msedge] [--size 1280x720] [--quality high] [--out artifacts/moves] [--format jpg]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] ?? '']] : acc), []),
);
const url = args.url || 'http://localhost:5173';
const [w, h] = (args.size || '1280x720').split('x').map(Number);
const out = args.out || 'artifacts/moves';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: args.channel || undefined, args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: w, height: h } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`${url}/?test=1&dev=1&quality=${args.quality || 'high'}`);
await page.waitForFunction(() => window.__GAME?.ready, null, { timeout: 120000 });
const shot = async (name) => {
  await page.waitForTimeout(120);
  await page.screenshot(args.format === 'jpg' ? { path: join(out, `${name}.jpg`), quality: 82 } : { path: join(out, `${name}.png`) });
  console.log(name);
};
/** Put Mara in the middle of the cell (lit, uncluttered) with the kicker, camera to the side. */
const setup = (camOffset = 0.9, pitch = 0.25) =>
  page.evaluate(
    ([off, pt]) => {
      const g = window.__GAME;
      g.game.progression.set('kicker.taken');
      const facing = Math.PI / 2;
      g.setPlayer(-0.9, 4.6, 29.4, facing);
      g.setCamera(facing + Math.PI + off, pt);
      g.game.input.virtual = { moveX: 0, moveY: 0, jumpHeld: false };
      g.step(30);
      g.game.dialogue.reset();
    },
    [camOffset, pitch],
  );
const step = (n) => page.evaluate((k) => window.__GAME.step(k), n);
const press = (a) => page.evaluate((x) => window.__GAME.press(x), a);
const hold = (v) => page.evaluate((x) => (window.__GAME.game.input.virtual = { moveX: 0, moveY: 0, jumpHeld: false, ...x }), v);

await setup(0.25, 0.2);
await shot('01-kicker-on-her-back');

await setup(1.3, 0.15);
await hold({ moveY: 0.6, jumpHeld: true });
await press('jump');
await step(22);
await press('jump');
await step(9);
await shot('02-double-jump-flip');
await step(80);

await setup(1.4, 0.15);
await hold({ moveY: 1, jumpHeld: true });
await press('jump');
await step(18);
await press('dash');
await step(6);
await shot('03-air-dash');
await step(80);

await setup(1.4, 0.25);
await hold({ moveY: 1, dashHeld: true });
await step(6);
await press('dash');
await step(10);
await shot('04-roll');
await step(40);

await setup(1.0, 0.45);
await hold({ jumpHeld: true });
await press('jump');
await step(22);
await press('pound');
await step(14);
for (let i = 0; i < 12; i++) {
  const p = await page.evaluate(() => window.__GAME.game.player.pound);
  if (p === 'land') break;
  await step(1);
}
await step(3);
await shot('05-ground-pound');

await browser.close();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
