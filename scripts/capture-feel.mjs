#!/usr/bin/env node
/**
 * Screenshots of the game-feel pass (docs/MOVEMENT_2_0.md, Phase B) in the movement lab: the
 * take-off stretch, the apex, the falling arms, the long fall's windmill, the landing squash, the
 * head bump under the low beam, treading water and the crawl in the pool; and the skiff in
 * Chapter Three. The camera stands side-on so the body reads.
 *
 * Each scene is stepped and read back from the canvas inside one page call: in test mode the
 * browser keeps rendering (and animating) between calls, so a page screenshot would not show the
 * stepped frame. The images are the 3D view only (no HUD).
 *
 *   npm run dev            (in another terminal)
 *   node scripts/capture-feel.mjs [--url http://localhost:5173] [--channel msedge] [--size 1280x720] [--quality high] [--out docs/evidence/game-feel]
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] ?? '']] : acc), []),
);
const url = args.url || 'http://localhost:5173';
const [w, h] = (args.size || '1280x720').split('x').map(Number);
const out = args.out || 'docs/evidence/game-feel';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: args.channel || undefined, args: ['--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: w, height: h } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const open = async (query) => {
  await page.goto(`${url}/?test=1&dev=1&quality=${args.quality || 'high'}&${query}`);
  await page.waitForFunction(() => window.__GAME?.ready, null, { timeout: 120000 });
  // In-page helpers: place Mara with a side-on camera, and grab the canvas right after a step.
  await page.evaluate(() => {
    const G = window.__GAME;
    window.__cap = {
      shots: [],
      place(x, y, z, facing = 0, camYaw = Math.PI / 2, pitch = 0.12) {
        G.setPlayer(x, y, z, facing);
        G.setCamera(camYaw, pitch);
        G.setInput({ moveX: 0, moveY: 0, jumpHeld: false });
        G.step(40);
        G.game.dialogue.reset();
      },
      snap(name) {
        G.step(1);
        const f = G.game.avatar.feel;
        this.shots.push({ name, url: G.game.pipeline.renderer.domElement.toDataURL('image/jpeg', 0.86), feel: Object.fromEntries(Object.entries(f).map(([k, v]) => [k, +v.toFixed(3)])) });
      },
    };
  });
};
/** Run a scene in the page (it calls cap.place / cap.snap), then save its shots. */
const scene = async (fn) => {
  await page.evaluate(`(${fn})(window.__GAME, window.__cap)`);
  const shots = await page.evaluate(() => {
    const s = window.__cap.shots;
    window.__cap.shots = [];
    return s;
  });
  for (const s of shots) {
    writeFileSync(join(out, `${s.name}.jpg`), Buffer.from(s.url.split(',')[1], 'base64'));
    console.log(s.name, JSON.stringify(s.feel));
  }
};

await open('lab=1');

// A standing jump: take-off, apex, falling, landing.
await scene((G, cap) => {
  cap.place(0, 0, -6);
  G.setInput({ moveX: 0, moveY: 0, jumpHeld: true });
  G.press('jump');
  G.step(2);
  cap.snap('01-takeoff-stretch');
  G.step(16);
  cap.snap('02-apex');
  G.step(10);
  cap.snap('03-falling-arms');
  for (let i = 0; i < 40 && !G.game.player.grounded; i++) G.step(1);
  G.step(1);
  cap.snap('04-landing-squash');
  G.setInput(null);
});

// A walk off the 10 m landing: the windmill, then the big squash.
await scene((G, cap) => {
  cap.place(11.0, 10, 25, Math.PI / 2, -Math.PI / 2 + 0.9, 0.2);
  G.setInput({ moveX: 0, moveY: 0, jumpHeld: false });
  G.game.input.virtual = { moveX: 0.6, moveY: 0.8, jumpHeld: false };
  for (let i = 0; i < 90 && G.game.player.feet.y > 3.5; i++) G.step(1);
  G.setInput(null);
  cap.snap('05-long-fall-windmill');
  for (let i = 0; i < 60 && !G.game.player.grounded; i++) G.step(1);
  G.step(1);
  cap.snap('06-big-landing-squash');
});

// The head bump under the low beam.
await scene((G, cap) => {
  cap.place(5.5, 0, -4.5, 0, Math.PI / 2, 0.02);
  G.setInput({ moveX: 0, moveY: 0, jumpHeld: true });
  G.press('jump');
  for (let i = 0; i < 20; i++) {
    G.step(1);
    if (G.game.player.velocity.y <= 0) break;
  }
  G.step(2);
  cap.snap('07-head-bump');
  G.setInput(null);
});

// The pool: treading water, then the crawl.
await scene((G, cap) => {
  cap.place(0, -1, 41, 0, Math.PI / 2, 0.3);
  G.step(40);
  cap.snap('08-treading-water');
  G.setInput({ moveX: 0, moveY: 1, jumpHeld: false });
  G.setCamera(Math.PI, 0.3);
  G.step(30);
  G.setCamera(Math.PI / 2 + 0.3, 0.3);
  G.step(20);
  cap.snap('09-swimming');
  G.setInput(null);
});

// The skiff (Chapter Three).
await open('chapter=3');
await scene((G, cap) => {
  G.teleport('skiff');
  G.step(40);
  G.setCamera(G.game.player.facing + Math.PI + 1.2, 0.2);
  G.step(20);
  cap.snap('10-skiff-driving');
});

if (errors.length) console.error('page errors:', errors);
await browser.close();
