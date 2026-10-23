#!/usr/bin/env node
/**
 * Exports each chapter's world, the movement lab and the toy hero (skinned, every clip) as binary
 * glTF (.glb), for editing in Unreal Engine 5 (File > Import Into Level) or any other DCC tool.
 * Gameplay (TypeScript) does not come along: only meshes, materials, textures and lights.
 *
 *   npm run dev            (in another terminal)
 *   node scripts/export-unreal.mjs [--url http://localhost:5173] [--channel msedge] [--out ../ItTakesOne-Unreal/Import]
 *
 * The export runs in the game page (tools/sceneExport.ts). Each chapter is loaded with the Watch on
 * (?watch=1) so the sentries are in the scene.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] ?? '']] : acc), []),
);
const url = args.url || 'http://localhost:5173';
const out = resolve(args.out || '../ItTakesOne-Unreal/Import');
mkdirSync(out, { recursive: true });

const LEVELS = [
  { query: 'chapter=1', file: 'Chapter1_TheQuietCell' },
  { query: 'chapter=2', file: 'Chapter2_TheWardersGreen' },
  { query: 'chapter=3', file: 'Chapter3_TheLowTide' },
  { query: 'lab=1', file: 'MovementLab', character: true },
];

const browser = await chromium.launch({ channel: args.channel || 'msedge' });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const report = [];
try {
  for (const level of LEVELS) {
    await page.goto(`${url}/?test=1&dev=1&quality=high&watch=1&${level.query}`);
    await page.waitForFunction(() => window.__GAME?.ready, null, { timeout: 240000 });
    const results = await page.evaluate(
      async ([name, character]) => {
        const G = window.__GAME;
        G.step(5);
        const g = G.game;
        const mod = await import('/tools/sceneExport.ts');
        const skip = [g.avatar.root, g.dropShadow.mesh, ...g.avatar.scarves.map((s) => s.mesh)];
        const res = [await mod.exportLevel(g.scene, name, skip)];
        if (character) {
          const clips = [...g.avatar.actions.entries()].filter(([n]) => n !== 'grindPose').map(([, a]) => a.getClip());
          res.push(await mod.exportCharacter(g.avatar.model, clips));
        }
        return res;
      },
      [level.file, !!level.character],
    );
    for (const r of results) {
      const file = join(out, `${r.stats.name}.glb`);
      writeFileSync(file, Buffer.from(r.base64, 'base64'));
      report.push(r.stats);
      console.log(`${file}  ${(r.stats.bytes / 1048576).toFixed(1)} MB`, JSON.stringify({ ...r.stats, bytes: undefined, name: undefined }));
    }
  }
} finally {
  await browser.close();
}
writeFileSync(join(out, 'export-report.json'), JSON.stringify(report, null, 2));
if (errors.length) {
  console.error('page errors:', errors);
  process.exit(1);
}
