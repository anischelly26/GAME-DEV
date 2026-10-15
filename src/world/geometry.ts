import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Box whose UVs are in world units divided by `uvScale` metres, so a texture tiles at the same
 * density on every surface regardless of the box size.
 */
export function worldBox(w: number, h: number, d: number, uvScale = 3): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  // Face order: +x, -x, +y, -y, +z, -z; 4 vertices each.
  const dims: Array<[number, number]> = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let face = 0; face < 6; face++) {
    for (let v = 0; v < 4; v++) {
      const i = face * 4 + v;
      uv.setXY(i, (uv.getX(i) * dims[face][0]) / uvScale, (uv.getY(i) * dims[face][1]) / uvScale);
    }
  }
  return g;
}

/**
 * Replace a geometry's UVs with a box projection in its own space (metres / `uvScale`), choosing
 * the projection axis per triangle. Small pieces (rubble, corbels, arches) then show the same
 * masonry scale as the walls instead of squeezing the whole texture onto each face.
 */
export function boxProjectUVs(geometry: THREE.BufferGeometry, uvScale = 3): THREE.BufferGeometry {
  const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  const pos = g.getAttribute('position');
  const uv = new Float32Array(pos.count * 2);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    n.subVectors(b, a).cross(c.clone().sub(a));
    const ax = Math.abs(n.x);
    const ay = Math.abs(n.y);
    const az = Math.abs(n.z);
    for (let v = 0; v < 3; v++) {
      const p = v === 0 ? a : v === 1 ? b : c;
      // Vertical faces keep courses horizontal (v follows Y); horizontal faces use XZ.
      const [u, w] = ay >= ax && ay >= az ? [p.x, p.z] : ax >= az ? [p.z, p.y] : [p.x, p.y];
      uv[(i + v) * 2] = u / uvScale;
      uv[(i + v) * 2 + 1] = w / uvScale;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/**
 * Vertical prism from a convex polygon in the XZ plane (any winding).
 * UVs: top/bottom planar in XZ, sides by perimeter length and height, all in world units / `uvScale`.
 */
export function prismGeometry(poly: Array<[number, number]>, y0: number, y1: number, uvScale = 3): THREE.BufferGeometry {
  const pos: number[] = [];
  const nrm: number[] = [];
  const uvs: number[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  const cross = new THREE.Vector3();
  /** Push a triangle, flipping it if needed so its winding agrees with `normal`. */
  const tri = (pa: THREE.Vector3, pb: THREE.Vector3, pc: THREE.Vector3, normal: THREE.Vector3, uv: Array<[number, number]>) => {
    cross.subVectors(pb, pa).cross(c.subVectors(pc, pa));
    const verts: Array<[THREE.Vector3, [number, number]]> = [[pa, uv[0]], [pb, uv[1]], [pc, uv[2]]];
    if (cross.dot(normal) < 0) verts.reverse();
    for (const [p, t] of verts) {
      pos.push(p.x, p.y, p.z);
      nrm.push(normal.x, normal.y, normal.z);
      uvs.push(t[0], t[1]);
    }
  };
  const P = (i: number, y: number) => new THREE.Vector3(poly[i][0], y, poly[i][1]);
  const planarUV = (v: THREE.Vector3): [number, number] => [v.x / uvScale, v.z / uvScale];
  const up = new THREE.Vector3(0, 1, 0);
  const down = new THREE.Vector3(0, -1, 0);
  for (let i = 1; i < poly.length - 1; i++) {
    const t0 = P(0, y1), t1 = P(i, y1), t2 = P(i + 1, y1);
    tri(t0, t1, t2, up, [planarUV(t0), planarUV(t1), planarUV(t2)]);
    const b0 = P(0, y0), b1 = P(i, y0), b2 = P(i + 1, y0);
    tri(b0, b1, b2, down, [planarUV(b0), planarUV(b1), planarUV(b2)]);
  }
  let cx = 0;
  let cz = 0;
  for (const [x, z] of poly) {
    cx += x / poly.length;
    cz += z / poly.length;
  }
  let perim = 0;
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    a.set(poly[i][0], 0, poly[i][1]);
    b.set(poly[j][0], 0, poly[j][1]);
    const len = a.distanceTo(b);
    n.set(b.z - a.z, 0, -(b.x - a.x)).normalize();
    if (n.x * ((a.x + b.x) / 2 - cx) + n.z * ((a.z + b.z) / 2 - cz) < 0) n.negate();
    const u0 = perim / uvScale;
    const u1 = (perim + len) / uvScale;
    const v0 = y0 / uvScale;
    const v1 = y1 / uvScale;
    const q0 = P(i, y0), q1 = P(j, y0), q2 = P(j, y1), q3 = P(i, y1);
    tri(q0, q1, q2, n, [[u0, v0], [u1, v0], [u1, v1]]);
    tri(q0, q2, q3, n, [[u0, v0], [u1, v1], [u0, v1]]);
    perim += len;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return g;
}

/** Gear wheel with teeth and a hub hole, extruded along Z. */
export function gearGeometry(radius: number, teeth: number, toothDepth: number, thickness: number, hole = radius * 0.25): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const steps = teeth * 4;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const phase = i % 4;
    const r = phase === 1 || phase === 2 ? radius + toothDepth : radius;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  const holePath = new THREE.Path();
  holePath.absarc(0, 0, hole, 0, Math.PI * 2, true);
  shape.holes.push(holePath);
  // Spoke windows.
  const spokes = 5;
  for (let s = 0; s < spokes; s++) {
    const a0 = (s / spokes) * Math.PI * 2 + 0.22;
    const a1 = a0 + (Math.PI * 2) / spokes - 0.44;
    const p = new THREE.Path();
    const rIn = hole + radius * 0.12;
    const rOut = radius * 0.78;
    p.absarc(0, 0, rOut, a1, a0, true);
    p.absarc(0, 0, rIn, a0, a1, false);
    shape.holes.push(p);
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 1, curveSegments: 6 });
  g.translate(0, 0, -thickness / 2);
  return g;
}

// ---------------------------------------------------------------- batching

export interface BatchOptions {
  /** Multiplier applied through vertex colours; lets one material show per-piece variation. */
  tint?: THREE.Color;
  /** Darken/green the lower parts of a piece as if damp. Uses world Y. */
  damp?: boolean;
  castShadow?: boolean;
  receiveShadow?: boolean;
}

interface Bucket {
  material: THREE.Material;
  castShadow: boolean;
  receiveShadow: boolean;
  geometries: THREE.BufferGeometry[];
}

const tmpV = new THREE.Vector3();
const tmpC = new THREE.Color();

/**
 * Collects static geometry and merges it per material to keep draw calls low. The level is built
 * from hundreds of pieces; after `build()` it renders in a few dozen draw calls.
 */
export class Batcher {
  private buckets = new Map<string, Bucket>();

  add(geometry: THREE.BufferGeometry, material: THREE.Material, matrix?: THREE.Matrix4, opts: BatchOptions = {}): void {
    let g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    }
    if (!g.getAttribute('uv')) {
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
    }
    if (matrix) g.applyMatrix4(matrix);
    const pos = g.getAttribute('position');
    const colors = new Float32Array(pos.count * 3);
    const tint = opts.tint ?? tmpC.setRGB(1, 1, 1);
    for (let i = 0; i < pos.count; i++) {
      let r = tint.r;
      let gr = tint.g;
      let b = tint.b;
      if (opts.damp) {
        tmpV.fromBufferAttribute(pos, i);
        // Below the tier floors the stone is wetter, darker and greener.
        const wet = THREE.MathUtils.clamp((-tmpV.y + 1) / 10, 0, 1);
        r *= 1 - wet * 0.45;
        gr *= 1 - wet * 0.3;
        b *= 1 - wet * 0.35;
      }
      colors[i * 3] = r;
      colors[i * 3 + 1] = gr;
      colors[i * 3 + 2] = b;
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    g.clearGroups();
    const cast = opts.castShadow ?? true;
    const receive = opts.receiveShadow ?? true;
    const key = `${material.uuid}|${cast}|${receive}`;
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { material, castShadow: cast, receiveShadow: receive, geometries: [] };
      this.buckets.set(key, bucket);
    }
    bucket.geometries.push(g);
  }

  build(parent: THREE.Object3D): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    for (const bucket of this.buckets.values()) {
      if (!bucket.geometries.length) continue;
      const merged = mergeGeometries(bucket.geometries, false);
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, bucket.material);
      mesh.castShadow = bucket.castShadow;
      mesh.receiveShadow = bucket.receiveShadow;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      parent.add(mesh);
      meshes.push(mesh);
      for (const g of bucket.geometries) g.dispose();
    }
    this.buckets.clear();
    return meshes;
  }
}

