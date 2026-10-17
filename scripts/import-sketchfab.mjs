#!/usr/bin/env node
/**
 * Optimises the CC BY 4.0 Sketchfab models used by the game into public/assets/models/. The
 * downloads are not committed: get each model from its Sketchfab page (signed in, "Download 3D
 * model", glTF binary .glb), put the .glb in import-cache/sketchfab/ (git-ignored), then run
 *
 *   node scripts/import-sketchfab.mjs
 *
 * Sources, authors and licences are in docs/ASSETS.md and are also written into each output file's
 * asset.extras, with the changes made (CC BY 4.0 asks for credit and an indication of changes).
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, textureCompress, join, flatten, compactPrimitive, clearNodeTransform } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { mkdirSync, statSync } from 'node:fs';

export const MODELS = [
  {
    out: 'slide.glb',
    src: 'abandoned_childrens_slide.glb',
    title: "Abandoned children's slide",
    author: 'sergeilihandristov',
    authorUrl: 'https://sketchfab.com/sergeilihandristov',
    source: 'https://sketchfab.com/3d-models/abandoned-childrens-slide-11de2b21ec264c0a814ac024c45ab425',
    textureSize: 1024,
    simplifyRatio: null,
    simplifyError: 0,
  },
  {
    out: 'lighthouse.glb',
    src: 'seven_foot_knoll_lighthouse.glb',
    title: 'Seven Foot Knoll Lighthouse',
    author: 'Katie Wolfe',
    authorUrl: 'https://sketchfab.com/katiewolfe',
    source: 'https://sketchfab.com/3d-models/seven-foot-knoll-lighthouse-949111fbde5b4564811cad303b09727c',
    textureSize: 2048,
    // A ~1 M-triangle photogrammetry scan: a landmark seen from a distance needs a few per cent.
    simplifyRatio: 0.07,
    simplifyError: 0.05,
    // The plaza it was scanned on lies below y 3.1 in the scan (the gallery deck is near 9 m).
    cropBelowY: 3.1,
  },
];

/**
 * Drop the ground the scan was made on (the brick plaza round the lighthouse): faces that lie flat
 * below `belowY`. In the game it stands in the sea on its own piles.
 */
const cropGround = (belowY) => (doc) => {
  const a = [0, 0, 0];
  const b = [0, 0, 0];
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION').getArray();
      const idx = prim.getIndices();
      const src = idx.getArray();
      const keep = [];
      for (let i = 0; i < src.length; i += 3) {
        const p0 = src[i] * 3;
        const p1 = src[i + 1] * 3;
        const p2 = src[i + 2] * 3;
        for (let k = 0; k < 3; k++) {
          a[k] = pos[p1 + k] - pos[p0 + k];
          b[k] = pos[p2 + k] - pos[p0 + k];
        }
        const nx = a[1] * b[2] - a[2] * b[1];
        const ny = a[2] * b[0] - a[0] * b[2];
        const nz = a[0] * b[1] - a[1] * b[0];
        const flat = Math.abs(ny) > 0.85 * Math.hypot(nx, ny, nz);
        const top = Math.max(pos[p0 + 1], pos[p1 + 1], pos[p2 + 1]);
        if (!(flat && top < belowY)) keep.push(src[i], src[i + 1], src[i + 2]);
      }
      idx.setArray(new Uint32Array(keep));
      compactPrimitive(prim);
    }
  }
};

/**
 * Simplify every primitive to `ratio` of its triangles (at most `error`, relative to the mesh's
 * size), weighing texture coordinates so UV seams stay put and the scan's texture does not smear.
 */
const simplifySeamAware = (ratio, error) => (doc) => {
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const indices = prim.getIndices();
      const positions = new Float32Array(prim.getAttribute('POSITION').getArray());
      const uv = prim.getAttribute('TEXCOORD_0');
      const src = new Uint32Array(indices.getArray());
      const target = Math.floor((src.length * ratio) / 3) * 3;
      const [out] = uv
        ? MeshoptSimplifier.simplifyWithAttributes(src, positions, 3, new Float32Array(uv.getArray()), 2, [3, 3], null, target, error, ['Permissive'])
        : MeshoptSimplifier.simplify(src, positions, 3, target, error);
      indices.setArray(out);
      compactPrimitive(prim);
    }
  }
};

/** Bake every node's transform into its mesh, so vertex positions are in the model's Y-up frame. */
const bakeTransforms = () => (doc) => {
  for (const node of doc.getRoot().listNodes()) if (node.getMesh()) clearNodeTransform(node);
  for (const node of doc.getRoot().listNodes()) if (!node.getMesh()) node.setMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
};

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
await MeshoptSimplifier.ready;
mkdirSync('public/assets/models', { recursive: true });

for (const m of MODELS) {
  const input = `import-cache/sketchfab/${m.src}`;
  const doc = await io.read(input);
  const triangles = () => {
    let n = 0;
    for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) n += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
    return Math.round(n);
  };
  const before = triangles();
  const changes = [];
  const steps = [dedup(), flatten(), bakeTransforms(), join({ keepNamed: false }), weld()];
  if (m.cropBelowY !== undefined) steps.push(cropGround(m.cropBelowY));
  if (m.simplifyRatio) {
    steps.push(simplifySeamAware(m.simplifyRatio, m.simplifyError));
  }
  steps.push(
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [m.textureSize, m.textureSize], quality: 88 }),
    prune(),
  );
  await doc.transform(...steps);
  const after = triangles();
  changes.push('merged and welded meshes');
  if (m.cropBelowY !== undefined) changes.push('removed the ground it was scanned on');
  if (m.simplifyRatio) changes.push(`simplified from ${before} to ${after} triangles`);
  changes.push(`textures resized to at most ${m.textureSize} px and re-encoded as WebP`);
  const asset = doc.getRoot().getAsset();
  asset.extras = {
    title: m.title,
    author: `${m.author} (${m.authorUrl})`,
    license: 'CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)',
    source: m.source,
    changes: `Modified for It Takes One: ${changes.join('; ')}.`,
  };
  asset.generator = 'It Takes One import-sketchfab.mjs (glTF Transform)';
  const output = `public/assets/models/${m.out}`;
  await io.write(output, doc);
  const mb = (f) => (statSync(f).size / 1024 / 1024).toFixed(2);
  console.log(`${m.out}: ${before} -> ${after} triangles, ${mb(input)} MB -> ${mb(output)} MB`);
}
