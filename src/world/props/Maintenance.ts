import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Batcher } from '../geometry';
import { gearGeometry } from '../geometry';
import type { MaterialLibrary } from '../materials';
import { paintedTextTexture } from '../textures';
import { mulberry32 } from '../../core/math';

const UP = new THREE.Vector3(0, 1, 0);

/** Add a straight member (box section) between two local points. */
function strut(batch: Batcher, frame: THREE.Matrix4, a: THREE.Vector3, b: THREE.Vector3, t: number, mat: THREE.Material): void {
  const dir = b.clone().sub(a);
  const len = dir.length();
  const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize());
  const local = new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
  batch.add(new THREE.BoxGeometry(t, len, t), mat, frame.clone().multiply(local));
}

function place(batch: Batcher, frame: THREE.Matrix4, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rot = new THREE.Euler()): void {
  const local = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(rot), new THREE.Vector3(1, 1, 1));
  batch.add(geo, mat, frame.clone().multiply(local));
}

/**
 * A steel shelving rack loaded with engine spares: the tier-one obstacle that forces the climb.
 * Built in a local frame (x along the walkway, y up, z across it), origin at the floor centre,
 * filling exactly `size` so the existing collider still matches what the player sees.
 */
export function buildSparesRack(batch: Batcher, m: MaterialLibrary, frame: THREE.Matrix4, size: THREE.Vector3, parent: THREE.Object3D, seed = 9): void {
  const rng = mulberry32(seed);
  const W = size.x / 2;
  const D = size.z / 2;
  const H = size.y;
  const paint = (m.iron as THREE.MeshStandardMaterial).clone();
  paint.color.set('#6c7656');
  paint.roughness = 0.72;
  paint.metalness = 0.35;
  const shelves = [0.1, 1.05, 2.08, H - 0.06];

  // Uprights: six posts, slightly inset.
  for (const x of [-W + 0.04, W - 0.04]) for (const z of [-D + 0.04, 0, D - 0.04]) place(batch, frame, new THREE.BoxGeometry(0.075, H, 0.075), paint, x, H / 2, z);
  for (const y of shelves) {
    // Beams around each shelf and a grate deck.
    for (const z of [-D + 0.04, D - 0.04]) place(batch, frame, new THREE.BoxGeometry(2 * W, 0.1, 0.05), paint, 0, y, z);
    for (const x of [-W + 0.04, W - 0.04]) place(batch, frame, new THREE.BoxGeometry(0.05, 0.1, 2 * D), paint, x, y, 0);
    place(batch, frame, new THREE.BoxGeometry(2 * W - 0.1, 0.03, 2 * D - 0.1), m.grate, 0, y + 0.05, 0);
  }
  // Cross bracing on both ends of every bay, and a rear mesh panel.
  for (const x of [-W + 0.02, W - 0.02]) {
    for (let i = 0; i < shelves.length - 1; i++) {
      const y0 = shelves[i] + 0.06;
      const y1 = shelves[i + 1] - 0.06;
      strut(batch, frame, new THREE.Vector3(x, y0, -D + 0.06), new THREE.Vector3(x, y1, D - 0.06), 0.03, paint);
      strut(batch, frame, new THREE.Vector3(x, y0, D - 0.06), new THREE.Vector3(x, y1, -D + 0.06), 0.03, paint);
    }
  }
  place(batch, frame, new THREE.BoxGeometry(2 * W - 0.1, H - 0.2, 0.02), m.grate, 0, H / 2, -D + 0.02);

  // Bottom bay: crates and a coil of hose.
  place(batch, frame, new RoundedBoxGeometry(0.78, 0.72, 0.8, 1, 0.03), m.wood, -0.42, shelves[0] + 0.07 + 0.36, -0.42, new THREE.Euler(0, 0.06, 0));
  place(batch, frame, new RoundedBoxGeometry(0.7, 0.62, 0.72, 1, 0.03), m.wood, 0.4, shelves[0] + 0.07 + 0.31, 0.45, new THREE.Euler(0, -0.1, 0));
  for (let i = 0; i < 4; i++) place(batch, frame, new THREE.TorusGeometry(0.28, 0.035, 6, 18), m.ironDark, 0.42, shelves[0] + 0.11 + i * 0.07, -0.45, new THREE.Euler(Math.PI / 2, 0, rng()));

  // Middle bay: a bundle of spare pipe lengths and a valve wheel.
  const pipeMats = [m.brass, m.iron, m.copper, m.brass, m.iron, m.brass, m.ironDark];
  const rows = [
    [-0.3, -0.15, 0, 0.15, 0.3],
    [-0.22, -0.07, 0.08, 0.23],
    [-0.15, 0, 0.15],
  ];
  let n = 0;
  rows.forEach((row, r) =>
    row.forEach((z) => {
      const len = 2 * W - 0.2 - rng() * 0.25;
      place(batch, frame, new THREE.CylinderGeometry(0.068, 0.068, len, 10), pipeMats[n++ % pipeMats.length], (rng() - 0.5) * 0.1, shelves[1] + 0.12 + r * 0.125, z - 0.35, new THREE.Euler(0, 0, Math.PI / 2));
    }),
  );
  place(batch, frame, new THREE.TorusGeometry(0.26, 0.03, 6, 20), m.ironDark, 0.15, shelves[1] + 0.35, 0.55, new THREE.Euler(0.15, Math.PI / 2, 0));

  // Top bay: a spare piston sleeve and a crate of fittings.
  place(batch, frame, new THREE.CylinderGeometry(0.3, 0.3, 1.45, 18), m.brass, -0.05, shelves[2] + 0.38, -0.38, new THREE.Euler(0, 0, Math.PI / 2));
  for (const x of [-0.45, 0.4]) place(batch, frame, new THREE.TorusGeometry(0.31, 0.025, 6, 20), m.ironDark, x, shelves[2] + 0.38, -0.38, new THREE.Euler(0, Math.PI / 2, 0));
  place(batch, frame, new RoundedBoxGeometry(0.62, 0.5, 0.62, 1, 0.03), m.wood, 0.35, shelves[2] + 0.32, 0.5, new THREE.Euler(0, 0.2, 0));
  // On top: a spare gear segment lying flat, chained down.
  place(batch, frame, gearGeometry(0.62, 16, 0.07, 0.12), m.ironDark, -0.1, H + 0.04, 0.1, new THREE.Euler(-Math.PI / 2, 0, 0.3));

  // Stencilled tag on the approach end.
  const tag = new THREE.Mesh(
    new THREE.PlaneGeometry(0.8, 0.2),
    new THREE.MeshStandardMaterial({ map: paintedTextTexture('SPARES', { w: 512, h: 128, color: 'rgba(226,214,186,0.92)', seed: 4 }), transparent: true, roughness: 0.8 }),
  );
  tag.applyMatrix4(frame.clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(-W - 0.012, shelves[1] + 0.55, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -Math.PI / 2, 0)), new THREE.Vector3(1, 1, 1))));
  parent.add(tag);
}

