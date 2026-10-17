import * as THREE from 'three';
import { worldBox, type Batcher } from '../geometry';
import type { Physics } from '../../physics/Physics';
import { mulberry32 } from '../../core/math';

/** Materials a cottage is built from (shared, batched). */
export interface CottageMaterials {
  wall: THREE.Material;
  roof: THREE.Material;
  trim: THREE.Material;
  glass: THREE.Material;
  door: THREE.Material;
  dark: THREE.Material;
}

export interface CottageSpec {
  /** Centre of the footprint at ground level, and the direction the front faces (yaw). */
  at: THREE.Vector3;
  facing: number;
  /** Width along the front, depth front to back, eaves height. */
  width: number;
  depth: number;
  eaves: number;
  seed: number;
  /** Where the door sits along the front (-1..1), and whether part of the roof has fallen in. */
  doorAt?: number;
  ruined?: boolean;
}

/**
 * A warder's cottage: rubble-stone walls, a slate gable roof with a chimney, a painted door, white
 * window frames over dark glass (some panes gone, some boarded). Solid: you cannot go in. Pieces go
 * to the batcher; colliders block Mara, the camera and the Watch's sight.
 */
export function buildCottage(batch: Batcher, physics: Physics, m: CottageMaterials, s: CottageSpec): void {
  const rng = mulberry32(s.seed);
  const base = new THREE.Matrix4().compose(s.at, new THREE.Quaternion().setFromAxisAngle(THREE.Object3D.DEFAULT_UP, s.facing), new THREE.Vector3(1, 1, 1));
  const place = (x: number, y: number, z: number, rotX = 0, rotY = 0, rotZ = 0) =>
    base.clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rotX, rotY, rotZ)), new THREE.Vector3(1, 1, 1)));
  const W = s.width;
  const D = s.depth;
  const H = s.eaves;
  const ridge = H + D * 0.42;
  const tint = (k = 1) => new THREE.Color(k * (0.92 + rng() * 0.12), k * (0.9 + rng() * 0.1), k * (0.88 + rng() * 0.1));

  // Walls (one box: you cannot go in), with a plinth of bigger stones.
  batch.add(worldBox(W, H, D, 3), m.wall, place(0, H / 2, 0), { tint: tint(), damp: true });
  batch.add(worldBox(W + 0.12, 0.45, D + 0.12, 3), m.wall, place(0, 0.22, 0), { tint: tint(0.8) });
  // Gable ends: triangles of wall up to the ridge.
  const gable = new THREE.BufferGeometry();
  {
    const hw = D / 2;
    const t = 0.2;
    const v = [
      // Two triangles (both faces) and a thin edge strip; extruded across x by `t`.
      [-t, 0, -hw], [-t, ridge - H, 0], [-t, 0, hw],
      [t, 0, hw], [t, ridge - H, 0], [t, 0, -hw],
    ];
    const pos = [...v[0], ...v[2], ...v[1], ...v[3], ...v[5], ...v[4]];
    gable.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    gable.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, D / 3, 0, D / 6, (ridge - H) / 3, 0, 0, D / 3, 0, D / 6, (ridge - H) / 3], 2));
    gable.computeVertexNormals();
  }
  for (const side of [-1, 1]) batch.add(gable, m.wall, place(side * (W / 2 - 0.2), H, 0), { tint: tint() });
  // Roof: two slate slabs from the eaves to the ridge, overhanging.
  const slope = Math.atan2(ridge - H, D / 2);
  const slabLen = Math.hypot(ridge - H, D / 2) + 0.45;
  const fallen = s.ruined ? Math.floor(rng() * 2) : -1;
  for (const side of [-1, 1]) {
    const cz = side * (D / 4 + 0.08);
    const cy = H + (ridge - H) / 2 + 0.12;
    if (side === (fallen === 0 ? -1 : 1) && s.ruined) {
      // A hole where the slates have gone: two part slabs and the rafters showing between them.
      for (const k of [-1, 1]) {
        batch.add(worldBox(W * 0.42, 0.14, slabLen, 3), m.roof, place(k * W * 0.3, cy, cz, side * slope, 0, 0), { tint: tint(0.9) });
      }
      for (let r = -2; r <= 2; r++) batch.add(worldBox(0.1, 0.12, slabLen - 0.2, 3), m.trim, place(r * 0.32, cy - 0.06, cz, side * slope, 0, 0), { tint: tint(0.5) });
    } else {
      batch.add(worldBox(W + 0.6, 0.14, slabLen, 3), m.roof, place(0, cy, cz, side * slope, 0, 0), { tint: tint(0.95) });
    }
  }
  // Ridge cap and chimney.
  batch.add(worldBox(W + 0.62, 0.16, 0.26, 3), m.roof, place(0, ridge + 0.14, 0), { tint: tint(0.7) });
  const chimX = (rng() < 0.5 ? -1 : 1) * (W / 2 - 0.5);
  batch.add(worldBox(0.75, 1.5, 0.6, 3), m.wall, place(chimX, ridge + 0.3, -0.1), { tint: tint(0.85) });
  batch.add(worldBox(0.85, 0.12, 0.7, 3), m.wall, place(chimX, ridge + 1.07, -0.1), { tint: tint(0.7) });
  for (const k of [-0.15, 0.15]) {
    const pot = new THREE.CylinderGeometry(0.1, 0.12, 0.35, 10);
    batch.add(pot, m.door, place(chimX + k, ridge + 1.3, -0.1), { tint: new THREE.Color('#b0654a') });
  }

  // The front: a painted door with a step and a lintel, windows either side.
  const fz = D / 2;
  const doorX = (s.doorAt ?? (rng() - 0.5) * 0.6) * (W / 2 - 1.1);
  batch.add(worldBox(1.25, 2.2, 0.12, 3), m.trim, place(doorX, 1.1, fz + 0.03), { tint: tint(0.95) });
  batch.add(worldBox(1.0, 2.0, 0.1, 3), m.door, place(doorX, 1.0, fz + 0.08), { tint: tint(1) });
  batch.add(worldBox(1.5, 0.22, 0.28, 3), m.wall, place(doorX, 2.25, fz + 0.1), { tint: tint(0.8) });
  batch.add(worldBox(1.4, 0.16, 0.6, 3), m.wall, place(doorX, 0.08, fz + 0.3), { tint: tint(0.75) });
  // Door knob and letterbox.
  batch.add(new THREE.SphereGeometry(0.05, 8, 6), m.dark, place(doorX + 0.36, 1.0, fz + 0.16));
  batch.add(worldBox(0.3, 0.06, 0.03, 3), m.dark, place(doorX, 1.25, fz + 0.14));
  const windowAt = (x: number, y: number, z: number, rotY: number, boarded: boolean) => {
    const w = 0.95;
    const h = 1.15;
    const p = (dx: number, dy: number, dz: number) => {
      const c = Math.cos(rotY);
      const sn = Math.sin(rotY);
      return place(x + dx * c + dz * sn, y + dy, z - dx * sn + dz * c, 0, rotY, 0);
    };
    batch.add(worldBox(w, h, 0.06, 3), m.glass, p(0, 0, 0.02));
    // Frame and glazing bars.
    for (const dy of [-h / 2, h / 2]) batch.add(worldBox(w + 0.16, 0.09, 0.1, 3), m.trim, p(0, dy, 0.06), { tint: tint() });
    for (const dx of [-w / 2, 0, w / 2]) batch.add(worldBox(0.08, h, 0.1, 3), m.trim, p(dx, 0, 0.06), { tint: tint() });
    batch.add(worldBox(w, 0.06, 0.08, 3), m.trim, p(0, 0, 0.06), { tint: tint() });
    batch.add(worldBox(w + 0.3, 0.1, 0.3, 3), m.wall, p(0, -h / 2 - 0.08, 0.12), { tint: tint(0.75) });
    if (boarded) {
      for (const dy of [0.25, -0.15, -0.4]) batch.add(worldBox(w + 0.25, 0.16, 0.04, 3), m.door, p(0, dy, 0.14), { tint: new THREE.Color(0.55, 0.47, 0.38) });
    }
  };
  for (const side of [-1, 1]) {
    const wx = doorX + side * 1.9;
    if (Math.abs(wx) < W / 2 - 0.7) windowAt(wx, 1.55, fz, 0, rng() < 0.3);
  }
  // A window at the back and on one gable.
  windowAt((rng() - 0.5) * (W - 2.4), 1.55, -D / 2, Math.PI, rng() < 0.4);

  // Colliders: the body and the roof (a convex prism), in world space.
  const q = new THREE.Quaternion().setFromAxisAngle(THREE.Object3D.DEFAULT_UP, s.facing);
  physics.box(new THREE.Vector3(0, H / 2, 0).applyQuaternion(q).add(s.at), new THREE.Vector3(W / 2, H / 2, D / 2), q);
  const roofPts: number[] = [];
  for (const x of [-W / 2 - 0.3, W / 2 + 0.3]) {
    for (const [y, z] of [
      [H - 0.05, -D / 2 - 0.3],
      [H - 0.05, D / 2 + 0.3],
      [ridge + 0.2, 0],
    ]) {
      const p = new THREE.Vector3(x, y, z).applyQuaternion(q).add(s.at);
      roofPts.push(p.x, p.y, p.z);
    }
  }
  physics.convex(roofPts);
}
