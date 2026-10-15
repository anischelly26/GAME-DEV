import { MeshoptSimplifier } from 'meshoptimizer/simplifier';
import type { MeshData } from './mesher';

export const simplifierReady: Promise<void> = MeshoptSimplifier.ready;

/**
 * Reduce a mesh with meshoptimizer's quadric simplifier (MIT licence, Arseny Kapoulkine). Edges
 * collapse onto existing vertices, so normals, colours and skin weights stay exact for every kept
 * vertex. `error` is an absolute distance in metres; simplification stops at whichever of the
 * ratio and the error bound is reached first. Await `simplifierReady` before calling.
 */
export function simplifyMesh(m: MeshData, ratio: number, error: number): MeshData {
  const vcount = m.position.length / 3;
  // Normals guide the collapse so creases and folds survive.
  const target = Math.max(3, Math.floor((m.index.length * ratio) / 3) * 3);
  const [indices] = MeshoptSimplifier.simplifyWithAttributes(m.index, m.position, 3, m.normal, 3, [0.4, 0.4, 0.4], null, target, error, ['ErrorAbsolute']);
  const [remap, unique] = MeshoptSimplifier.compactMesh(indices);
  const out: MeshData = {
    position: new Float32Array(unique * 3),
    normal: new Float32Array(unique * 3),
    color: new Float32Array(unique * 3),
    skinIndex: new Uint16Array(unique * 4),
    skinWeight: new Float32Array(unique * 4),
    index: indices,
  };
  for (let v = 0; v < vcount; v++) {
    const n = remap[v];
    if (n === 0xffffffff) continue;
    for (let k = 0; k < 3; k++) {
      out.position[n * 3 + k] = m.position[v * 3 + k];
      out.normal[n * 3 + k] = m.normal[v * 3 + k];
      out.color[n * 3 + k] = m.color[v * 3 + k];
    }
    for (let k = 0; k < 4; k++) {
      out.skinIndex[n * 4 + k] = m.skinIndex[v * 4 + k];
      out.skinWeight[n * 4 + k] = m.skinWeight[v * 4 + k];
    }
  }
  return out;
}
