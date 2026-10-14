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
} as const;

export const groups = (membership: number, filter: number): number =>
  ((membership & 0xffff) << 16) | (filter & 0xffff);

export const PLAYER_GROUPS = groups(Layer.PLAYER, Layer.WORLD | Layer.NOCAM | Layer.PROP);
export const CAMERA_QUERY_GROUPS = groups(Layer.CAMERA_QUERY, Layer.WORLD);
export const GROUND_QUERY_GROUPS = groups(Layer.PLAYER, Layer.WORLD | Layer.NOCAM | Layer.PROP);

export interface ColliderOptions {
  /** Defaults to true. Set false for bars and railings so the camera can see through them. */
  blocksCamera?: boolean;
  friction?: number;
}

const tmpQuat = new THREE.Quaternion();

/** Thin wrapper around the Rapier world with level-building helpers. */
export class Physics {
  readonly world: RAPIER.World;

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
    const membership = blocksCamera ? Layer.WORLD : Layer.NOCAM;
    const filter = Layer.PLAYER | Layer.PROP | (blocksCamera ? Layer.CAMERA_QUERY : 0);
    desc.setCollisionGroups(groups(membership, filter));
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
  sphereCastDistance(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number, radius: number, exclude?: RAPIER.Collider): number {
    const shape = new RAPIER.Ball(radius);
    const hit = this.world.castShape(
      origin,
      { x: 0, y: 0, z: 0, w: 1 },
      dir,
      shape,
      0,
      maxDist,
      true,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      CAMERA_QUERY_GROUPS,
      exclude,
    );
    return hit ? hit.time_of_impact : maxDist;
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
