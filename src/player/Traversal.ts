import * as THREE from 'three';
import type { GrindRail } from './GrindRail';
import { RAPIER, GROUND_QUERY_GROUPS, type Physics } from '../physics/Physics';
import { MOVEMENT, PLAYER_CENTER_OFFSET } from './movement';

/**
 * Ledge catches and vaults use explicit eligibility: only colliders a level registers as
 * climbable or vaultable qualify. Decorative pipes and arbitrary walls are never grabbed.
 */
export class TraversalSurfaces {
  readonly climbable = new Set<number>();
  readonly vaultable = new Set<number>();
  /** Pipes Mara can land on and grind along. */
  readonly rails: GrindRail[] = [];

  addRail(rail: GrindRail): void {
    this.rails.push(rail);
  }

  markClimbable(collider: RAPIER.Collider | null): void {
    if (collider) this.climbable.add(collider.handle);
  }

  markVaultable(collider: RAPIER.Collider | null): void {
    if (collider) this.vaultable.add(collider.handle);
  }
}

/** Documented reach ranges (feet-relative), used by the controller and by level design checks. */
export const TRAVERSAL = {
  /** A ledge top this far above the feet can be caught from a jump. */
  ledgeMin: 1.15,
  ledgeMax: 2.2,
  /** Feet hang this far below the ledge top. */
  hangDrop: 1.62,
  /** Horizontal reach to the wall when catching. */
  wallReach: 0.65,
  pullUpTime: 0.55,
  /** Vaultable obstacle height range and maximum depth. */
  vaultMin: 0.42,
  vaultMax: 1.15,
  vaultDepth: 0.9,
  vaultTime: 0.4,
  /** After dropping from a hang, the same ledge can't be re-caught for this long. */
  regrabDelay: 0.6,
};

export interface Ledge {
  collider: number;
  /** Outward wall normal (horizontal, unit). */
  normal: THREE.Vector3;
  topY: number;
  hangFeet: THREE.Vector3;
  standFeet: THREE.Vector3;
}

export interface Vault {
  collider: number;
  from: THREE.Vector3;
  apex: THREE.Vector3;
  to: THREE.Vector3;
}

const DOWN = { x: 0, y: -1, z: 0 };

/** Is the player's capsule free of solid geometry with its feet at `feet`? */
export function capsuleFree(physics: Physics, feet: THREE.Vector3, exclude: RAPIER.Collider): boolean {
  const shape = new RAPIER.Capsule(MOVEMENT.capsuleHalfHeight, MOVEMENT.capsuleRadius * 0.95);
  let hit = false;
  physics.world.intersectionsWithShape(
    { x: feet.x, y: feet.y + PLAYER_CENTER_OFFSET + 0.03, z: feet.z },
    { x: 0, y: 0, z: 0, w: 1 },
    shape,
    () => {
      hit = true;
      return false;
    },
    RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
    GROUND_QUERY_GROUPS,
    exclude,
  );
  return !hit;
}

/**
 * Look for a catchable ledge in direction `dir` from a player with feet at `feet`.
 * Rules: climbable collider; near-vertical wall within reach; a walkable top surface between
 * `ledgeMin` and `ledgeMax` above the feet; room to hang and room to stand on top.
 */
