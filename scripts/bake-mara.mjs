#!/usr/bin/env node
/**
 * Pre-builds Mara's meshes into public/mara/mara.bin so the game doesn't sculpt her at load time.
 * Runs the same TypeScript the browser would (through Vite's SSR loader) in Node.
 *
 *   node scripts/bake-mara.mjs            always rebuild
 *   node scripts/bake-mara.mjs --if-stale rebuild only when the character source changed
 *
 * The output is generated (and git-ignored). If it is missing or stale, the game falls back to
 * building Mara in Web Workers, so a forgotten bake costs load time, never correctness.
 */
import { createServer } from 'vite';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { maraSourceHash } from './maraHash.mjs';

const out = join('public', 'mara', 'mara.bin');
const hash = maraSourceHash();
if (process.argv.includes('--if-stale') && existsSync(out)) {
  const buf = readFileSync(out);
  const len = buf.readUInt32LE(4);
  const stored = JSON.parse(buf.subarray(8, 8 + len).toString('utf8')).hash;
  if (stored === hash) {
    console.log(`mara.bin is up to date (${hash})`);
    process.exit(0);
  }
}
const t0 = Date.now();
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true } });
try {
  const { bakeMara } = await server.ssrLoadModule('/src/character/bake.ts');
  const r = await bakeMara(hash);
  mkdirSync(join('public', 'mara'), { recursive: true });
  writeFileSync(out, r.bytes);
  console.log(`baked ${out}: ${r.triangles} triangles, Low ${r.lowTriangles} (from ${r.rawTriangles}), ${(r.bytes.length / 1024 / 1024).toFixed(2)} MB, ${((Date.now() - t0) / 1000).toFixed(1)} s, hash ${hash}`);
} finally {
  await server.close();
}
