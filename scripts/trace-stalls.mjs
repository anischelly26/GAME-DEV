#!/usr/bin/env node
/**
 * Find what blocks the main thread during long frames (review 492bce4 R2). Production build,
 * headed browser, fresh context, normal real-time loop, scripted route (autopilot drives the real
 * input pipeline). Every WebGL call that takes longer than 2 ms is timed in the page, and each
 * frame records three.js's program and texture counts, so a long frame can be attributed to shader
 * linking, texture upload, buffer upload or something else.
 *
 *   npm run build
 *   node scripts/trace-stalls.mjs [--channel msedge] [--port 5232] [--quality low|high] [--runs 1]
 *
 * Prints frames over 100 ms with the slow WebGL calls inside them. `--gpu discrete` or
 * `--gpu integrated` asks for the high-performance or low-power GPU on dual-GPU laptops.
 */
import { preview } from 'vite';
import { chromium } from 'playwright';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] ?? '']] : acc), []),
);
const port = Number(args.port || 5232);
const quality = args.quality || 'low';
const runs = Number(args.runs || 1);
const route = args.route ?? '';

// --root serves another build (e.g. an older commit built into artifacts/) for comparisons.
const server = await preview({ ...(args.root ? { root: args.root, configFile: false } : {}), preview: { host: '127.0.0.1', port, strictPort: true } });
// --gpu discrete asks Chromium for the high-performance GPU on dual-GPU laptops (Windows).
// --gpu integrated asks for the low-power one (the Windows per-app setting otherwise decides).
const gpuArgs = args.gpu === 'discrete' ? ['--force_high_performance_gpu'] : args.gpu === 'integrated' ? ['--force_low_power_gpu'] : [];
const browser = await chromium.launch({ channel: args.channel || 'msedge', headless: false, args: ['--window-size=1320,820', ...gpuArgs] });

function instrument() {
  const slow = [];
  window.__slowGL = slow;
  // Name each program by its fragment shader's SHADER_NAME and light/shadow counts.
  const sources = new WeakMap();
  const programs = new WeakMap();
  const P = WebGL2RenderingContext.prototype;
  const shaderSource = P.shaderSource;
  P.shaderSource = function (sh, src) {
    sources.set(sh, src);
    return shaderSource.call(this, sh, src);
  };
  const attachShader = P.attachShader;
  P.attachShader = function (prog, sh) {
    const src = sources.get(sh) ?? '';
    if (/gl_FragColor|pc_fragColor|out highp vec4/.test(src) || src.includes('#define SHADER_TYPE Fragment')) {
      const pick = (re) => (src.match(re) ?? [])[1];
      const counts = ['NUM_DIR_LIGHTS', 'NUM_POINT_LIGHTS', 'NUM_SPOT_LIGHTS', 'NUM_DIR_LIGHT_SHADOWS', 'NUM_POINT_LIGHT_SHADOWS', 'NUM_SPOT_LIGHT_SHADOWS']
        .map((k) => `${k.replace('NUM_', '').toLowerCase()}=${pick(new RegExp(`#define ${k} (\d+)`)) ?? '?'}`)
        .join(' ');
      programs.set(prog, `${pick(/#define SHADER_NAME (\S+)/) ?? 'unnamed'} [${counts}] ${src.length} chars`);
    }
    return attachShader.call(this, prog, sh);
  };
  window.__programName = (prog) => programs.get(prog);
  for (const proto of [WebGL2RenderingContext.prototype]) {
    for (const name of Object.getOwnPropertyNames(proto)) {
      const d = Object.getOwnPropertyDescriptor(proto, name);
      if (!d || typeof d.value !== 'function' || name === 'constructor') continue;
      const fn = d.value;
      proto[name] = function (...a) {
        const t0 = performance.now();
        const r = fn.apply(this, a);
        const dt = performance.now() - t0;
        if (dt > 2) slow.push({ t: t0, dt: +dt.toFixed(1), name, what: a[0] instanceof WebGLProgram ? window.__programName(a[0]) : undefined });
        return r;
      };
    }
  }
}

try {
  for (let run = 0; run < runs; run++) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    await context.addInitScript(instrument);
    const page = await context.newPage();
    page.setDefaultTimeout(240000);
    await page.goto(`http://127.0.0.1:${port}/?dev=1&intro=0&quality=${quality}`);
    await page.locator('[data-a="start"]').click();
    await page.waitForFunction(() => window.__GAME?.state().gameState === 'playing');
    const loadSlow = await page.evaluate(() => window.__slowGL.length);
    await page.waitForTimeout(4000);
    await page.evaluate(() => {
      window.__frames = [];
      window.__stop = false;
      let last = performance.now();
      const g = window.__GAME.game;
      const tick = (t) => {
        if (window.__stop) return;
        const info = g.pipeline.renderer.info;
        window.__frames.push({ start: last, dt: t - last, cp: g.checkpoints.current?.id, feet: g.player.feet.toArray().map((v) => +v.toFixed(2)), programs: info.programs?.length ?? 0, textures: info.memory.textures, geometries: info.memory.geometries });
        last = t;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await page.evaluate((r) => window.__GAME.autopilot(r || undefined), route);
    await page.waitForFunction(() => window.__GAME.state().complete || ['failed', 'done'].includes(window.__GAME.state().autopilot?.state), null, { timeout: 240000, polling: 1000 });
    const data = await page.evaluate(() => {
      window.__stop = true;
      return { frames: window.__frames, slow: window.__slowGL, state: window.__GAME.state() };
    });
    const gpu = await page.evaluate(() => {
      const gl = window.__GAME.game.pipeline.renderer.getContext();
      const e = gl.getExtension('WEBGL_debug_renderer_info');
      return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : '';
    });
    const ds = data.frames.map((f) => f.dt).sort((a, b) => a - b);
    console.log(`run ${run + 1}: ${gpu}; ${quality}; ${data.frames.length} frames; mean ${(ds.reduce((a, b) => a + b, 0) / ds.length).toFixed(1)} ms; p95 ${ds[Math.floor(ds.length * 0.95)].toFixed(1)} ms; max ${ds[ds.length - 1].toFixed(0)} ms; complete ${data.state.complete}; slow GL calls during load ${loadSlow}`);
    // The longest frames first (at most ten), with what was happening in them.
    const long = data.frames
      .map((f, i) => ({ f, i }))
      .filter(({ f, i }) => i > 0 && f.dt >= 100)
      .sort((a, b) => b.f.dt - a.f.dt)
      .slice(0, 10);
    for (const { f, i } of long) {
      const prev = data.frames[i - 1];
      const inside = data.slow.filter((s) => s.t >= f.start && s.t < f.start + f.dt);
      const byName = {};
      for (const s of inside) {
        const key = s.what ? `${s.name}: ${s.what}` : s.name;
        byName[key] = +((byName[key] ?? 0) + s.dt).toFixed(1);
      }
      console.log(
        `  ${f.dt.toFixed(0)} ms at ${f.cp} ${JSON.stringify(f.feet)}: programs ${prev.programs}->${f.programs}, textures ${prev.textures}->${f.textures}, geometries ${prev.geometries}->${f.geometries}; slow GL ${JSON.stringify(byName)}`,
      );
    }
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}
