#!/usr/bin/env node
/**
 * Developer probe: loads the game in test mode, runs a JS expression against window.__GAME and
 * prints the result, optionally saving a screenshot.
 *
 *   node scripts/probe.mjs --eval "__GAME.state()" [--steps 60] [--shot artifacts/probe.png] [--channel msedge]
 */
import { chromium } from 'playwright';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] ?? '']] : acc), []),
);
const url = args.url || 'http://localhost:5173';
const browser = await chromium.launch({ channel: args.channel || undefined, args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => (m.type() === 'error' ? console.log(`[console.error] ${m.text()}`) : null));
page.on('pageerror', (e) => console.log(`[pageerror] ${e}`));
await page.goto(`${url}/?test=1&dev=1${args.query ? '&' + args.query : ''}`);
await page.waitForFunction(() => window.__GAME?.ready, null, { timeout: 120000 });
if (args.pre) await page.evaluate(args.pre);
if (args.steps) await page.evaluate((n) => window.__GAME.step(Number(n)), args.steps);
if (args.eval) console.log(JSON.stringify(await page.evaluate(args.eval), null, 2));
if (args.shot) await page.screenshot({ path: args.shot });
await browser.close();
