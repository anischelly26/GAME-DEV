#!/usr/bin/env node
/**
 * Builds public/assets/mara/mara.glb from the Quaternius CC0 packs (sources and licences in
 * docs/ASSETS.md). The packs are not committed: download them, unzip the parts listed in
 * docs/ASSETS.md into import-cache/quaternius/ (git-ignored), run `npm run dev`, then:
 *
 *   node scripts/import-mara.mjs [--url http://localhost:5173] [--channel msedge]
 *
 * The assembly and retargeting run in the browser (tools/maraAssemble.ts) because they need
 * three.js loaders, canvas image encoding and the exporter.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] ?? '']] : acc), []),
);
const url = args.url || 'http://localhost:5173';
const browser = await chromium.launch({ channel: args.channel || undefined });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('[pageerror]', String(e)));
await page.goto(`${url}/tools/mara-export.html`);
await page.waitForFunction(() => window.__EXPORT?.done, null, { timeout: 300000 });
const r = await page.evaluate(() => window.__EXPORT);
await browser.close();
if (r.error) {
  console.error(r.error);
  process.exit(1);
}
mkdirSync('public/assets/mara', { recursive: true });
writeFileSync('public/assets/mara/mara.glb', Buffer.from(r.base64, 'base64'));
console.log(`wrote public/assets/mara/mara.glb (${(r.stats.bytes / 1024 / 1024).toFixed(2)} MB, ${r.stats.triangles} triangles)`);
console.log('clips:', r.stats.clips.join(', '));
