#!/usr/bin/env node
/**
 * Downloads the CC0 surface textures used by the level from Poly Haven (https://polyhaven.com,
 * licence CC0) into public/assets/textures/<id>/: diffuse (sRGB), OpenGL normal, and "arm"
 * (ambient occlusion, roughness, metalness packed in R, G, B), all 1k JPEG, plus the texture's
 * real-world size so the game can tile it at the right scale.
 *
 *   node scripts/fetch-textures.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const SURFACES = {
  stone: 'castle_wall_slates',
  stoneDark: 'old_stone_wall',
  floor: 'cobblestone_floor_04',
  grate: 'metal_grate_rusty',
  iron: 'metal_plate',
  wood: 'old_planks_02',
  // Chapter Two, the Warders' Green: the green, the lane, the shingle, roofs and garden walls.
  grass: 'leafy_grass',
  gravel: 'gravel_road',
  shingle: 'pebbles',
  slate: 'roof_slates_02',
  mossyStone: 'mossy_stone_wall',
};

const api = async (path) => {
  const r = await fetch(`https://api.polyhaven.com${path}`, { headers: { 'User-Agent': 'it-takes-one-asset-fetch' } });
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r.json();
};
const download = async (url, file) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  writeFileSync(file, Buffer.from(await r.arrayBuffer()));
};

const manifest = {};
for (const [key, id] of Object.entries(SURFACES)) {
  const [info, files] = await Promise.all([api(`/info/${id}`), api(`/files/${id}`)]);
  const dir = join('public', 'assets', 'textures', id);
  mkdirSync(dir, { recursive: true });
  const maps = { diff: files.Diffuse, nor: files.nor_gl, arm: files.arm };
  for (const [name, entry] of Object.entries(maps)) {
    const url = entry?.['1k']?.jpg?.url;
    if (!url) throw new Error(`${id}: no 1k jpg for ${name}`);
    await download(url, join(dir, `${name}.jpg`));
  }
  // dimensions are in millimetres: [width, height].
  const [w, h] = info.dimensions ?? [2000, 2000];
  manifest[key] = { id, name: info.name, authors: Object.keys(info.authors ?? {}), sizeMetres: [w / 1000, h / 1000], url: `https://polyhaven.com/a/${id}`, licence: 'CC0' };
  console.log(`${key}: ${id} (${w / 1000} x ${h / 1000} m) by ${manifest[key].authors.join(', ')}`);
}
writeFileSync(join('public', 'assets', 'textures', 'manifest.json'), JSON.stringify(manifest, null, 2));
