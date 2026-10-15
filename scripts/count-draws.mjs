#!/usr/bin/env node
/**
 * Draw calls and triangles per rendered frame (all passes) at each checkpoint, from the player's
 * camera: a cheap, deterministic proxy for rendering cost that does not depend on the GPU or on
 * what else the machine is doing.
 *
 *   npm run build
 *   node scripts/count-draws.mjs [--root artifacts/base-xxxx] [--quality low] [--port 5236]
 */
import { preview } from 'vite';
import { chromium } from 'playwright';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] ?? '']] : acc), []),
);
const port = Number(args.port || 5236);
const server = await preview({ ...(args.root ? { root: args.root, configFile: false } : {}), preview: { host: '127.0.0.1', port, strictPort: true } });
const browser = await chromium.launch({ channel: args.channel || 'chromium' });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`http://127.0.0.1:${port}/?test=1&dev=1&quality=${args.quality || 'low'}&intro=0`);
  await page.waitForFunction(() => window.__GAME?.ready, null, { timeout: 180000 });
  const rows = {};
  for (const cp of ['cell', 'landing', 'lookout', 'route', 'shuttle', 'engine', 'engine-top', 'breach', 'exit']) {
    rows[cp] = await page.evaluate((id) => {
      const g = window.__GAME;
      g.teleport(id);
      g.stepFast(30);
      const r = g.game.pipeline.renderer;
      r.info.autoReset = false;
      r.info.reset();
      g.step(1);
      const out = { calls: r.info.render.calls, triangles: r.info.render.triangles };
      r.info.autoReset = true;
      return out;
    }, cp);
  }
  const total = Object.values(rows).reduce((a, r) => a + r.calls, 0);
  console.log(JSON.stringify({ root: args.root || 'current', rows, meanCalls: Math.round(total / Object.keys(rows).length) }));
} finally {
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}
