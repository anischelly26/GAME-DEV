import { buildPart, type BuiltPart } from './maraBuild';

/** Meshes a batch of Mara's parts off the main thread. */
const scope = self as unknown as Worker;

scope.onmessage = async (e: MessageEvent<{ names: string[]; boneIndex: Array<[string, number]> }>) => {
  const index = new Map(e.data.boneIndex);
  const out: BuiltPart[] = [];
  for (const name of e.data.names) out.push(await buildPart(name, index));
  const transfer = out.flatMap((p) => [p.mesh.position.buffer, p.mesh.normal.buffer, p.mesh.color.buffer, p.mesh.skinIndex.buffer, p.mesh.skinWeight.buffer, p.mesh.index.buffer]);
  scope.postMessage(out, transfer as ArrayBuffer[]);
};
