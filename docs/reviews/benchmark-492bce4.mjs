// Independent normal-loop performance comparison. Run from repo root; no implementation edits.
import { build, preview } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import os from 'node:os';
const root = process.cwd();
const out = resolve(root, 'artifacts/review-492bce4');
const baseline = resolve(out, 'baseline');
mkdirSync(out, { recursive: true });
await build({ root: baseline, configFile: false, base: './', build: { target: 'es2022', chunkSizeWarningLimit: 5500 } });
const servers = [];
const result = { date: new Date().toISOString(), environment: { os: os.release(), cpu: os.cpus()[0].model, ramGiB: os.totalmem()/2**30, node: process.version }, runs: [] };
let browser;
const save = () => writeFileSync(resolve(out, 'benchmark.json'), JSON.stringify(result, null, 2));
const summarize = samples => {
  const ds = samples.map(x => x.dt).sort((a,b) => a-b);
  const total = ds.reduce((a,b) => a+b, 0);
  return { frames: ds.length, seconds: total/1000, averageFps: ds.length*1000/total,
    medianMs: ds[Math.floor(ds.length*.5)], p95Ms: ds[Math.floor(ds.length*.95)], p99Ms: ds[Math.floor(ds.length*.99)],
    percentOver33ms: ds.filter(x => x>33.34).length*100/ds.length, percentOver50ms: ds.filter(x => x>50).length*100/ds.length };
};
try {
  for (const [r,port] of [[root,5221],[baseline,5222]]) {
    const server = await preview({ root:r, configFile:false, preview:{host:'127.0.0.1',port,strictPort:true} });
    servers.push(server);
  }
  browser = await chromium.launch({ channel:'msedge', headless:false, args:['--window-size=1320,820'] });
  result.environment.browser = browser.version();
  for (const [label,port,quality] of [['latest',5221,'high'],['baseline',5222,'high'],['latest',5221,'low'],['baseline',5222,'low']]) {
    const context = await browser.newContext({ viewport:{width:1280,height:720}, deviceScaleFactor:1 });
    const page = await context.newPage();
    page.setDefaultTimeout(120000);
    const run = { label, quality, mode:'headed production, normal realtime, scripted real input pipeline', errors:[] };
    page.on('pageerror', e => run.errors.push(String(e)));
    page.on('console', m => {if(m.type()==='error')run.errors.push(m.text());});
    await page.goto(`http://127.0.0.1:${port}/?dev=1&quality=${quality}`);
    await page.locator('[data-a="start"]').click();
    await page.waitForFunction(() => __GAME.state().gameState === 'playing' && (__GAME.game.avatar.ready ?? true));
    await page.waitForTimeout(8000);
    run.environment = await page.evaluate(async () => {
      const r=__GAME.game.pipeline.renderer, gl=r.getContext(), e=gl.getExtension('WEBGL_debug_renderer_info');
      const battery=navigator.getBattery ? await navigator.getBattery() : null;
      return { renderer:e?gl.getParameter(e.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),
        viewport:[innerWidth,innerHeight],canvas:[r.domElement.width,r.domElement.height],dpr:devicePixelRatio,
        visibility:document.visibilityState,focus:document.hasFocus(),pointerLocked:!!document.pointerLockElement,
        power:battery?{charging:battery.charging,level:battery.level}:null };
    });
    await page.evaluate(() => {
      window.__reviewSamples=[];window.__reviewStage='cell-idle';window.__reviewStop=false;
      let last=performance.now();
      function tick(t) {
        if(window.__reviewStop)return;
        const g=__GAME.game;
        window.__reviewSamples.push({dt:t-last,stage:window.__reviewStage,cp:g.checkpoints.current?.id,mode:g.player.mode,
          gameState:g.state,gameTime:g.time,yaw:g.camera.yaw,feet:g.player.feet.toArray(),speed:g.player.speed,
          focused:document.hasFocus(),visibility:document.visibilityState});last=t;
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
    await page.waitForTimeout(8000);
    await page.evaluate(() => { window.__reviewStage='route'; __GAME.autopilot(); });
    try {
      await page.waitForFunction(() => __GAME.state().complete || __GAME.state().autopilot?.state === 'failed', null, {timeout:180000,polling:1000});
    } catch(e) {run.timeout=String(e).split('\n')[0];}
    const data=await page.evaluate(() => {window.__reviewStop=true;return {samples:window.__reviewSamples,state:__GAME.state()};});
    run.state=data.state;
    run.cell=summarize(data.samples.filter(s=>s.stage==='cell-idle'&&s.dt>0));
    run.route=summarize(data.samples.filter(s=>s.stage==='route'&&s.dt>0&&s.gameState==='playing'));
    run.checkpoints=Object.fromEntries([...new Set(data.samples.map(s=>s.cp))].map(cp=>[cp,summarize(data.samples.filter(s=>s.cp===cp&&s.stage==='route'&&s.dt>0&&s.gameState==='playing'))]));
    run.focusLossFrames=data.samples.filter(s=>!s.focused||s.visibility!=='visible').length;
    writeFileSync(resolve(out,`${label}-${quality}-frames.json`),JSON.stringify(data));
    await page.screenshot({path:resolve(out,`${label}-${quality}-end.png`)});
    result.runs.push(run);save();
    console.log(JSON.stringify({label,quality,gpu:run.environment.renderer,cell:run.cell,route:run.route,complete:run.state.complete,falls:run.state.falls,focusLossFrames:run.focusLossFrames,autopilot:run.state.autopilot?.state}));
    await context.close();
  }
} finally {save();await browser?.close();for(const server of servers)await new Promise(r=>server.httpServer.close(r));}