/** Helper to compose a transform matrix from position, Y rotation and optional extra rotation. */
export function trs(x: number, y: number, z: number, rotY = 0, rotX = 0, rotZ = 0, scale = 1): THREE.Matrix4 {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rotX, rotY, rotZ, 'YXZ'));
  m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(scale, scale, scale));
  return m;
}

/**
 * Merge every static mesh under `root` into one mesh per material (fewer draw calls for set pieces
 * built from many small parts). Meshes under any object in `keep` (animated parts) are left alone.
 */
export function mergeStatic(root: THREE.Object3D, keep: THREE.Object3D[] = []): void {
  root.updateMatrixWorld(true);
  const toLocal = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const kept = (o: THREE.Object3D) => {
    for (let p: THREE.Object3D | null = o; p && p !== root; p = p.parent) if (keep.includes(p)) return true;
    return false;
  };
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const merged: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || kept(m) || Array.isArray(m.material)) return;
    let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
    g = g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(toLocal, m.matrixWorld));
    g.clearGroups();
    const list = buckets.get(m.material) ?? [];
    list.push(g);
    buckets.set(m.material, list);
    merged.push(m);
  });
  for (const m of merged) m.removeFromParent();
  for (const [material, geometries] of buckets) {
    const g = mergeGeometries(geometries, false);
    if (!g) continue;
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, material);
    mesh.matrixAutoUpdate = false;
    root.add(mesh);
    for (const part of geometries) part.dispose();
  }
}