/** Bracing and a toe board for a raised gantry (local frame as above, deck top at `top`). */
export function braceGantry(batch: Batcher, m: MaterialLibrary, frame: THREE.Matrix4, length: number, depth: number, top: number, legZ: number): void {
  const L = length / 2;
  const D = depth / 2;
  // Diagonal braces between the legs (which stand at `legZ`, on the walkway side of the deck).
  const legs = [-L + 0.1, 0, L - 0.1];
  for (let i = 0; i < legs.length - 1; i++) {
    strut(batch, frame, new THREE.Vector3(legs[i], 0.15, legZ), new THREE.Vector3(legs[i + 1], top - 0.4, legZ), 0.05, m.iron);
  }
  // Wall brackets under the back of the deck.
  for (const x of legs) strut(batch, frame, new THREE.Vector3(x, top - 1.1, D - 0.05), new THREE.Vector3(x, top - 0.32, D - 0.55), 0.06, m.ironDark);
  // Toe board along the back edge.
  place(batch, frame, new THREE.BoxGeometry(length, 0.12, 0.03), m.ironDark, 0, top + 0.06, D - 0.03);
}

let hazardTex: THREE.CanvasTexture | null = null;
/** Worn amber-and-black stripes: the route's marking for an edge Mara can use. */
export function hazardStripeTexture(): THREE.CanvasTexture {
  if (hazardTex) return hazardTex;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#1d1b18';
  g.fillRect(0, 0, 256, 64);
  g.fillStyle = '#c99a3c';
  for (let x = -64; x < 256 + 64; x += 64) {
    g.beginPath();
    g.moveTo(x, 64);
    g.lineTo(x + 32, 64);
    g.lineTo(x + 64, 0);
    g.lineTo(x + 32, 0);
    g.fill();
  }
  // Wear: scuffs where boots and hands land.
  const rng = mulberry32(31);
  for (let i = 0; i < 260; i++) {
    g.fillStyle = `rgba(60,58,54,${0.15 + rng() * 0.35})`;
    g.fillRect(rng() * 256, rng() * 64, 2 + rng() * 9, 1 + rng() * 3);
  }
  hazardTex = new THREE.CanvasTexture(c);
  hazardTex.colorSpace = THREE.SRGBColorSpace;
  hazardTex.wrapS = THREE.RepeatWrapping;
  hazardTex.anisotropy = 4;
  return hazardTex;
}

/**
 * A low steel barrier beam (the vault obstacle): bottom flange, web with stiffeners, and a striped
 * top cap where the hand lands. Local frame: x along the beam, origin on the floor at its centre.
 */
export function buildBarrierBeam(batch: Batcher, m: MaterialLibrary, frame: THREE.Matrix4, length: number, height: number, depth: number, parent: THREE.Object3D): void {
  place(batch, frame, new THREE.BoxGeometry(length, 0.05, depth + 0.04), m.ironDark, 0, 0.025, 0);
  place(batch, frame, new THREE.BoxGeometry(length, height - 0.1, 0.07), m.ironDark, 0, height / 2, 0);
  for (let x = -length / 2 + 0.2; x <= length / 2 - 0.15; x += 0.55) place(batch, frame, new THREE.BoxGeometry(0.035, height - 0.1, depth - 0.02), m.iron, x, height / 2, 0);
  const tex = hazardStripeTexture().clone();
  tex.needsUpdate = true;
  tex.repeat.set(length / 1.2, 1);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(length, 0.06, depth + 0.02), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.65, metalness: 0.2 }));
  cap.applyMatrix4(frame.clone().multiply(new THREE.Matrix4().makeTranslation(0, height - 0.03, 0)));
  cap.castShadow = cap.receiveShadow = true;
  parent.add(cap);
}
