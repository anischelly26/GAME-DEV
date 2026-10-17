import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { LevelContext } from '../Level';
import { Batcher, boxProjectUVs, worldBox, trs } from '../../world/geometry';
import { Water } from '../../world/Atmosphere';
import { Palette } from '../../world/materials';
import { mulberry32 } from '../../core/math';
import { buildCottage, type CottageMaterials } from '../../world/props/Cottage';
import { GrassField, bushGeometry, leafMaterial, treePieces } from '../../world/props/Foliage';
import { G, groundY } from './layout';

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export interface Village {
  readonly root: THREE.Group;
  /** Tall grass Mara can hide in (the Watch cannot see into it). */
  readonly tallGrass: Array<{ x0: number; x1: number; z0: number; z1: number; y: number }>;
  /** The cove wall's ledge and the playground's fallen wall top (registered climbable). */
  readonly coveLedge: RAPIER.Collider;
  readonly lowWall: RAPIER.Collider;
  /** Where the distant lighthouse stands (Chapter Three's destination). */
  readonly lighthouseAt: THREE.Vector3;
  update(dt: number, time: number, cameraPos: THREE.Vector3): void;
}

/**
 * The static world of the Warders' Green: the spur's ground and cliffs, the shingle cove, Cottage
 * Lane with its cottages, hedges and gardens, the green, the sunken playground's walls, the sea
 * wall, the hangar yard, the sea, and the distant prison. Batched by material.
 */