export function findLedge(physics: Physics, surfaces: TraversalSurfaces, feet: THREE.Vector3, dir: THREE.Vector3, exclude: RAPIER.Collider): Ledge | null {
  const d = new THREE.Vector3(dir.x, 0, dir.z);
  if (d.lengthSq() < 1e-4) return null;
  d.normalize();
  // Probe the wall at two heights: chest and above the head (catches tall and short ledges).
  for (const h of [1.25, 1.8]) {
    const origin = new THREE.Vector3(feet.x, feet.y + h, feet.z);
    const wall = physics.raycast(origin, d, MOVEMENT.capsuleRadius + TRAVERSAL.wallReach, GROUND_QUERY_GROUPS, exclude);
    if (!wall || !surfaces.climbable.has(wall.collider.handle)) continue;
    const n = wall.normal.clone().setY(0);
    if (n.lengthSq() < 0.5) continue; // not a wall
    n.normalize();
    const hit = origin.clone().addScaledVector(d, wall.distance);
    // An angled approach can meet the face right beside an obstruction (the hall wall at a
    // gantry's end, say). Slide along the same edge to the nearest spot with room to hang and to
    // stand, so a catch at an imperfect angle behaves like a square one.
    const alongFace = new THREE.Vector3(-n.z, 0, n.x);
    for (const slide of LEDGE_SLIDE) {
      const wallPoint = hit.clone().addScaledVector(alongFace, slide);
      // Find the top surface just behind the wall face.
      const above = new THREE.Vector3(wallPoint.x - n.x * 0.22, feet.y + TRAVERSAL.ledgeMax + 0.4, wallPoint.z - n.z * 0.22);
      const top = physics.raycast(above, DOWN, TRAVERSAL.ledgeMax + 0.4 - TRAVERSAL.ledgeMin + 0.3, GROUND_QUERY_GROUPS, exclude);
      if (!top || top.normal.y < 0.8 || top.collider.handle !== wall.collider.handle) continue;
      const topY = above.y - top.distance;
      const rel = topY - feet.y;
      if (rel < TRAVERSAL.ledgeMin || rel > TRAVERSAL.ledgeMax) continue;
      const hangFeet = new THREE.Vector3(wallPoint.x + n.x * (MOVEMENT.capsuleRadius + 0.06), topY - TRAVERSAL.hangDrop, wallPoint.z + n.z * (MOVEMENT.capsuleRadius + 0.06));
      const standFeet = new THREE.Vector3(wallPoint.x - n.x * (MOVEMENT.capsuleRadius + 0.25), topY + 0.02, wallPoint.z - n.z * (MOVEMENT.capsuleRadius + 0.25));
      if (!capsuleFree(physics, hangFeet, exclude) || !capsuleFree(physics, standFeet, exclude)) continue;
      return { collider: wall.collider.handle, normal: n, topY, hangFeet, standFeet };
    }
  }
  return null;
}

/** Offsets (metres along the ledge) tried when the point Mara reached has no room to hang or stand. */
const LEDGE_SLIDE = [0, -0.15, 0.15, -0.3, 0.3, -0.45, 0.45];

/**
 * Look for a low vaultable obstacle ahead. Rules: vaultable collider; top between `vaultMin` and
 * `vaultMax` above the feet; no deeper than `vaultDepth`; ground and room to land beyond it.
 */
export function findVault(physics: Physics, surfaces: TraversalSurfaces, feet: THREE.Vector3, dir: THREE.Vector3, exclude: RAPIER.Collider): Vault | null {
  const d = new THREE.Vector3(dir.x, 0, dir.z);
  if (d.lengthSq() < 1e-4) return null;
  d.normalize();
  const origin = new THREE.Vector3(feet.x, feet.y + 0.3, feet.z);
  const face = physics.raycast(origin, d, MOVEMENT.capsuleRadius + 0.75, GROUND_QUERY_GROUPS, exclude);
  if (!face || !surfaces.vaultable.has(face.collider.handle)) return null;
  const facePoint = origin.clone().addScaledVector(d, face.distance);
  const above = new THREE.Vector3(facePoint.x + d.x * 0.12, feet.y + TRAVERSAL.vaultMax + 0.3, facePoint.z + d.z * 0.12);
  const top = physics.raycast(above, DOWN, TRAVERSAL.vaultMax + 0.3, GROUND_QUERY_GROUPS, exclude);
  if (!top || top.normal.y < 0.7) return null;
  const topY = above.y - top.distance;
  const rel = topY - feet.y;
  if (rel < TRAVERSAL.vaultMin || rel > TRAVERSAL.vaultMax) return null;
  // Far face: cast back toward the obstacle from beyond it.
  const beyond = facePoint.clone().addScaledVector(d, TRAVERSAL.vaultDepth + 0.3);
  beyond.y = feet.y + 0.3;
  const back = physics.raycast(beyond, d.clone().negate(), TRAVERSAL.vaultDepth + 0.3, GROUND_QUERY_GROUPS, exclude);
  if (!back || back.collider.handle !== face.collider.handle) return null;
  const depth = TRAVERSAL.vaultDepth + 0.3 - back.distance;
  if (depth > TRAVERSAL.vaultDepth) return null;
  const farFace = beyond.clone().addScaledVector(d, -back.distance);
  const to = farFace.clone().addScaledVector(d, MOVEMENT.capsuleRadius + 0.35);
  const ground = physics.raycast(new THREE.Vector3(to.x, feet.y + 0.6, to.z), DOWN, 1.8, GROUND_QUERY_GROUPS, exclude);
  if (!ground || ground.normal.y < 0.8) return null;
  to.y = feet.y + 0.6 - ground.distance + 0.02;
  if (!capsuleFree(physics, to, exclude)) return null;
  const mid = facePoint.clone().lerp(farFace, 0.5);
  const apex = new THREE.Vector3(mid.x, topY + 0.32, mid.z);
  return { collider: face.collider.handle, from: feet.clone(), apex, to };
}
