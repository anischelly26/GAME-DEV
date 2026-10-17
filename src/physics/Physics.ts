import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

export { RAPIER };

/** Collision layers (membership bits). */
export const Layer = {
  /** Solid level geometry: blocks the player and the camera. */
  WORLD: 0x0001,
  PLAYER: 0x0002,
  /** Thin geometry (bars, railings, chains) that blocks the player but not the camera. */
  NOCAM: 0x0004,
  PROP: 0x0008,
  CAMERA_QUERY: 0x0010,
  /** Blocks only the camera: large visual machinery the player never touches (the flywheels). */
  CAMONLY: 0x0020,
} as const;

export const groups = (membership: number, filter: number): number =>
  ((membership & 0xffff) << 16) | (filter & 0xffff);

export const PLAYER_GROUPS = groups(Layer.PLAYER, Layer.WORLD | Layer.NOCAM | Layer.PROP);
export const CAMERA_QUERY_GROUPS = groups(Layer.CAMERA_QUERY, Layer.WORLD | Layer.CAMONLY);
export const GROUND_QUERY_GROUPS = groups(Layer.PLAYER, Layer.WORLD | Layer.NOCAM | Layer.PROP);

export interface ColliderOptions {
  /** Defaults to true. Set false for bars and railings so the camera can see through them. */
  blocksCamera?: boolean;
  /** Defaults to true. Set false for camera-only blockers (visual machinery out of the player's way). */
  blocksPlayer?: boolean;
  friction?: number;
}

const tmpQuat = new THREE.Quaternion();

/** What a walkable surface sounds like underfoot (`water`: wading in shallow water). */
export type Surface = 'stone' | 'metal' | 'wood' | 'grass' | 'gravel' | 'sand' | 'water';

/** Thin wrapper around the Rapier world with level-building helpers. */
export class Physics {
  readonly world: RAPIER.World;
  /** Surface of each collider (footsteps, landings); unlisted colliders are stone. */
  private readonly surfaces = new Map<number, Surface>();

  setSurface(collider: RAPIER.Collider | null | undefined, surface: Surface): void {
    if (collider) this.surfaces.set(collider.handle, surface);
  }

  surfaceOf(handle: number | null | undefined): Surface {
    return this.taggedSurface(handle) ?? 'stone';
  }

  /** The surface a collider was tagged with, or undefined (the level may know better). */
  taggedSurface(handle: number | null | undefined): Surface | undefined {
    return handle !== null && handle !== undefined ? this.surfaces.get(handle) : undefined;
  }

  static async create(): Promise<Physics> {
    await RAPIER.init();
    return new Physics();
  }

  private constructor() {
    this.world = new RAPIER.World({ x: 0, y: -20, z: 0 });
    this.world.timestep = 1 / 60;
  }

  private finish(desc: RAPIER.ColliderDesc, opts: ColliderOptions = {}, body?: RAPIER.RigidBody): RAPIER.Collider {
    const blocksCamera = opts.blocksCamera ?? true;
    if (opts.blocksPlayer === false) {
      desc.setCollisionGroups(groups(Layer.CAMONLY, Layer.CAMERA_QUERY));
    } else {
      const membership = blocksCamera ? Layer.WORLD : Layer.NOCAM;
      const filter = Layer.PLAYER | Layer.PROP | (blocksCamera ? Layer.CAMERA_QUERY : 0);
      desc.setCollisionGroups(groups(membership, filter));
    }
    desc.setFriction(opts.friction ?? 0.6);
    return this.world.createCollider(desc, body);
  }

