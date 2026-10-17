#!/usr/bin/env node
/**
 * Frame times at every checkpoint of a chapter, rendered for real (headed browser, the game's own
 * real-time loop), with the camera turning slowly so the whole surroundings are drawn. Reports
 * mean, p95 and worst frame per checkpoint, the JS heap, and the GPU the browser reports.
 *
 *   npm run build
 *   node scripts/measure-frames.mjs [--chapter 1] [--quality low|high] [--channel msedge|chromium]
 *                                   [--seconds 6] [--port 5237]
 *
 * Edge on this laptop runs on the RTX 2050 (Windows graphics setting); Playwright's bundled
 * Chromium runs on the Intel UHD. By default frames are capped by the display's refresh rate;
 * `--uncapped 1` turns vsync and the frame-rate limit off, so the times show what a frame costs.
 */
import { preview } from 'vite';
import { chromium } from 'playwright';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] ?? '']] : acc), []),
);
const port = Number(args.port || 5237);
const chapter = Number(args.chapter || 1);
const quality = args.quality || 'low';
const seconds = Number(args.seconds || 6);
const server = await preview({ preview: { host: '127.0.0.1', port, strictPort: true } });
const uncapped = args.uncapped === '1';
const flags = ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'];
if (uncapped) flags.push('--disable-gpu-vsync', '--disable-frame-rate-limit');
const channel = args.channel === 'chromium' ? undefined : args.channel || 'msedge';
const browser = await chromium.launch({ channel, headless: false, args: flags });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`http://127.0.0.1:${port}/?test=1&realtime=1&dev=1&quality=${quality}&chapter=${chapter}&intro=0`);
  await page.waitForFunction(() => window.__GAME?.ready, null, { timeout: 240000 });
  const gpu = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
  });
  const ids = await page.evaluate(() => window.__GAME.game.level.checkpointIds);
  const rows = {};
  for (const id of ids) {
    rows[id] = await page.evaluate(
      async ([cp, secs]) => {
        const G = window.__GAME;
        G.teleport(cp);
        // Let it settle (shaders, uploads) before measuring.
        await new Promise((r) => setTimeout(r, 1500));
        const frames = [];
        let last = performance.now();
        const end = last + secs * 1000;
        let yaw = G.game.camera.yaw;
        await new Promise((resolve) => {
          const tick = (now) => {
            frames.push(now - last);
            last = now;
            yaw += 0.01;
            G.setCamera(yaw);
            if (now < end) requestAnimationFrame(tick);
            else resolve();
          };
          requestAnimationFrame(tick);
        });
        frames.shift();
        const sorted = [...frames].sort((a, b) => a - b);
        const mean = frames.reduce((a, b) => a + b, 0) / frames.length;
        const r = G.game.pipeline.renderer.info;
        return {
          frames: frames.length,
          meanMs: +mean.toFixed(2),
          p95Ms: +sorted[Math.floor(sorted.length * 0.95)].toFixed(2),
          worstMs: +sorted[sorted.length - 1].toFixed(1),
          heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(0) : null,
          geometries: r.memory.geometries,
          textures: r.memory.textures,
        };
      },
      [id, seconds],
    );
  }
  console.log(JSON.stringify({ chapter, quality, channel: channel ?? 'chromium', uncapped, gpu, rows }));
} finally {
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}
