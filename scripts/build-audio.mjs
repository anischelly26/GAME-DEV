#!/usr/bin/env node
/**
 * Builds public/assets/audio/ from CC0 packs downloaded into import-cache/audio/ (git-ignored):
 *
 *   import-cache/audio/kenney/{impact-sounds,rpg-audio,sci-fi-sounds,interface-sounds,music-jingles}/
 *     (unzipped from kenney.nl, CC0, see docs/ASSETS.md)
 *   import-cache/audio/oga/*.mp3|ogg  (OpenGameArt, CC0, see docs/ASSETS.md)
 *
 *   node scripts/build-audio.mjs
 *
 * Copies the chosen sound effects, trims the long recordings (at MP3 frame boundaries, so they
 * stay valid files) and writes public/assets/audio/manifest.json: game sound name -> variations.
 */
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = 'import-cache/audio';
const OUT = 'public/assets/audio';
mkdirSync(join(OUT, 'sfx'), { recursive: true });
mkdirSync(join(OUT, 'music'), { recursive: true });

const kenney = (pack, file) => join(SRC, 'kenney', pack, findFile(join(SRC, 'kenney', pack), file));
function findFile(dir, name) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      const sub = findFile(join(dir, e.name), name);
      if (sub) return join(e.name, sub);
    } else if (e.name === name) return e.name;
  }
  return '';
}
const range = (prefix, n, pad = 3, start = 0) => Array.from({ length: n }, (_, i) => `${prefix}${String(i + start).padStart(pad, '0')}.ogg`);

/** Game sound -> [pack, files]. Variations are picked at random at play time. */
const SFX = {
  'step.stone': ['impact-sounds', range('footstep_concrete_', 5)],
  'step.wood': ['impact-sounds', range('footstep_wood_', 5)],
  'step.metal': ['impact-sounds', range('impactPlate_light_', 5)],
  land: ['impact-sounds', range('impactSoft_medium_', 5)],
  'land.heavy': ['impact-sounds', range('impactSoft_heavy_', 5)],
  'land.metal': ['impact-sounds', range('impactPlate_medium_', 5)],
  'metal.heavy': ['impact-sounds', range('impactMetal_heavy_', 5)],
  'metal.medium': ['impact-sounds', range('impactMetal_medium_', 5)],
  'metal.light': ['impact-sounds', range('impactMetal_light_', 5)],
  'wood.medium': ['impact-sounds', range('impactWood_medium_', 5)],
  cloth: ['rpg-audio', ['cloth1.ogg', 'cloth2.ogg', 'cloth3.ogg', 'cloth4.ogg']],
  belt: ['rpg-audio', ['clothBelt.ogg', 'clothBelt2.ogg', 'handleSmallLeather.ogg', 'handleSmallLeather2.ogg']],
  creak: ['rpg-audio', ['creak1.ogg', 'creak2.ogg', 'creak3.ogg']],
  latch: ['rpg-audio', ['metalLatch.ogg']],
  click: ['rpg-audio', ['metalClick.ogg']],
  pot: ['rpg-audio', ['metalPot1.ogg', 'metalPot2.ogg', 'metalPot3.ogg']],
  thruster: ['sci-fi-sounds', range('thrusterFire_', 5)],
  boom: ['sci-fi-sounds', range('lowFrequency_explosion_', 2)],
  'engine.hum': ['sci-fi-sounds', ['spaceEngineLow_000.ogg']],
  'ui.select': ['interface-sounds', range('select_', 3, 3, 1)],
  'ui.confirm': ['interface-sounds', range('confirmation_', 2, 3, 1)],
  pluck: ['interface-sounds', ['pluck_001.ogg', 'pluck_002.ogg']],
  glass: ['interface-sounds', range('glass_', 3, 3, 1)],
  'jingle.found': ['music-jingles', ['jingles_PIZZI03.ogg']],
  'jingle.gadget': ['music-jingles', ['jingles_PIZZI07.ogg']],
  'jingle.complete': ['music-jingles', ['jingles_PIZZI16.ogg']],
};

/** Music and ambience beds: [source file, seconds to keep (0 = all), loop]. */
const BEDS = {
  title: ['oga/sailors-chant.ogg', 0, true],
  workshop: ['oga/haunting-piano.mp3', 0, false],
  cell: ['oga/an-adventure.ogg', 0, true],
  hall: ['oga/treasure-hunter.mp3', 0, true],
  ending: ['oga/rising-moon.mp3', 95, false],
  tomb: ['oga/forgotten-tombs.mp3', 70, true],
  waves: ['oga/vistula-waves.mp3', 48, true],
};

/** Measured full lengths (seconds) of the long recordings, for proportional trimming. */
const durations = { 'oga/rising-moon.mp3': 224.7, 'oga/forgotten-tombs.mp3': 214.2, 'oga/vistula-waves.mp3': 300.0 };

const manifest = { sfx: {}, beds: {} };
for (const [name, [pack, files]] of Object.entries(SFX)) {
  manifest.sfx[name] = [];
  for (const f of files) {
    const src = kenney(pack, f);
    if (!src.endsWith('.ogg')) throw new Error(`missing ${pack}/${f}`);
    const out = `${pack}-${f}`;
    copyFileSync(src, join(OUT, 'sfx', out));
    manifest.sfx[name].push(`sfx/${out}`);
  }
}
for (const [name, [file, keep, loop]] of Object.entries(BEDS)) {
  const bytes = readFileSync(join(SRC, file));
  const ext = file.slice(file.lastIndexOf('.'));
  let out = bytes;
  if (keep > 0 && ext === '.mp3') out = trimMp3(bytes, keep, durations[file]);
  writeFileSync(join(OUT, 'music', `${name}${ext}`), out);
  manifest.beds[name] = { file: `music/${name}${ext}`, loop };
}
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`sfx: ${Object.keys(manifest.sfx).length} names, beds: ${Object.keys(manifest.beds).join(', ')}`);

/** Cut an MP3 after about `seconds` (constant bitrate assumed), at the next frame header. */
function trimMp3(buf, seconds, total) {
  let at = Math.floor((buf.length * seconds) / total);
  while (at < buf.length - 1 && !(buf[at] === 0xff && (buf[at + 1] & 0xe0) === 0xe0)) at++;
  return buf.subarray(0, at);
}