export function buildVillage(ctx: LevelContext): Village {
  const { scene, physics, materials: m } = ctx;
  const root = new THREE.Group();
  root.name = 'warders-green';
  scene.add(root);
  const batch = new Batcher();
  const rng = mulberry32(2024);
  const tint = (b = 1, spread = 0.08) => new THREE.Color(b + (rng() - 0.5) * spread, b + (rng() - 0.5) * spread, b + (rng() - 0.5) * spread);
  const leaves = leafMaterial();
  const leavesDark = leafMaterial('#b8c7a4');
  const bark = new THREE.MeshStandardMaterial({ map: m.wood.map, normalMap: m.wood.normalMap, color: '#6a5a4a', roughness: 0.95, vertexColors: true });
  const paint = (c: string) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, metalness: 0, map: m.wood.map, vertexColors: true });
  const doorMats = ['#3f6a7a', '#7b3b2f', '#4d6a43', '#2f4560', '#8a6a3a'].map(paint);
  const trim = paint('#d8d2c4');
  const glass = new THREE.MeshStandardMaterial({ color: '#141c22', roughness: 0.15, metalness: 0.3, envMapIntensity: 1.4, vertexColors: true });
  const iron = m.ironDark;

  /** Solid box: batched and collidable. */
  const solid = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, mat: THREE.Material, opts: { tint?: THREE.Color; collide?: boolean; camera?: boolean; uv?: number } = {}) => {
    const c = v3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    batch.add(worldBox(x1 - x0, y1 - y0, z1 - z0, opts.uv ?? 3), mat, trs(c.x, c.y, c.z), { tint: opts.tint ?? tint() });
    if (opts.collide ?? true) return physics.box(c, v3((x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2), undefined, { blocksCamera: opts.camera ?? true });
    return null;
  };
  /** An invisible wall: Mara cannot pass, the camera and the Watch's sight can. */
  const fence = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) =>
    physics.box(v3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), v3((x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2), undefined, { blocksCamera: false });

  // ------------------------------------------------------------ ground (visual: gently uneven)
  const groundMesh = (x0: number, x1: number, z0: number, z1: number, y: number, mat: THREE.Material, bump = 0.04, seg = 1.5) => {
    const w = x1 - x0;
    const d = z1 - z0;
    const geo = new THREE.PlaneGeometry(w, d, Math.max(1, Math.round(w / seg)), Math.max(1, Math.round(d / seg)));
    geo.rotateX(-Math.PI / 2);
    const pos = geo.getAttribute('position');
    const uv = geo.getAttribute('uv');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + (x0 + x1) / 2;
      const z = pos.getZ(i) + (z0 + z1) / 2;
      const edge = Math.min(x - x0, x1 - x, z - z0, z1 - z);
      const h = edge < 0.2 ? 0 : (Math.sin(x * 0.7) * Math.sin(z * 0.53) + Math.sin(x * 1.9 + z * 1.3) * 0.4) * bump;
      pos.setY(i, h);
      uv.setXY(i, x / 3, z / 3);
    }
    geo.computeVertexNormals();
    batch.add(geo, mat, trs((x0 + x1) / 2, y, (z0 + z1) / 2), { tint: tint(1, 0.04), castShadow: false });
  };
  const B = G.bowl;
  // The village (south of the playground), the strips either side of it, the yard.
  groundMesh(G.land.x0, G.land.x1, G.lane.z0, B.z0, 0, m.grass, 0.05);
  groundMesh(G.land.x0, B.x0, B.z0, G.wall.z0, 0, m.grass, 0.05);
  groundMesh(B.x1, G.land.x1, B.z0, G.wall.z0, 0, m.grass, 0.05);
  groundMesh(G.yard.x0, G.yard.x1, G.wall.z1, G.yard.z1, 0, m.stoneDark, 0.015, 3);
  groundMesh(G.land.x0, G.yard.x0, G.wall.z1, G.yard.z1, 0, m.grass, 0.05);
  groundMesh(G.yard.x1, G.land.x1, G.wall.z1, G.yard.z1, 0, m.grass, 0.05);
  physics.box(v3(0, -2, (G.lane.z0 + B.z0) / 2), v3(20, 2, (B.z0 - G.lane.z0) / 2));
  physics.box(v3((G.land.x0 + B.x0) / 2, -2, (B.z0 + G.wall.z0) / 2), v3((B.x0 - G.land.x0) / 2, 2, (G.wall.z0 - B.z0) / 2));
  physics.box(v3((B.x1 + G.land.x1) / 2, -2, (B.z0 + G.wall.z0) / 2), v3((G.land.x1 - B.x1) / 2, 2, (G.wall.z0 - B.z0) / 2));
  physics.box(v3(0, -2, (G.wall.z1 + G.yard.z1 + 6) / 2), v3(20, 2, (G.yard.z1 + 6 - G.wall.z1) / 2));
  // The lane's gravel, and garden paths up to each door.
  groundMesh(-G.lane.x, G.lane.x, G.lane.z0, G.lane.z1, 0.012, m.gravel, 0.01, 2);

  // ------------------------------------------------------------ cliffs round the spur
  const cliffRock = (x0: number, x1: number, z0: number, z1: number, yTop: number) => {
    solid(x0, x1, G.seaY - 3, yTop, z0, z1, m.stoneDark, { tint: tint(0.75, 0.1) });
    // Boulders at the foot.
    const n = Math.ceil((Math.abs(x1 - x0) + Math.abs(z1 - z0)) / 2.2);
    for (let i = 0; i < n; i++) {
      const t = (i + rng()) / n;
      const x = x0 + (x1 - x0) * t;
      const z = z0 + (z1 - z0) * t;
      const s = 0.8 + rng() * 1.4;
      batch.add(boxProjectUVs(bushGeometry(900 + i + Math.round(x * 7 + z * 3), 2, false), 1.2), m.stoneDark, trs(x + (rng() - 0.5) * 2, G.seaY + rng() * 0.6, z + (rng() - 0.5) * 2, rng() * 6, rng(), rng(), s), { tint: tint(0.6, 0.12) });
    }
  };
  cliffRock(G.land.x0 - 2, G.land.x0, G.lane.z0, G.yard.z1 + 6, 0);
  cliffRock(G.land.x1, G.land.x1 + 2, G.lane.z0, G.yard.z1 + 6, 0);
  cliffRock(G.land.x0 - 2, G.land.x1 + 2, G.yard.z1 + 6, G.yard.z1 + 8, 0);
  // The cove's sides: rock from the lane's level down to the beach.
  cliffRock(G.land.x0 - 2, G.cove.x0, G.cove.z0 - 2, G.lane.z0, 0);
  cliffRock(G.cove.x1, G.land.x1 + 2, G.cove.z0 - 2, G.lane.z0, 0);

  // ------------------------------------------------------------ the cove: landing, beach, wall
  const C = G.cove;
  solid(C.x0, C.x1, C.landingY - 2, C.landingY, C.landingZ0, G.lane.z0 - 0.6, m.shingle, { tint: tint(0.9) });
  {
    // The beach: a slab sloping from the landing to under the sea.
    const len = Math.hypot(C.landingZ0 - C.z0, C.landingY - (G.seaY - 0.4));
    const ang = Math.atan2(C.landingY - (G.seaY - 0.4), C.landingZ0 - C.z0);
    const cz = (C.landingZ0 + C.z0) / 2;
    const cy = (C.landingY + G.seaY - 0.4) / 2 - 0.5 * Math.cos(ang);
    // Tilted so its north end (toward the landing) is the high one.
    const q = new THREE.Quaternion().setFromAxisAngle(v3(1, 0, 0), -ang);
    batch.add(worldBox(C.x1 - C.x0, 1, len, 3), m.shingle, new THREE.Matrix4().compose(v3(0, cy, cz), q, v3(1, 1, 1)), { tint: tint(0.95) });
    physics.box(v3(0, cy, cz), v3((C.x1 - C.x0) / 2, 0.5, len / 2), q);
    // Pebbles and rocks on the beach.
    for (let i = 0; i < 40; i++) {
      const x = C.x0 + 1 + rng() * (C.x1 - C.x0 - 2);
      const z = C.z0 + 4 + rng() * (C.landingZ0 - C.z0 - 4);
      const y = groundY(x, z);
      if (y === null || Math.abs(x) < 2.2) continue;
      const s = 0.15 + rng() * rng() * 0.9;
      batch.add(boxProjectUVs(bushGeometry(400 + i, 2, true), 1.2), m.stoneDark, trs(x, y - s * 0.3, z, rng() * 6, 0, 0, s), { tint: tint(0.7, 0.15) });
    }
    // The waterline: too cold to wade out.
    fence(C.x0, C.x1, G.seaY - 1, 3, C.z0 + 3.2, C.z0 + 3.6);
  }
  // The cove wall: 1.7 m of old stone with a coping Mara can catch.
  solid(C.x0, C.x1, C.landingY, -0.25, G.lane.z0 - 0.6, G.lane.z0, m.stone, { tint: tint(0.85) });
  const coveLedge = solid(C.x0, C.x1, -0.25, 0.02, G.lane.z0 - 0.75, G.lane.z0 + 0.2, m.stone, { tint: tint(0.7) })!;
  // A beached rowing boat, keel up (somebody's way off the island, long ago).
  {
    const hull = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    batch.add(hull, m.wood, trs(-6.2, groundY(-6.2, -38)! + 0.02, -38, 0.5, Math.PI, 0, 1).multiply(new THREE.Matrix4().makeScale(0.8, 0.55, 2.2)), { tint: tint(0.7) });
    physics.box(v3(-6.2, groundY(-6.2, -38)! + 0.25, -38), v3(0.8, 0.3, 2.1), 0.5);
  }

  // ------------------------------------------------------------ Cottage Lane
  const cottageMats = (i: number): CottageMaterials => ({ wall: i % 2 ? m.stone : m.mossyStone, roof: m.slate, trim, glass, door: doorMats[i % doorMats.length], dark: iron });
  const tallGrass: Village['tallGrass'] = [];
  const hedge = (x0: number, z0: number, x1: number, z1: number, h: number, seed: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(len / 0.85));
    const yaw = Math.atan2(x1 - x0, z1 - z0);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const x = x0 + (x1 - x0) * t;
      const z = z0 + (z1 - z0) * t;
      batch.add(bushGeometry(seed * 31 + i, 2), i % 3 ? leaves : leavesDark, trs(x, 0, z, yaw + rng(), 0, 0).multiply(new THREE.Matrix4().makeScale(0.55, h / 1.3, 0.6)), { tint: tint(1, 0.12) });
    }
    const c = v3((x0 + x1) / 2, h / 2, (z0 + z1) / 2);
    physics.box(c, v3(0.42, h / 2, len / 2), yaw);
  };
  const lowWall = (x0: number, z0: number, x1: number, z1: number, h: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const yaw = Math.atan2(x1 - x0, z1 - z0);
    const c = v3((x0 + x1) / 2, h / 2, (z0 + z1) / 2);
    batch.add(worldBox(0.45, h, len, 3), m.mossyStone, trs(c.x, c.y, c.z, yaw), { tint: tint(0.85) });
    batch.add(worldBox(0.55, 0.1, len + 0.05, 3), m.stone, trs(c.x, h + 0.05, c.z, yaw), { tint: tint(0.7) });
    const col = physics.box(c.clone().setY((h + 0.1) / 2), v3(0.27, (h + 0.1) / 2, len / 2), yaw);
    ctx.traversal.markVaultable(col);
    return col;
  };
  const Ck = G.cottage;
  Ck.zs.forEach((zc, i) => {
    for (const side of [-1, 1]) {
      const k = i * 2 + (side > 0 ? 1 : 0);
      const x = side * (Ck.x0 + Ck.depth / 2);
      buildCottage(batch, physics, cottageMats(k), {
        at: v3(x, 0, zc + (side > 0 ? 0.4 : 0)),
        facing: side < 0 ? Math.PI / 2 : -Math.PI / 2,
        width: Ck.width,
        depth: Ck.depth,
        eaves: Ck.eaves + (k % 3) * 0.15,
        seed: 70 + k,
        doorAt: 0,
        ruined: k === 2 || k === 5,
      });
      // The front garden: a hedge along the lane with a gate gap at the door, a side hedge to the
      // next garden with a gap by the house (the sneaking way), a path to the door.
      const hx = side * (G.lane.x + 0.42);
      const z0 = zc - Ck.width / 2 - 1.0;
      const z1 = zc + Ck.width / 2 + 1.0;
      hedge(hx, z0, hx, zc - 0.75, 1.55, k * 3 + 1);
      hedge(hx, zc + 0.75, hx, z1, 1.55, k * 3 + 2);
      if (i < Ck.zs.length - 1) hedge(side * (G.lane.x + 0.8), z1, side * (Ck.x0 - 1.0), z1, 1.6, k * 3 + 3);
      groundMesh(Math.min(side * G.lane.x, side * Ck.x0), Math.max(side * G.lane.x, side * Ck.x0), zc - 0.55, zc + 0.55, 0.014, m.gravel, 0.005, 1);
      // A broken garden gate hanging open.
      const gate = new THREE.Group();
      for (let b = 0; b < 5; b++) {
        const slat = new THREE.Mesh(worldBox(0.08, 0.95, 0.04, 3), trim);
        slat.position.set(0, 0.55, -0.6 + b * 0.25);
        gate.add(slat);
      }
      for (const y of [0.3, 0.85]) {
        const rail = new THREE.Mesh(worldBox(0.06, 0.08, 1.15, 3), trim);
        rail.position.set(0, y, -0.1);
        gate.add(rail);
      }
      gate.position.set(hx, 0, zc + 0.7);
      gate.rotation.y = side * 1.2;
      gate.updateMatrixWorld(true);
      gate.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) batch.add(mesh.geometry, trim, mesh.matrixWorld, { tint: tint(0.85) });
      });
    }
  });
  // The far end of the lane: the old compound wall with the gate onto the green.
  const gz = G.lane.z1;
  solid(G.land.x0, -1.6, 0, 3.2, gz - 0.3, gz + 0.3, m.stone, { tint: tint(0.85) });
  solid(1.6, G.land.x1, 0, 3.2, gz - 0.3, gz + 0.3, m.stone, { tint: tint(0.85) });
  solid(-1.6, 1.6, 2.6, 3.2, gz - 0.3, gz + 0.3, m.stone, { tint: tint(0.75) });
  for (const s of [-1, 1]) solid(s * 1.6 - 0.35, s * 1.6 + 0.35, 0, 3.5, gz - 0.4, gz + 0.4, m.stone, { tint: tint(0.7) });
  // The gate itself lies off its hinges in the grass.
  batch.add(worldBox(1.5, 0.08, 2.2, 3), iron, trs(3.1, 0.06, gz + 2.2, 0.4), { tint: tint(0.7) });
  // The back gardens (west): a field wall at the cliff, low walls between gardens to vault, sheds.
  solid(-17.3, -16.8, 0, 1.2, G.lane.z0 + 1, gz - 0.3, m.mossyStone, { tint: tint(0.8) });
  Ck.zs.forEach((zc, i) => {
    const zEnd = zc + Ck.width / 2 + 1.0;
    if (i < Ck.zs.length - 1) lowWall(-16.8, zEnd, -Ck.x0 - Ck.depth, zEnd, 0.85);
    // A shed with a lean-to roof.
    const sx = -15.2;
    const sz = zc - 1.5 + (i % 2) * 2;
    solid(sx - 1.1, sx + 1.1, 0, 1.9, sz - 1.0, sz + 1.0, m.wood, { tint: tint(0.75) });
    batch.add(worldBox(2.6, 0.08, 2.5, 3), iron, trs(sx, 2.05, sz, 0, 0, 0.15), { tint: tint(0.6) });
    // Washing line posts with a line between.
    batch.add(worldBox(0.08, 1.9, 0.08, 3), m.wood, trs(-13.2, 0.95, zc - 2.6), { tint: tint(0.7) });
    batch.add(worldBox(0.08, 1.9, 0.08, 3), m.wood, trs(-13.2, 0.95, zc + 2.6), { tint: tint(0.7) });
    batch.add(new THREE.CylinderGeometry(0.008, 0.008, 5.2, 4), m.rope, trs(-13.2, 1.8, zc, 0, Math.PI / 2, 0));
  });
  // Tall grass in the back gardens and the green's corners.
  for (const [x0, x1, z0, z1] of [
    [-16.6, -12.6, -24.5, -21],
    [-16.6, -13.2, 2.5, 4.8],
    [-19, -13, 14, 21],
    [12, 19, 8, 13],
  ]) {
    tallGrass.push({ x0, x1, z0, z1, y: 0 });
  }

  // ------------------------------------------------------------ the green
  // The old oak, a dead elm, benches, the drinking fountain, lamp posts.
  const tree = (x: number, z: number, seed: number, h: number, leafy: boolean) => {
    for (const p of treePieces(seed, h, leafy)) batch.add(p.geo, p.mat === 'bark' ? bark : leaves, trs(x, 0, z).multiply(p.matrix), { tint: tint(1, 0.1) });
    physics.cylinder(v3(x, h * 0.25, z), h * 0.25, h * 0.05);
  };
  tree(-11.5, 13.5, 11, 9.5, true);
  tree(14.5, 27, 12, 8, false);
  tree(-15.5, 33, 13, 7.5, true);
  tree(-16, -6, 14, 6.5, false);
  for (const [x, z, yaw] of [
    [-6, 9.5, 0],
    [6.5, 18.5, Math.PI],
    [-14.5, 26, Math.PI / 2],
  ]) {
    // A bench: iron ends, wooden slats.
    for (const s of [-0.75, 0.75]) batch.add(worldBox(0.08, 0.75, 0.55, 3), iron, trs(x, 0.37, z, yaw).multiply(new THREE.Matrix4().makeTranslation(s, 0, 0)));
    for (let k = 0; k < 4; k++) batch.add(worldBox(1.7, 0.05, 0.11, 3), m.wood, trs(x, 0.45, z, yaw).multiply(new THREE.Matrix4().makeTranslation(0, 0, -0.18 + k * 0.13)), { tint: tint(0.8) });
    for (let k = 0; k < 2; k++) batch.add(worldBox(1.7, 0.11, 0.05, 3), m.wood, trs(x, 0.7 + k * 0.16, z, yaw).multiply(new THREE.Matrix4().makeTranslation(0, 0, -0.3)), { tint: tint(0.8) });
    physics.box(v3(x, 0.3, z), v3(0.9, 0.3, 0.32), yaw);
  }
  {
    // The drinking fountain: a stone pillar and basin, dry.
    const fx = 3.5;
    const fz = 13.5;
    batch.add(new THREE.CylinderGeometry(0.75, 0.9, 0.5, 16), m.stone, trs(fx, 0.25, fz), { tint: tint(0.85) });
    batch.add(new THREE.CylinderGeometry(0.28, 0.34, 1.6, 12), m.stone, trs(fx, 1.0, fz), { tint: tint(0.9) });
    batch.add(new THREE.CylinderGeometry(0.55, 0.4, 0.25, 16), m.stone, trs(fx, 1.75, fz), { tint: tint(0.8) });
    batch.add(new THREE.SphereGeometry(0.2, 12, 8), m.brass, trs(fx, 2.0, fz));
    physics.cylinder(v3(fx, 0.9, fz), 0.9, 0.85);
  }
  const lampPost = (x: number, z: number) => {
    batch.add(new THREE.CylinderGeometry(0.06, 0.1, 3.4, 8), iron, trs(x, 1.7, z), { tint: tint(0.8) });
    batch.add(new THREE.CylinderGeometry(0.16, 0.2, 0.3, 8), iron, trs(x, 0.15, z));
    batch.add(new THREE.CylinderGeometry(0.22, 0.14, 0.42, 6), glass, trs(x, 3.55, z));
    batch.add(new THREE.ConeGeometry(0.3, 0.25, 6), iron, trs(x, 3.88, z));
    physics.cylinder(v3(x, 1.7, z), 1.7, 0.12);
  };
  lampPost(-2.8, -26);
  lampPost(3.6, gz + 1.2);
  lampPost(-9.5, 20.5);
  lampPost(9.5, 20.5);

  // ------------------------------------------------------------ the sunken playground's walls
  // Retaining walls (south, west, east), coping stones on the rim, railings above (Mara cannot
  // climb out except up the slide's ladder).
  const rimY = 0;
  solid(B.x0 - 0.5, B.x1 + 0.5, B.floorY - 1, B.floorY, B.z0, B.z1, m.gravel, { tint: tint(0.85) });
  solid(B.x0 - 0.5, B.x1 + 0.5, B.floorY, rimY - 0.2, B.z0 - 0.5, B.z0, m.stone, { tint: tint(0.8) });
  solid(B.x0 - 0.5, B.x0, B.floorY, rimY - 0.2, B.z0, B.z1, m.stone, { tint: tint(0.8) });
  solid(B.x1, B.x1 + 0.5, B.floorY, rimY - 0.2, B.z0, B.z1, m.stone, { tint: tint(0.8) });
  solid(B.x0 - 0.6, B.x1 + 0.6, rimY - 0.2, rimY + 0.05, B.z0 - 0.6, B.z0 + 0.05, m.stone, { tint: tint(0.65) });
  solid(B.x0 - 0.6, B.x0 + 0.05, rimY - 0.2, rimY + 0.05, B.z0, B.z1, m.stone, { tint: tint(0.65) });
  solid(B.x1 - 0.05, B.x1 + 0.6, rimY - 0.2, rimY + 0.05, B.z0, B.z1, m.stone, { tint: tint(0.65) });
  const railing = (x0: number, z0: number, x1: number, z1: number, gapFrom = Infinity, gapTo = -Infinity) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.round(len / 0.14);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = x0 + (x1 - x0) * t;
      const z = z0 + (z1 - z0) * t;
      const along = (x1 - x0) * (x - x0) / len + (z1 - z0) * (z - z0) / len;
      if (along > gapFrom && along < gapTo) continue;
      batch.add(new THREE.CylinderGeometry(0.014, 0.014, 1.05, 5), iron, trs(x, rimY + 0.55, z), { castShadow: false });
      if (i % 4 === 0) batch.add(new THREE.ConeGeometry(0.03, 0.09, 5), iron, trs(x, rimY + 1.12, z), { castShadow: false });
    }
    const yaw = Math.atan2(x1 - x0, z1 - z0);
    for (const y of [0.15, 0.95]) batch.add(worldBox(0.04, 0.04, len, 3), iron, trs((x0 + x1) / 2, rimY + y, (z0 + z1) / 2, yaw));
    const a = Math.min(gapFrom, len);
    const b = Math.max(gapTo, 0);
    const dirX = (x1 - x0) / len;
    const dirZ = (z1 - z0) / len;
    // Invisible walls along the railing (taller than a double jump), split round any gap.
    const seg = (s0: number, s1: number) => {
      if (s1 - s0 < 0.05) return;
      const cx = x0 + dirX * (s0 + s1) / 2;
      const cz = z0 + dirZ * (s0 + s1) / 2;
      physics.box(v3(cx, rimY + 1.6, cz), v3(0.06, 1.6, (s1 - s0) / 2), yaw, { blocksCamera: false });
    };
    if (gapFrom < len && gapTo > 0) {
      seg(0, a);
      seg(b, len);
    } else seg(0, len);
  };
  const rail = 0.25;
  // The south rail has a gap for the slide's plank (x -0.75..0.75).
  railing(B.x0 - rail, B.z0 - rail, B.x1 + rail, B.z0 - rail, -0.75 - (B.x0 - rail), 0.75 - (B.x0 - rail));
  railing(B.x0 - rail, B.z0 - rail, B.x0 - rail, B.z1 - 0.1);
  railing(B.x1 + rail, B.z0 - rail, B.x1 + rail, B.z1 - 0.1);
  // Tall weeds in two corners of the playground (cover from the rim).
  tallGrass.push({ x0: B.x0 + 0.3, x1: B.x0 + 3.2, z0: B.z1 - 4.5, z1: B.z1 - 0.3, y: B.floorY });
  tallGrass.push({ x0: B.x1 - 3.4, x1: B.x1 - 0.3, z0: B.z0 + 6, z1: B.z0 + 10.5, y: B.floorY });

  // ------------------------------------------------------------ the sea wall and the yard
  const W = G.wall;
  solid(G.land.x0 - 3, -W.lowX, -4, W.top, W.z0, W.z1, m.stone, { tint: tint(0.8) });
  solid(W.lowX, G.land.x1 + 3, -4, W.top, W.z0, W.z1, m.stone, { tint: tint(0.8) });
  // Coping on the high wall, crenellated.
  for (let x = G.land.x0 - 2.5; x < G.land.x1 + 3; x += 1.6) {
    if (Math.abs(x) < W.lowX + 0.6) continue;
    solid(x - 0.45, x + 0.45, W.top, W.top + 0.45, W.z0 - 0.05, W.z1 + 0.05, m.stone, { tint: tint(0.7) });
  }
  // The fallen section: rubble on top, stones spilled into the playground.
  solid(-W.lowX, W.lowX, B.floorY - 1, W.lowTop - 0.2, W.z0, W.z1, m.stone, { tint: tint(0.75) });
  const lowWall2 = solid(-W.lowX, W.lowX, W.lowTop - 0.2, W.lowTop, W.z0 - 0.08, W.z1, m.stone, { tint: tint(0.6) })!;
  for (let i = 0; i < 9; i++) {
    const x = (rng() - 0.5) * 6;
    const z = B.z1 - 0.8 - rng() * 2.2;
    const s = 0.2 + rng() * 0.35;
    batch.add(boxProjectUVs(bushGeometry(500 + i, 2, true), 1.2), m.stone, trs(x, B.floorY, z, rng() * 6, 0, 0, s), { tint: tint(0.7) });
  }
  // Broken ends of the high wall at the gap.
  for (const s of [-1, 1]) {
    for (let k = 0; k < 4; k++) {
      const y = W.lowTop + 0.3 + k * 0.5;
      const w = 0.6 - k * 0.12;
      batch.add(worldBox(w, 0.5, W.z1 - W.z0, 3), m.stone, trs(s * (W.lowX + w / 2 - 0.05), y, (W.z0 + W.z1) / 2), { tint: tint(0.7) });
    }
  }
  // The yard: fuel drums, a hand crane, bollards; the causeway gate at the far end.
  for (let i = 0; i < 7; i++) {
    const x = -12 + rng() * 6;
    const z = 46 + rng() * 10;
    const tipped = rng() < 0.3;
    batch.add(new THREE.CylinderGeometry(0.3, 0.3, 0.88, 14), paint(['#7a2f22', '#3d5a6a', '#6a6a3a'][i % 3]), tipped ? trs(x, 0.3, z, rng() * 3, 0, Math.PI / 2) : trs(x, 0.44, z), { tint: tint(0.8) });
    if (!tipped) physics.cylinder(v3(x, 0.44, z), 0.44, 0.3);
  }
  for (let i = 0; i < 4; i++) {
    const x = G.yard.x1 - 0.6;
    const z = 45 + i * 4.5;
    batch.add(new THREE.CylinderGeometry(0.2, 0.26, 0.7, 10), iron, trs(x, 0.35, z));
    physics.cylinder(v3(x, 0.35, z), 0.35, 0.25);
  }
  solid(G.yard.x0, -2, 0, 3.0, G.yard.z1, G.yard.z1 + 0.5, m.stone, { tint: tint(0.8) });
  solid(2, G.yard.x1, 0, 3.0, G.yard.z1, G.yard.z1 + 0.5, m.stone, { tint: tint(0.8) });
  for (const s of [-1, 1]) solid(s * 2 - 0.3, s * 2 + 0.3, 0, 3.6, G.yard.z1 - 0.1, G.yard.z1 + 0.6, m.stone, { tint: tint(0.7) });
  // The causeway gate: iron bars (seen through), locked from the far side for now.
  for (let x = -1.7; x <= 1.71; x += 0.17) batch.add(new THREE.CylinderGeometry(0.02, 0.02, 2.6, 5), iron, trs(x, 1.3, G.yard.z1 + 0.25), { castShadow: false });
  fence(-2, 2, 0, 3, G.yard.z1, G.yard.z1 + 0.5);
  fence(G.yard.x0 - 4, G.yard.x0, 0, 3, G.wall.z1, G.yard.z1 + 0.5);
  fence(G.yard.x1, G.yard.x1 + 4, 0, 3, G.wall.z1, G.yard.z1 + 0.5);

  batch.build(root);
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.receiveShadow = true;
  });
  ctx.traversal.markClimbable(coveLedge);
  ctx.traversal.markClimbable(lowWall2);

  // ------------------------------------------------------------ grass, sea, distant things
  const grass = new GrassField({
    count: 9000,
    bounds: { x0: G.land.x0, x1: G.land.x1, z0: G.lane.z0, z1: G.yard.z1 },
    seed: 21,
    ground: (x, z) => {
      const y = groundY(x, z);
      if (y === null || y < -0.1) return null;
      if (Math.abs(x) < G.lane.x + 0.2 && z < G.lane.z1) return null;
      if (z > G.wall.z1 && x > G.yard.x0 && x < G.yard.x1) return null;
      return y;
    },
    height: [0.2, 0.5],
  });
  root.add(grass.mesh);
  // Tall grass: denser and taller where it hides Mara.
  const tall: GrassField[] = tallGrass.map(
    (t, i) =>
      new GrassField({
        count: Math.round((t.x1 - t.x0) * (t.z1 - t.z0) * 14),
        bounds: t,
        seed: 40 + i,
        ground: () => t.y,
        height: [0.9, 1.5],
        color: '#d8d0a0',
      }),
  );
  for (const t of tall) root.add(t.mesh);
  const sea = new Water({ radius: 900, y: G.seaY, deep: new THREE.Color('#163c4a'), moonDir: ctx.moonDir, fogDensity: 0, fogColor: Palette.fog, scale: 5, horizonFade: 700, skyMix: 0.75 });
  root.add(sea.mesh);
  // Breakwater across the water to the south-west: the fortress and its engine column.
  {
    const far = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: '#56606a', roughness: 1, fog: false, emissive: '#2a3640', emissiveIntensity: 0.5, flatShading: true });
    const block = (x: number, y: number, z: number, w: number, h: number, d: number) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      b.position.set(x, y, z);
      far.add(b);
    };
    block(0, 10, 0, 90, 26, 60);
    block(-30, 24, -10, 20, 18, 20);
    block(28, 20, 8, 16, 14, 16);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(8, 9, 50, 16), mat);
    col.position.set(4, 30, 0);
    far.add(col);
    // Lit windows.
    const lit = new THREE.MeshBasicMaterial({ color: '#ffb36a', fog: false });
    for (let i = 0; i < 40; i++) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.6), lit);
      w.position.set(-40 + rng() * 80, 4 + rng() * 18, 30.1);
      far.add(w);
    }
    far.position.set(-140, -6, -260);
    far.rotation.y = 0.5;
    root.add(far);
  }
  const lighthouseAt = v3(150, G.seaY, 70);

  return {
    root,
    tallGrass,
    coveLedge,
    lowWall: lowWall2,
    lighthouseAt,
    update(_dt, time, cameraPos) {
      grass.update(time);
      for (const t of tall) t.update(time);
      sea.update(time);
      sea.mesh.position.x = cameraPos.x;
      sea.mesh.position.z = cameraPos.z;
    },
  };
}
