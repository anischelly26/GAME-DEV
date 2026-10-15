#!/usr/bin/env node
/**
 * Short real-time movement captures (WebM) of the autopilot playing route sections, for reviewing
 * animation, camera and readability in motion. Each clip is a fresh page so it gets its own file.
 *
 *   npm run dev            (in another terminal)
 *   node scripts/capture-video.mjs [--url http://localhost:5173] [--channel msedge] [--quality high|low] [--out artifacts/video]
 *
 * Headless capture runs below real-time frame rates on most machines; clips show behaviour, not
 * performance.
 */
import { chromium } from 'playwright';
import { mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] ?? '']] : acc), []),
);
const url = args.url || 'http://localhost:5173';
const quality = args.quality || 'high';
const out = args.out || `artifacts/video-${quality}`;
const only = args.only ? args.only.split(',') : null;
mkdirSync(out, { recursive: true });

const clips = [
  // name, checkpoint, autopilot part, seconds to record
  { name: 'v1-cell-hatch-and-shaft', cp: null, part: 'slice', seconds: 30 },
  { name: 'v2-tier-one-vault-and-climb', cp: 'lookout', part: 'engine', seconds: 26 },
  { name: 'v3-split-feed-and-exit', cp: 'engine-top', part: 'feed', seconds: 34 },
];

const browser = await chromium.launch({ channel: args.channel || undefined, args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const clip of clips) {
  if (only && !only.some((o) => clip.name.includes(o))) continue;
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: out, size: { width: 1280, height: 720 } } });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', String(e)));
  await page.goto(`${url}/?test=1&dev=1&realtime=1&quality=${quality}`);
  await page.waitForFunction(() => window.__GAME?.ready, null, { timeout: 120000 });
  if (clip.cp) {
    if (clip.cp === 'lookout') await page.evaluate(() => window.__GAME.teleport('route'));
    await page.evaluate((id) => window.__GAME.teleport(id), clip.cp);
  }
  await page.waitForTimeout(800);
  await page.evaluate((part) => window.__GAME.autopilot(part), clip.part);
  await page.waitForTimeout(clip.seconds * 1000);
  const status = await page.evaluate(() => window.__GAME.state().autopilot);
  console.log(clip.name, status?.state, `${status?.step}/${status?.total}`, status?.message ?? '');
  const video = page.video();
  await context.close();
  if (video) renameSync(await video.path(), join(out, `${clip.name}.webm`));
}
await browser.close();
