import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../../core/math';

/**
 * Plants for the outdoors, all procedural: leafy blobs for hedges and tree crowns (a canvas leaf
 * texture on lumpy spheres), and grass tufts as crossed cards that sway in the wind (one instanced
 * draw for a whole field).
 */

let leafTex: THREE.CanvasTexture | null = null;

/** Overlapping leaves in greens, tiling: hedge and canopy surface. */
export function leafTexture(): THREE.CanvasTexture {
  if (leafTex) return leafTex;
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const rng = mulberry32(5);
  g.fillStyle = '#2c3f1f';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 900; i++) {
    const x = rng() * S;
    const y = rng() * S;
    const r = 5 + rng() * 9;
    const a = rng() * Math.PI;
    const l = 22 + rng() * 26;
    const h = 78 + rng() * 40;
    g.fillStyle = `hsl(${h}, ${35 + rng() * 20}%, ${l}%)`;
    for (const [dx, dy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]]) {
      g.beginPath();
      g.ellipse(x + dx, y + dy, r, r * 0.45, a, 0, Math.PI * 2);
      g.fill();
    }
  }
  leafTex = new THREE.CanvasTexture(c);
  leafTex.wrapS = leafTex.wrapT = THREE.RepeatWrapping;
  leafTex.colorSpace = THREE.SRGBColorSpace;
  leafTex.anisotropy = 4;
  return leafTex;
}

export function leafMaterial(tint = '#ffffff'): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ map: leafTexture(), color: tint, roughness: 0.9, metalness: 0, vertexColors: true });
}

/**
 * A lumpy blob of leaves (an icosphere pushed in and out by noise), radius about 1, sitting on y=0
 * when `flatBottom`. UVs are spherical so the leaf texture wraps it.
 */
export function bushGeometry(seed: number, detail = 3, flatBottom = true): THREE.BufferGeometry {
  const rng = mulberry32(seed);
  // Shared vertices (so it shades smooth, not faceted), displaced by smooth noise.
  const ico = new THREE.IcosahedronGeometry(1, detail);
  ico.deleteAttribute('normal');
  ico.deleteAttribute('uv');
  const geo = mergeVertices(ico);
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.getAttribute('position').count * 2), 2));
  const pos = geo.getAttribute('position');
  const ph = [rng() * 10, rng() * 10, rng() * 10];
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = Math.sin(v.x * 3.1 + ph[0]) * Math.sin(v.y * 2.7 + ph[1]) * Math.sin(v.z * 3.3 + ph[2]);
    const k = 1 + n * 0.16;
    v.multiplyScalar(k);
    if (flatBottom && v.y < -0.35) v.y = -0.35 + (v.y + 0.35) * 0.2;
    pos.setXYZ(i, v.x, v.y + (flatBottom ? 0.35 : 0), v.z);
  }
  geo.computeVertexNormals();
  // A slanted planar projection: no wrap-around seam (the leaf texture hides the stretch).
  const uv = geo.getAttribute('uv');
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    uv.setXY(i, v.x * 0.9 + v.z * 0.5, v.y * 1.1 + v.z * 0.45);
  }
  return geo;
}

