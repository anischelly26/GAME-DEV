#!/usr/bin/env node
/**
 * Where does the frame time go? Measures real frame times (requestAnimationFrame deltas, normal
 * real-time loop, headed browser, production build) at fixed viewpoints, with rendering features
 * switched off one at a time.
 *
 *   npm run build
 *   node scripts/profile-render.mjs [--channel msedge] [--port 5231] [--seconds 3] [--quality low|high]
 *
 * Prints one JSON line per configuration: mean FPS and median/p95 frame time per viewpoint. Close
 * other GPU work and keep the window in the foreground; a hidden window is throttled.
 */
import { preview } from 'vite';
import { chromium } from 'playwright';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] ?? '']] : acc), []),
);
const port = Number(args.port || 5231);
const seconds = Number(args.seconds || 3);
const quality = args.quality || 'low';
const only = args.only ? args.only.split(',') : null;
const views = (args.views || 'cell,landing,lookout,route,engine,breach').split(',');

const server = await preview({ preview: { host: '127.0.0.1', port, strictPort: true } });
let browser = null;

/** Each configuration is applied in the page after Begin (fn receives the game). */
const configs = [
  ['preset', () => {}],
  ['no-shadows', (g) => {
    g.pipeline.renderer.shadowMap.enabled = false;
    g.scene.traverse((o) => o.material && ([].concat(o.material).forEach((m) => (m.needsUpdate = true))));
  }],
  ['no-msaa', (g) => {
    for (const rt of [g.pipeline.composer.renderTarget1, g.pipeline.composer.renderTarget2]) {
      rt.samples = 0;
      rt.dispose();
    }
  }],
  ['no-ao', (g) => (g.pipeline.ao.enabled = false)],
  ['no-bloom', (g) => (g.pipeline.bloom.enabled = false)],
  ['scale-0.75', (g) => {
    g.pipeline.renderer.setPixelRatio(0.75);
    g.pipeline.resize();
  }],
  ['no-msaa+no-point-lights', (g) => {
    for (const rt of [g.pipeline.composer.renderTarget1, g.pipeline.composer.renderTarget2]) {
      rt.samples = 0;
      rt.dispose();
    }
    // Same light count (no recompile): just zero their contribution and range.
    g.scene.traverse((o) => (o.isPointLight || o.isSpotLight) && ((o.intensity = 0), (o.userData.profileOff = true)));
  }],
  ['no-msaa+shadow-2048', (g) => {
    for (const rt of [g.pipeline.composer.renderTarget1, g.pipeline.composer.renderTarget2]) {
      rt.samples = 0;
      rt.dispose();
    }
    g.scene.traverse((o) => {
      if (o.isDirectionalLight && o.castShadow) {
        o.shadow.mapSize.set(2048, 2048);
        o.shadow.map?.dispose();
        o.shadow.map = null;
      }
    });
  }],
  ['no-msaa+static-shadow', (g) => {
    for (const rt of [g.pipeline.composer.renderTarget1, g.pipeline.composer.renderTarget2]) {
      rt.samples = 0;
      rt.dispose();
    }
    g.pipeline.renderer.shadowMap.autoUpdate = false;
    g.pipeline.renderer.shadowMap.needsUpdate = true;
  }],
  ['no-msaa+scale-0.75', (g) => {
    for (const rt of [g.pipeline.composer.renderTarget1, g.pipeline.composer.renderTarget2]) {
      rt.samples = 0;
      rt.dispose();
    }
    g.pipeline.renderer.setPixelRatio(0.75);
    g.pipeline.resize();
  }],
  ['no-post', (g) => {
    g.pipeline.ao.enabled = false;
    g.pipeline.bloom.enabled = false;
    for (const rt of [g.pipeline.composer.renderTarget1, g.pipeline.composer.renderTarget2]) {
      rt.samples = 0;
      rt.dispose();
    }
  }],
];

try {
  for (const [name, apply] of configs) {
    if (only && !only.includes(name)) continue;
    // A fresh browser per configuration: nothing compiled or cached carries over.
    browser = await chromium.launch({ channel: args.channel || 'msedge', headless: args.headless === '1', args: ['--window-size=1320,820'] });
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.setDefaultTimeout(240000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('crash', () => console.error(`page crashed (${name})`));
    page.on('close', () => console.error(`page closed (${name})`));
    const loadStart = Date.now();
    await page.goto(`http://127.0.0.1:${port}/?dev=1&intro=0&quality=${quality}`);
    await page.locator('[data-a="start"]').waitFor();
    const loadSeconds = (Date.now() - loadStart) / 1000;
    await page.evaluate(() => document.querySelector('[data-a="start"]').click());
    await page.waitForFunction(() => window.__GAME?.state().gameState === 'playing');
    const env = await page.evaluate(() => {
      const r = window.__GAME.game.pipeline.renderer;
      const gl = r.getContext();
      const e = gl.getExtension('WEBGL_debug_renderer_info');
      return { gpu: e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), canvas: [r.domElement.width, r.domElement.height] };
    });
    await page.evaluate(`(${apply.toString()})(window.__GAME.game)`);
    // Visit every viewpoint once first so first-use compilation and uploads are not in the samples.
    for (const v of views) {
      await page.evaluate((id) => window.__GAME.teleport(id), v);
      await page.waitForTimeout(700);
    }
    const out = {};
    for (const v of views) {
      await page.evaluate((id) => window.__GAME.teleport(id), v);
      await page.waitForTimeout(1000);
      out[v] = await page.evaluate(
        (ms) =>
          new Promise((resolve) => {
            const ds = [];
            let last = performance.now();
            const end = last + ms;
            const tick = (t) => {
              ds.push(t - last);
              last = t;
              if (t < end) requestAnimationFrame(tick);
              else {
                ds.sort((a, b) => a - b);
                const total = ds.reduce((a, b) => a + b, 0);
                resolve({ fps: +((ds.length * 1000) / total).toFixed(1), median: +ds[ds.length >> 1].toFixed(1), p95: +ds[Math.floor(ds.length * 0.95)].toFixed(1) });
              }
            };
            requestAnimationFrame(tick);
          }),
        seconds * 1000,
      );
    }
    const info = await page.evaluate(() => {
      const g = window.__GAME.game;
      const n = { meshes: 0, pointLights: 0, spotLights: 0, dirLights: 0, shadowLights: 0, programs: g.pipeline.renderer.info.programs.length };
      g.scene.traverse((o) => {
        if (o.isMesh && o.visible) n.meshes++;
        if (o.isPointLight) n.pointLights++;
        if (o.isSpotLight) n.spotLights++;
        if (o.isDirectionalLight) n.dirLights++;
        if (o.isLight && o.castShadow) n.shadowLights++;
      });
      return n;
    });
    console.log(JSON.stringify({ config: name, quality, loadSeconds, ...env, scene: info, views: out, errors }));
    await browser.close();
    browser = null;
  }
} finally {
  await browser?.close();
  await new Promise((r) => server.httpServer.close(r));
}