  /** Static box. `rotationY` is a rotation around the vertical axis in radians. */
  box(center: THREE.Vector3Like, half: THREE.Vector3Like, rotation?: THREE.Quaternion | number, opts?: ColliderOptions): RAPIER.Collider {
    const desc = RAPIER.ColliderDesc.cuboid(half.x, half.y, half.z).setTranslation(center.x, center.y, center.z);
    if (rotation !== undefined) {
      const q = typeof rotation === 'number' ? tmpQuat.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rotation) : rotation;
      desc.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    }
    return this.finish(desc, opts);
  }

  cylinder(center: THREE.Vector3Like, halfHeight: number, radius: number, opts?: ColliderOptions): RAPIER.Collider {
    const desc = RAPIER.ColliderDesc.cylinder(halfHeight, radius).setTranslation(center.x, center.y, center.z);
    return this.finish(desc, opts);
  }

  /** Convex hull around a set of world-space points. */
  convex(points: ArrayLike<number>, opts?: ColliderOptions): RAPIER.Collider | null {
    const desc = RAPIER.ColliderDesc.convexHull(new Float32Array(points));
    return desc ? this.finish(desc, opts) : null;
  }

  /** Vertical prism from a convex polygon given as [x, z] pairs. */
  prism(polygonXZ: Array<[number, number]>, y0: number, y1: number, opts?: ColliderOptions): RAPIER.Collider | null {
    const pts: number[] = [];
    for (const [x, z] of polygonXZ) pts.push(x, y0, z, x, y1, z);
    return this.convex(pts, opts);
  }

  /** Kinematic body (moving platforms, gates). Colliders attach via `attach`. */
  kinematic(position: THREE.Vector3Like): RAPIER.RigidBody {
    const desc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(position.x, position.y, position.z);
    return this.world.createRigidBody(desc);
  }

  attach(body: RAPIER.RigidBody, desc: RAPIER.ColliderDesc, opts?: ColliderOptions): RAPIER.Collider {
    return this.finish(desc, opts, body);
  }

  /** Body-less (fixed) collider from a description; moving platforms reposition these each step. */
  fixed(desc: RAPIER.ColliderDesc, opts?: ColliderOptions): RAPIER.Collider {
    return this.finish(desc, opts);
  }

  remove(collider: RAPIER.Collider): void {
    this.world.removeCollider(collider, false);
  }

  step(): void {
    this.world.step();
  }

  /**
   * Sphere sweep used by the camera. Returns the free distance along `dir` (unit vector) up to `maxDist`.
   */
  /**
   * Distance a sphere can travel from `origin` along `dir` before touching camera-blocking geometry.
   * A sphere that starts against a surface and moves away from it is not stopped by it (otherwise
   * the camera arm collapsed whenever Mara stood against a wall: hanging on a ledge, in the hatch).
   */
  sphereCastDistance(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number, radius: number, exclude?: RAPIER.Collider): number {
    const shape = new RAPIER.Ball(radius);
    const hit = this.world.castShape(
      origin,
      { x: 0, y: 0, z: 0, w: 1 },
      dir,
      shape,
      0,
      maxDist,
      false,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      CAMERA_QUERY_GROUPS,
      exclude,
    );
    return hit ? hit.time_of_impact : maxDist;
  }

  /** Dev: what a camera sphere cast hits (collider centre and size), for diagnosing framing. */
  debugSphereCast(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number, radius: number, exclude?: RAPIER.Collider): { toi: number; centre: number[]; half: number[] | null } | null {
    const hit = this.world.castShape(origin, { x: 0, y: 0, z: 0, w: 1 }, dir, new RAPIER.Ball(radius), 0, maxDist, false, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, CAMERA_QUERY_GROUPS, exclude);
    if (!hit) return null;
    const t = hit.collider.translation();
    const shape = hit.collider.shape as RAPIER.Cuboid;
    return { toi: hit.time_of_impact, centre: [t.x, t.y, t.z], half: shape.halfExtents ? [shape.halfExtents.x, shape.halfExtents.y, shape.halfExtents.z] : null };
  }

  raycast(origin: THREE.Vector3Like, dir: THREE.Vector3Like, maxDist: number, filterGroups: number, exclude?: RAPIER.Collider): { distance: number; collider: RAPIER.Collider; normal: THREE.Vector3 } | null {
    const ray = new RAPIER.Ray(origin, dir);
    const hit = this.world.castRayAndGetNormal(ray, maxDist, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, filterGroups, exclude);
    if (!hit) return null;
    return { distance: hit.timeOfImpact, collider: hit.collider, normal: new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z) };
  }

  /** Debug line segments for the physics overlay. */
  debugLines(): { vertices: Float32Array; colors: Float32Array } {
    return this.world.debugRender();
  }
}
