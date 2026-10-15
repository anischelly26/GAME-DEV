import type { MaterialKey } from './maraParts';
import type { MeshData } from './mesher';

/**
 * Binary format for Mara's pre-built parts (`public/mara/mara.bin`, written by
 * `scripts/bake-mara.mjs`). Quantised to keep the file around 2 MB: positions stay float32;
 * normals int8; colours, skin weights and bone indices uint8; triangle indices uint16 per part.
 *
 *   magic "MARA" | u32 header length | header JSON (utf-8) | padding to 4 | part data...
 */

export interface BakedMesh {
  position: Float32Array;
  normal: Int8Array;
  color: Uint8Array;
  skinIndex: Uint8Array;
  skinWeight: Uint8Array;
  index: Uint16Array;
}

export interface BakedPart {
  name: string;
  material: MaterialKey;
  /** 0 = full detail, 1 = Low-quality level of detail. */
  lod: number;
  mesh: BakedMesh;
}

interface Header {
  version: 2;
  /** Hash of the character source that produced this file (see scripts/maraHash.mjs). */
  hash: string;
  parts: Array<{ name: string; material: MaterialKey; lod: number; vertices: number; indices: number; offset: number }>;
}

const MAGIC = 0x4152414d; // "MARA" little-endian
const align4 = (n: number) => (n + 3) & ~3;
const partBytes = (v: number, i: number) => align4(v * 12) + align4(v * 3) + align4(v * 3) + v * 4 + v * 4 + align4(i * 2);

function quantise(m: MeshData): BakedMesh {
  const v = m.position.length / 3;
  if (v > 65535) throw new Error('Part too large for 16-bit indices');
  const normal = new Int8Array(v * 3);
  for (let i = 0; i < v * 3; i++) normal[i] = Math.round(Math.max(-1, Math.min(1, m.normal[i])) * 127);
  const color = new Uint8Array(v * 3);
  for (let i = 0; i < v * 3; i++) color[i] = Math.round(Math.max(0, Math.min(1, m.color[i])) * 255);
  const skinIndex = new Uint8Array(v * 4);
  const skinWeight = new Uint8Array(v * 4);
  for (let j = 0; j < v; j++) {
    // Round the weights so they still sum to exactly 255.
    let sum = 0;
    let largest = 0;
    for (let k = 0; k < 4; k++) {
      skinIndex[j * 4 + k] = m.skinIndex[j * 4 + k];
      const w = Math.round(m.skinWeight[j * 4 + k] * 255);
      skinWeight[j * 4 + k] = w;
      sum += w;
      if (w > skinWeight[j * 4 + largest]) largest = k;
    }
    skinWeight[j * 4 + largest] += 255 - sum;
  }
  return { position: m.position, normal, color, skinIndex, skinWeight, index: Uint16Array.from(m.index) };
}

export function encodeBake(hash: string, parts: Array<{ name: string; material: MaterialKey; mesh: MeshData; low?: MeshData }>): Uint8Array {
  const q = parts.flatMap((p) => [
    { name: p.name, material: p.material, lod: 0, baked: quantise(p.mesh) },
    ...(p.low ? [{ name: p.name, material: p.material, lod: 1, baked: quantise(p.low) }] : []),
  ]);
  let offset = 0;
  const header: Header = { version: 2, hash, parts: [] };
  for (const p of q) {
    const v = p.baked.position.length / 3;
    const i = p.baked.index.length;
    header.parts.push({ name: p.name, material: p.material, lod: p.lod, vertices: v, indices: i, offset });
    offset += partBytes(v, i);
  }
  const json = new TextEncoder().encode(JSON.stringify(header));
  const start = align4(8 + json.length);
  const out = new Uint8Array(start + offset);
  const view = new DataView(out.buffer);
  view.setUint32(0, MAGIC, true);
  view.setUint32(4, json.length, true);
  out.set(json, 8);
  q.forEach((p, n) => {
    let o = start + header.parts[n].offset;
    const put = (a: ArrayBufferView, bytes: number) => {
      out.set(new Uint8Array(a.buffer, a.byteOffset, a.byteLength), o);
      o += align4(bytes);
    };
    const v = p.baked.position.length / 3;
    put(p.baked.position, v * 12);
    put(p.baked.normal, v * 3);
    put(p.baked.color, v * 3);
    put(p.baked.skinIndex, v * 4);
    put(p.baked.skinWeight, v * 4);
    put(p.baked.index, p.baked.index.length * 2);
  });
  return out;
}

export function decodeBake(buffer: ArrayBuffer): { hash: string; parts: BakedPart[] } | null {
  const view = new DataView(buffer);
  if (buffer.byteLength < 8 || view.getUint32(0, true) !== MAGIC) return null;
  const len = view.getUint32(4, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 8, len))) as Header;
  if (header.version !== 2) return null;
  const start = align4(8 + len);
  const parts = header.parts.map((p) => {
    let o = start + p.offset;
    const v = p.vertices;
    const take = <T>(make: (b: ArrayBuffer, off: number, n: number) => T, n: number, bytes: number): T => {
      const a = make(buffer, o, n);
      o += align4(bytes);
      return a;
    };
    const mesh: BakedMesh = {
      position: take((b, off, n) => new Float32Array(b, off, n), v * 3, v * 12),
      normal: take((b, off, n) => new Int8Array(b, off, n), v * 3, v * 3),
      color: take((b, off, n) => new Uint8Array(b, off, n), v * 3, v * 3),
      skinIndex: take((b, off, n) => new Uint8Array(b, off, n), v * 4, v * 4),
      skinWeight: take((b, off, n) => new Uint8Array(b, off, n), v * 4, v * 4),
      index: take((b, off, n) => new Uint16Array(b, off, n), p.indices, p.indices * 2),
    };
    return { name: p.name, material: p.material, lod: p.lod, mesh };
  });
  return { hash: header.hash, parts };
}
