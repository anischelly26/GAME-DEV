import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { assembleMara } from './maraAssemble';

/**
 * Dev-only: assemble Mara and export one binary glTF (textures as 1024 px JPEG). Driven by
 * scripts/import-mara.mjs, which saves the result to public/assets/mara/mara.glb.
 */
const state: { done: boolean; error?: string; base64?: string; stats?: Record<string, unknown> } = { done: false };
(window as unknown as { __EXPORT: typeof state }).__EXPORT = state;

async function main() {
  const { root, clips } = await assembleMara();
  let triangles = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    triangles += (m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute('position').count) / 3;
    const mat = m.material as THREE.MeshStandardMaterial;
    for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'] as const) {
      const t = mat[key];
      if (t) t.userData.mimeType = 'image/jpeg';
    }
  });
  const glb = (await new GLTFExporter().parseAsync(root, { binary: true, animations: clips, onlyVisible: true, maxTextureSize: 1024 })) as ArrayBuffer;
  const bytes = new Uint8Array(glb);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  state.base64 = btoa(bin);
  state.stats = { bytes: bytes.length, triangles, clips: clips.map((c) => `${c.name} ${c.duration.toFixed(2)}s`) };
  state.done = true;
}

main().catch((e) => {
  state.error = String(e?.stack ?? e);
  state.done = true;
});
