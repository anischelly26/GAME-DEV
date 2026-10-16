#!/usr/bin/env node
/**
 * A short showcase of Chapter One v2, recorded in real time (WebM, one file per clip): the opening
 * in the workshop and the cell, Mara's moves with the steam kicker, the feed-pipe grind, the boards
 * and the whistle. Inputs are scripted through the test API (virtual stick and button presses) on
 * a real-time loop, so the clips show behaviour and feel, not performance.
 *
 *   npm run dev            (in another terminal)
 *   node scripts/capture-showcase.mjs [--url http://localhost:5173] [--channel msedge] [--quality high] [--out artifacts/showcase] [--only grind,moves]
 */
import { chromium } from 'playwright';
import { mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] ?? '']] : acc), []),
);
const url = args.url || 'http://localhost:5173';
const quality = args.quality || 'high';
const out = args.out || 'artifacts/showcase';
const only = args.only ? args.only.split(',') : null;
mkdirSync(out, { recursive: true });

const wait = (page, s) => page.waitForTimeout(s * 1000);
const input = (page, v) => page.evaluate((x) => window.__GAME.setInput(x), v);
const press = (page, a) => page.evaluate((x) => window.__GAME.press(x), a);
const camera = (page, yaw, pitch = 0.3) => page.evaluate(([y, p]) => window.__GAME.setCamera(y, p), [yaw, pitch]);

const clips = [
  {
    name: '1-opening',
    intro: true,
    run: async (page) => {
      await wait(page, 42);
    },
  },
  {
    name: '2-moves',
    run: async (page) => {
      await page.evaluate(() => window.__GAME.teleport('route'));
      await wait(page, 1.2);
      // Along tier one toward the gap: run, a ground dash into a sprint, a jump with a double jump
      // and a flip, an air dash, then a ground pound.
      await input(page, { moveX: 0, moveY: 1, jumpHeld: false });
      await wait(page, 0.8);
      await press(page, 'dash');
      await input(page, { moveX: 0, moveY: 1, jumpHeld: false, dashHeld: true });
      await wait(page, 0.9);
      await input(page, { moveX: 0, moveY: 1, jumpHeld: true, dashHeld: true });
      await press(page, 'jump');
      await wait(page, 0.35);
      await press(page, 'jump');
      await wait(page, 0.35);
      await press(page, 'dash');
      await wait(page, 0.9);
      await input(page, { moveX: 0, moveY: 0, jumpHeld: true });
      await wait(page, 0.6);
      await press(page, 'jump');
      await wait(page, 0.3);
      await press(page, 'jump');
      await wait(page, 0.35);
      await press(page, 'pound');
      await wait(page, 1.6);
      await input(page, null);
      await wait(page, 0.6);
    },
  },
  {
    name: '3-grind',
    run: async (page) => {
      await page.evaluate(() => {
        const G = window.__GAME;
        G.teleport('lookout');
        G.game.progression.set('reveal.done');
        G.game.level.engine.openRoute();
        G.setPlayer(1.7, 4.65, 13.4, Math.PI);
      });
      await camera(page, 0, 0.3);
      await wait(page, 1.0);
      await input(page, { moveX: 0, moveY: 1, jumpHeld: false });
      await wait(page, 0.9);
      await input(page, null);
      await wait(page, 4.5);
    },
  },
  {
    name: '4-boards-and-whistle',
    run: async (page) => {
      await page.evaluate(() => {
        const G = window.__GAME;
        const c = G.game.level.boards.centre;
        G.teleport('route');
        G.setPlayer(c.x, c.y + 0.2, c.z, 0);
      });
      await wait(page, 1.0);
      await input(page, { moveX: 0, moveY: 0, jumpHeld: true });
      await press(page, 'jump');
      await wait(page, 0.33);
      await press(page, 'pound');
      await wait(page, 2.4);
      await input(page, null);
      await page.evaluate(() => {
        const G = window.__GAME;
        const w = G.game.level.whistleAt;
        const th = (2 * Math.PI) / 18;
        G.setPlayer(w.x - Math.sin(th) * 0.9, 0.05, w.z - Math.cos(th) * 0.9, th);
        G.setCamera(th + Math.PI + 0.5, 0.25);
      });
      await wait(page, 0.8);
      await page.evaluate(() => window.__GAME.game.interactions.get('whistle').interact());
      await wait(page, 3.2);
    },
  },
];

const browser = await chromium.launch({ channel: args.channel || 'msedge', headless: false });
for (const clip of clips) {
  if (only && !only.some((o) => clip.name.includes(o))) continue;
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: out, size: { width: 1280, height: 720 } } });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', String(e)));
  await page.goto(`${url}/?test=1&dev=1&realtime=1&quality=${quality}&intro=${clip.intro ? 1 : 0}`);
  await page.waitForFunction(() => window.__GAME?.ready, null, { timeout: 120000 });
  await clip.run(page);
  const video = page.video();
  await context.close();
  if (video) renameSync(await video.path(), join(out, `${clip.name}.webm`));
  console.log('recorded', clip.name);
}
await browser.close();
