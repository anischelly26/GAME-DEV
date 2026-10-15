import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildAllParts } from './maraBuild';
import { decodeBake, type BakedMesh } from './bakeFormat';
import { bonePos, boneDefs, EYE, SIDES, type MaterialKey } from './maraParts';
import type { MeshData } from './mesher';

export { ARM_BIND_ANGLE } from './maraParts';

/**
 * Assembles Mara Venn from her sculpted parts (see maraParts.ts) into skinned meshes on one
 * skeleton. Every arm bone carries the A-pose angle as its rest rotation, so animation sets arm
 * rotations exactly as for a figure whose arms hang straight down: local -Y runs along each limb.
 */

export type MaraMaterials = Record<MaterialKey | 'lid' | 'eye', THREE.MeshStandardMaterial>;

export function maraMaterials(): MaraMaterials {
  const m = (color: string, roughness: number, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness, vertexColors: true });
  return {
    skin: m('#d39c7c', 0.55),
    lid: m('#cf9677', 0.6),
    eye: new THREE.MeshStandardMaterial({ map: eyeTexture(), roughness: 0.12 }),
    shirt: m('#d2ccbe', 0.92),
    jacket: m('#8d673c', 0.8),
    trousers: m('#465166', 0.9),
    patch: m('#7d6d55', 0.95),
    leather: m('#5a3a23', 0.45),
    sole: m('#211a15', 0.85),
    belt: m('#43291a', 0.5),
    brass: m('#c79a4c', 0.32, 0.9),
    steel: m('#a3aab0', 0.3, 0.9),
    laces: m('#b99c6b', 0.9),
    scarf: m('#d9644a', 0.95),
    hair: m('#4a2a1d', 0.45),
  };
}

export interface MaraRig {
  root: THREE.Group;
  skeleton: THREE.Skeleton;
  bones: Map<string, THREE.Bone>;
  meshes: THREE.Mesh[];
  materials: MaraMaterials;
  /** 0 = open, 1 = closed. */
  setBlink(t: number): void;
  /** Turn both eyes (radians, relative to the head). */
  setGaze(yaw: number, pitch: number): void;
  stats: { triangles: number; rawTriangles: number; millis: number; source: 'baked' | 'workers' | 'main'; parts: Record<string, string> };
}

function toGeometry(m: MeshData | BakedMesh): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  // Baked meshes are quantised (int8 normals, uint8 colours and weights); normalised attributes
  // read back as the same 0..1 / -1..1 values in the shaders.
  const quantised = m.normal instanceof Int8Array;
  g.setAttribute('position', new THREE.BufferAttribute(m.position, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(m.normal, 3, quantised));
  g.setAttribute('color', new THREE.BufferAttribute(m.color, 3, quantised));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(m.skinIndex, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(m.skinWeight, 4, quantised));
  g.setIndex(new THREE.BufferAttribute(m.index, 1));
  return g;
}