/** Grass blades on a card: a tuft texture with alpha. */
function tuftTexture(): THREE.CanvasTexture {
  const W = 128;
  const H = 128;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const rng = mulberry32(17);
  for (let i = 0; i < 46; i++) {
    const x = 10 + rng() * (W - 20);
    const h = H * (0.45 + rng() * 0.55);
    const lean = (rng() - 0.5) * 34;
    const w = 2.5 + rng() * 3;
    const l = 40 + rng() * 22;
    g.fillStyle = `hsl(${62 + rng() * 26}, ${24 + rng() * 18}%, ${l}%)`;
    g.beginPath();
    g.moveTo(x - w, H);
    g.quadraticCurveTo(x + lean * 0.3, H - h * 0.6, x + lean, H - h);
    g.quadraticCurveTo(x + lean * 0.3 + w * 0.4, H - h * 0.6, x + w, H);
    g.closePath();
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export interface GrassOptions {
  count: number;
  /** Where tufts may go: return the ground height there, or null for no grass. */
  ground: (x: number, z: number) => number | null;
  bounds: { x0: number; x1: number; z0: number; z1: number };
  seed?: number;
  /** Tuft height range (m). */
  height?: [number, number];
  color?: string;
}

/**
 * A field of grass tufts: two crossed cards each, instanced, swaying in the wind (vertex shader;
 * the base stays put). One draw call.
 */
export class GrassField {
  readonly mesh: THREE.InstancedMesh;
  private readonly uniforms = { time: { value: 0 } };

  constructor(o: GrassOptions) {
    const rng = mulberry32(o.seed ?? 3);
    // Two crossed quads, base at y=0, 1 m tall and wide.
    const quad = (rot: number) => {
      const g = new THREE.PlaneGeometry(1, 1, 1, 2);
      g.translate(0, 0.5, 0);
      g.rotateY(rot);
      return g;
    };
    const a = quad(0);
    const b = quad(Math.PI / 2);
    const geo = new THREE.BufferGeometry();
    const merge = (gs: THREE.BufferGeometry[]) => {
      const pos: number[] = [];
      const nor: number[] = [];
      const uv: number[] = [];
      for (const g of gs) {
        const ng = g.toNonIndexed();
        pos.push(...(ng.getAttribute('position').array as Float32Array));
        uv.push(...(ng.getAttribute('uv').array as Float32Array));
        // Normals point up: lit like the ground it grows from, never black edge-on.
        for (let i = 0; i < ng.getAttribute('position').count; i++) nor.push(0, 1, 0);
      }
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    };
    merge([a, b]);
    const mat = new THREE.MeshStandardMaterial({ map: tuftTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1, color: o.color ?? '#d8dcae' });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.time = this.uniforms.time;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float time;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          {
            vec4 wp = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
            float sway = sin(time * 1.7 + wp.x * 0.35 + wp.z * 0.2) * 0.5 + sin(time * 3.1 + wp.x * 0.9) * 0.2;
            transformed.x += sway * 0.12 * position.y * position.y;
            transformed.z += sway * 0.05 * position.y * position.y;
          }`,
        );
    };
    mat.customProgramCacheKey = () => 'grass-tuft';
    this.mesh = new THREE.InstancedMesh(geo, mat, o.count);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const c = new THREE.Color();
    const [h0, h1] = o.height ?? [0.25, 0.55];
    let n = 0;
    for (let tries = 0; tries < o.count * 4 && n < o.count; tries++) {
      const x = o.bounds.x0 + rng() * (o.bounds.x1 - o.bounds.x0);
      const z = o.bounds.z0 + rng() * (o.bounds.z1 - o.bounds.z0);
      const y = o.ground(x, z);
      if (y === null) continue;
      const h = h0 + rng() * (h1 - h0);
      p.set(x, y - 0.02, z);
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rng() * Math.PI);
      s.set(h * (0.9 + rng() * 0.5), h, h * (0.9 + rng() * 0.5));
      m.compose(p, q, s);
      this.mesh.setMatrixAt(n, m);
      c.setHSL(0.2 + rng() * 0.06, 0.25 + rng() * 0.2, 0.75 + rng() * 0.25);
      this.mesh.setColorAt(n, c);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
  }

  update(time: number): void {
    this.uniforms.time.value = time;
  }
}

/**
 * An old tree: a tapering trunk with a few limbs, and leafy crowns on them (or none: a dead tree).
 * Returns pieces for the batcher: [geometry, material key, matrix].
 */
export function treePieces(seed: number, height: number, leafy: boolean): Array<{ geo: THREE.BufferGeometry; mat: 'bark' | 'leaf'; matrix: THREE.Matrix4 }> {
  const rng = mulberry32(seed);
  const out: Array<{ geo: THREE.BufferGeometry; mat: 'bark' | 'leaf'; matrix: THREE.Matrix4 }> = [];
  const limb = (from: THREE.Vector3, to: THREE.Vector3, r0: number, r1: number) => {
    const d = to.clone().sub(from);
    const len = d.length();
    const geo = new THREE.CylinderGeometry(r1, r0, len, 9, 3);
    // Knobbly bark.
    const pos = geo.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const k = 1 + (rng() - 0.5) * 0.12;
      pos.setX(i, pos.getX(i) * k);
      pos.setZ(i, pos.getZ(i) * k);
    }
    geo.computeVertexNormals();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
    out.push({ geo, mat: 'bark', matrix: new THREE.Matrix4().compose(from.clone().addScaledVector(d, 0.5), q, new THREE.Vector3(1, 1, 1)) });
  };
  const trunkTop = new THREE.Vector3((rng() - 0.5) * 0.4, height * 0.45, (rng() - 0.5) * 0.4);
  const r = height * 0.045;
  limb(new THREE.Vector3(0, -0.2, 0), trunkTop, r * 1.5, r);
  // Root flare.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + rng();
    limb(new THREE.Vector3(Math.sin(a) * r * 2.2, -0.1, Math.cos(a) * r * 2.2), new THREE.Vector3(0, height * 0.12, 0), r * 0.5, r * 0.6);
  }
  const limbs = 4 + Math.floor(rng() * 3);
  for (let i = 0; i < limbs; i++) {
    const a = (i / limbs) * Math.PI * 2 + rng() * 0.8;
    const up = height * (0.55 + rng() * 0.4);
    const out1 = height * (0.22 + rng() * 0.2);
    const end = new THREE.Vector3(trunkTop.x + Math.sin(a) * out1, up, trunkTop.z + Math.cos(a) * out1);
    limb(trunkTop.clone().setY(trunkTop.y - 0.2), end, r * 0.65, r * 0.25);
    if (leafy) {
      const s = height * (0.2 + rng() * 0.12);
      out.push({ geo: bushGeometry(seed * 13 + i, 2, false), mat: 'leaf', matrix: new THREE.Matrix4().compose(end, new THREE.Quaternion().setFromEuler(new THREE.Euler(rng(), rng() * 6, rng())), new THREE.Vector3(s * 1.2, s * 0.85, s * 1.2)) });
    } else {
      // Bare twigs.
      for (let k = 0; k < 2; k++) {
        const b = rng() * Math.PI * 2;
        limb(end, end.clone().add(new THREE.Vector3(Math.sin(b) * height * 0.12, height * 0.08, Math.cos(b) * height * 0.12)), r * 0.25, r * 0.08);
      }
    }
  }
  if (leafy) {
    const s = height * 0.32;
    out.push({ geo: bushGeometry(seed * 7, 3, false), mat: 'leaf', matrix: new THREE.Matrix4().compose(new THREE.Vector3(trunkTop.x, height * 0.82, trunkTop.z), new THREE.Quaternion(), new THREE.Vector3(s * 1.3, s * 0.9, s * 1.3)) });
  }
  return out;
}
