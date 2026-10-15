import { meshShape, type MeshData } from './mesher';
import { partSpecs, type MaterialKey } from './maraParts';
import { simplifierReady, simplifyMesh } from './simplify';

export interface BuiltPart {
  name: string;
  material: MaterialKey;
  mesh: MeshData;
  /** Coarser level of detail (about a quarter of the triangles), used on Low quality. */
  low: MeshData;
  millis: number;
  simplifyMillis: number;
  rawTriangles: number;
}

/** Mesh and simplify one named part. Runs in a worker or on the main thread. */
export async function buildPart(name: string, boneIndex: Map<string, number>): Promise<BuiltPart> {
  const spec = partSpecs().find((p) => p.name === name);
  if (!spec) throw new Error(`Unknown part ${name}`);
  const t0 = performance.now();
  const raw = meshShape(spec.shape(), { min: spec.min, max: spec.max, voxel: spec.voxel, bones: boneIndex, ao: spec.ao ?? 1, weightFalloff: spec.weightFalloff });
  const t1 = performance.now();
  await simplifierReady;
  const mesh = simplifyMesh(raw, spec.simplify[0], spec.simplify[1]);
  // Low quality: about a quarter of the triangles, with the error capped at 1.5 mm so layered
  // clothing (patch over trousers, jacket over shirt) does not interpenetrate.
  const [lowRatio, lowError] = spec.lowSimplify ?? [Math.max(0.04, spec.simplify[0] * 0.28), Math.min(spec.simplify[1] * 5, 0.0015)];
  const low = simplifyMesh(raw, lowRatio, lowError);
  return { name, material: spec.material, mesh, low, millis: Math.round(t1 - t0), simplifyMillis: Math.round(performance.now() - t1), rawTriangles: raw.index.length / 3 };
}

/**
 * Build every part, spread over Web Workers when available (falls back to the main thread, e.g.
 * under unit tests). Parts are balanced across workers by their rough cost.
 */
export async function buildAllParts(boneIndex: Map<string, number>, useWorkers = true): Promise<BuiltPart[]> {
  const specs = partSpecs();
  const canUseWorkers = useWorkers && typeof Worker !== 'undefined' && typeof window !== 'undefined';
  if (!canUseWorkers) {
    const out: BuiltPart[] = [];
    for (const s of specs) out.push(await buildPart(s.name, boneIndex));
    return out;
  }
  const cores = Math.max(1, (navigator.hardwareConcurrency || 4) - 1);
  const count = Math.min(4, cores, specs.length);
  const batches: Array<{ names: string[]; cost: number }> = Array.from({ length: count }, () => ({ names: [], cost: 0 }));
  for (const s of [...specs].sort((a, b) => b.cost - a.cost)) {
    const lightest = batches.reduce((a, b) => (b.cost < a.cost ? b : a));
    lightest.names.push(s.name);
    lightest.cost += s.cost;
  }
  const boneList = [...boneIndex.entries()];
  const results = await Promise.all(
    batches.map(
      (batch) =>
        new Promise<BuiltPart[]>((resolve, reject) => {
          const worker = new Worker(new URL('./maraWorker.ts', import.meta.url), { type: 'module' });
          worker.onmessage = (e: MessageEvent<BuiltPart[]>) => {
            worker.terminate();
            resolve(e.data);
          };
          worker.onerror = (e) => {
            worker.terminate();
            reject(new Error(`Character worker failed: ${e.message}`));
          };
          worker.postMessage({ names: batch.names, boneIndex: boneList });
        }),
    ),
  );
  // Keep the declared part order so the merged meshes are deterministic.
  const all = results.flat();
  return specs.map((s) => all.find((p) => p.name === s.name)!);
}
