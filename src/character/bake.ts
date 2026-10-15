import { boneDefs } from './maraParts';
import { buildAllParts } from './maraBuild';
import { encodeBake } from './bakeFormat';

/** Build every part in this thread and encode the result (run in Node by scripts/bake-mara.mjs). */
export async function bakeMara(hash: string): Promise<{ bytes: Uint8Array; triangles: number; lowTriangles: number; rawTriangles: number }> {
  const index = new Map(boneDefs().map((b, i) => [b.name, i]));
  const parts = await buildAllParts(index, false);
  return {
    bytes: encodeBake(hash, parts),
    triangles: parts.reduce((n, p) => n + p.mesh.index.length / 3, 0),
    lowTriangles: parts.reduce((n, p) => n + p.low.index.length / 3, 0),
    rawTriangles: parts.reduce((n, p) => n + p.rawTriangles, 0),
  };
}