/** The pre-built parts from public/mara/mara.bin, if present and baked from this exact source. */
async function loadBaked(): Promise<Array<{ name: string; material: MaterialKey; mesh: BakedMesh }> | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}mara/mara.bin`);
    if (!res.ok) return null;
    const bake = decodeBake(await res.arrayBuffer());
    if (!bake) return null;
    const expected = typeof __MARA_BAKE_HASH__ === 'string' ? __MARA_BAKE_HASH__ : '';
    if (bake.hash !== expected) {
      console.info(`Mara: mara.bin is stale (${bake.hash}, source ${expected}); building at load time. Run npm run bake:mara.`);
      return null;
    }
    return bake.parts;
  } catch {
    return null;
  }
}

/** Build Mara. The sculpting runs in Web Workers; await this while loading. */
export async function buildMara(opts: { workers?: boolean; baked?: boolean } = {}): Promise<MaraRig> {
  const t0 = performance.now();
  const defs = boneDefs();
  const bones = new Map<string, THREE.Bone>();
  const order: THREE.Bone[] = [];
  const root = new THREE.Group();
  root.name = 'mara';
  const parentInv = new THREE.Matrix4();
  const local = new THREE.Matrix4();
  for (const d of defs) {
    const b = new THREE.Bone();
    b.name = d.name;
    const parent = d.parent ? bones.get(d.parent)! : null;
    const world = new THREE.Matrix4().compose(
      new THREE.Vector3(...d.pos),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), d.rz ?? 0),
      new THREE.Vector3(1, 1, 1),
    );
    if (parent) {
      parentInv.copy(parent.matrixWorld).invert();
      local.multiplyMatrices(parentInv, world);
      parent.add(b);
    } else {
      local.copy(world);
      root.add(b);
    }
    local.decompose(b.position, b.quaternion, b.scale);
    b.updateMatrixWorld(true);
    bones.set(d.name, b);
    order.push(b);
  }
  const index = new Map(order.map((b, i) => [b.name, i]));
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(order);
  const materials = maraMaterials();

  const byMaterial = new Map<MaterialKey, THREE.BufferGeometry[]>();
  const parts: Record<string, string> = {};
  let rawTriangles = 0;
  const baked = opts.baked === false ? null : await loadBaked();
  const source: MaraRig['stats']['source'] = baked ? 'baked' : opts.workers === false ? 'main' : 'workers';
  for (const p of baked ?? (await buildAllParts(index, opts.workers ?? true))) {
    if ('millis' in p) {
      parts[p.name] = `${p.millis}+${p.simplifyMillis}ms ${p.rawTriangles}->${p.mesh.index.length / 3}`;
      rawTriangles += p.rawTriangles;
    }
    const list = byMaterial.get(p.material) ?? [];
    list.push(toGeometry(p.mesh));
    byMaterial.set(p.material, list);
  }

  const meshes: THREE.Mesh[] = [];
  let triangles = 0;
  for (const [key, geos] of byMaterial) {
    const geo = geos.length === 1 ? geos[0] : mergeGeometries(geos)!;
    geo.computeBoundingSphere();
    const mesh = new THREE.SkinnedMesh(geo, materials[key]);
    mesh.name = `mara-${key}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    root.add(mesh);
    mesh.bind(skeleton);
    meshes.push(mesh);
    triangles += (geo.index?.count ?? 0) / 3;
  }

  // Eyes and eyelids are rigid children of the head bone.
  const head = bones.get('head')!;
  const headPos = bonePos(defs, 'head');
  const eyes: THREE.Mesh[] = [];
  const upperLids: THREE.Mesh[] = [];
  const lowerLids: THREE.Mesh[] = [];
  const eyeGeo = new THREE.SphereGeometry(EYE.r, 24, 16);
  const upperGeo = lidGeometry(EYE.r + 0.0008, true);
  const lowerGeo = lidGeometry(EYE.r + 0.0007, false);
  for (const s of SIDES) {
    const p = new THREE.Vector3(s * EYE.x - headPos[0], EYE.y - headPos[1], EYE.z - headPos[2]);
    const eye = new THREE.Mesh(eyeGeo, materials.eye);
    eye.position.copy(p);
    const up = new THREE.Mesh(upperGeo, materials.lid);
    up.position.copy(p);
    const lo = new THREE.Mesh(lowerGeo, materials.lid);
    lo.position.copy(p);
    head.add(eye, up, lo);
    eyes.push(eye);
    upperLids.push(up);
    lowerLids.push(lo);
    meshes.push(eye, up, lo);
  }
  let gazePitch = 0;
  const setGaze = (yaw: number, pitch: number) => {
    gazePitch = pitch;
    // The texture's iris sits at u = 0.5 (+X); turning -90 degrees about Y brings it to +Z.
    eyes.forEach((e, i) => e.rotation.set(pitch, -Math.PI / 2 + yaw + (i === 0 ? 0.04 : -0.04), 0, 'YXZ'));
  };
  const setBlink = (t: number) => {
    // The upper lid rests just above the pupil and follows the gaze a little.
    const open = -0.3 + gazePitch * 0.5;
    for (const l of upperLids) l.rotation.x = open + (1.25 - open) * t;
    for (const l of lowerLids) l.rotation.x = 0.5 - 0.15 * t;
  };
  setGaze(0, 0);
  setBlink(0);

  return {
    root,
    skeleton,
    bones,
    meshes,
    materials,
    setBlink,
    setGaze,
    stats: { triangles, rawTriangles, millis: Math.round(performance.now() - t0), source, parts },
  };
}

/** Eyelid: a thin spherical cap with a dark lash line along its edge (vertex colours). */
function lidGeometry(r: number, upper: boolean): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(r, 24, 8, 0, Math.PI * 2, upper ? 0 : Math.PI / 2, Math.PI / 2);
  const pos = g.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const edge = 1 - Math.abs(pos.getY(i)) / r; // 1 at the rim of the cap
    const c = edge > 0.9 ? 0.18 : 1;
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = c;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function eyeTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#d9d0c6';
  g.fillRect(0, 0, 256, 128);
  // Equirectangular: u = 0.5 is the front of the eye after the mesh rotation. Equal pixel radii in
  // u and v give a round iris on the sphere.
  const cx = 128;
  const cy = 64;
  const iris = g.createRadialGradient(cx, cy, 2, cx, cy, 24);
  iris.addColorStop(0, '#3b4a2c');
  iris.addColorStop(0.45, '#6b7a3e');
  iris.addColorStop(0.8, '#4d5a33');
  iris.addColorStop(1, '#232a1a');
  g.fillStyle = iris;
  g.beginPath();
  g.arc(cx, cy, 24, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#0c0d0c';
  g.beginPath();
  g.arc(cx, cy, 9, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.beginPath();
  g.arc(cx - 6, cy - 7, 3.2, 0, Math.PI * 2);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
