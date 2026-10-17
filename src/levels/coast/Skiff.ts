import * as THREE from 'three';
import type { InputFrame } from '../../core/Input';
import type { Physics } from '../../physics/Physics';
import { Layer, groups } from '../../physics/Physics';
import type { MaterialLibrary } from '../../world/materials';
import type { Ride, RideStep } from '../../player/PlayerController';
import { MOVEMENT } from '../../player/movement';

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Skiff handling. */
export const SKIFF = {
  maxSpeed: 7,
  accel: 3.2,
  drag: 1.6,
  /** Turn rate at speed (slower when nearly stopped). */
  turn: 1.9,
  /** How deep the hull sits: shallower water grounds it. */
  draft: 0.45,
  length: 3.4,
};

/**
 * A small steam skiff: a painted wooden hull, a brass boiler and funnel, a tiller. Mara sits in the
 * stern and steers toward where the stick points (relative to the camera); the stick's push is the
 * throttle. Too shallow under the bow (a sandbar, the bar at low water) or something solid ahead
 * (a rock, a pile, the stairs) and it stops with a thump. Jump leaps out.
 */
export class Skiff implements Ride {
  readonly pose = 'boat' as const;
  readonly group = new THREE.Group();
  /** Where it floats (x, z), its heading (forward = (sin, cos)) and speed. */
  readonly pos = new THREE.Vector3();
  heading = 0;
  speed = 0;
  throttle = 0;
  /** Seconds since it last ran aground or struck something (tests, hints). */
  sinceBump = 99;
  aground = false;
  bumps = 0;
  ridden = false;
  /** The sea level under it now (set by the level each step). */
  level = 0;
  onBump: ((kind: 'aground' | 'struck', at: THREE.Vector3) => void) | null = null;
  private time = 0;
  private readonly hull = new THREE.Group();
  readonly funnelTop = new THREE.Vector3();

  constructor(
    private readonly physics: Physics,
    m: MaterialLibrary,
    at: THREE.Vector3,
    heading: number,
  ) {
    this.pos.copy(at);
    this.heading = heading;
    const paint = new THREE.MeshStandardMaterial({ color: '#2f5f66', roughness: 0.7, map: m.wood.map });
    const trim = new THREE.MeshStandardMaterial({ color: '#b5442f', roughness: 0.7, map: m.wood.map });
    const inner = new THREE.MeshStandardMaterial({ color: '#8a6a48', roughness: 0.85, map: m.wood.map, side: THREE.DoubleSide });
    // The hull: half an ellipsoid, open at the top, a pointed bow.
    const hullGeo = new THREE.SphereGeometry(1, 28, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    const p = hullGeo.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i);
      // Sharpen the bow (+z).
      if (z > 0) p.setX(i, p.getX(i) * (1 - 0.55 * z * z));
    }
    hullGeo.computeVertexNormals();
    const hull = new THREE.Mesh(hullGeo, paint);
    hull.scale.set(0.82, 0.55, SKIFF.length / 2);
    const lining = new THREE.Mesh(hullGeo, inner);
    lining.scale.set(0.76, 0.5, SKIFF.length / 2 - 0.06);
    this.hull.add(hull, lining);
    // A red stripe along the gunwale.
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.035, 6, 48), trim);
    rim.rotation.x = Math.PI / 2;
    rim.scale.set(0.82, SKIFF.length / 2, 1);
    rim.position.y = 0.0;
    this.hull.add(rim);
    // Thwarts (seats), the boiler and funnel amidships, the tiller at the stern.
    for (const z of [-1.0, 0.4]) {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.06, 0.32), inner);
      seat.position.set(0, -0.08, z);
      this.hull.add(seat);
    }
    const boiler = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.55, 16), m.brass);
    boiler.position.set(0, -0.05, -0.15);
    const funnel = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.8, 10), m.ironDark);
    funnel.position.set(0, 0.55, -0.15);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.08, 0.08, 10), m.brass);
    cap.position.set(0, 0.97, -0.15);
    const tiller = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.8, 6), m.wood);
    tiller.rotation.x = Math.PI / 2 - 0.3;
    tiller.position.set(0, 0.1, -1.55);
    const rudder = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.35), paint);
    rudder.position.set(0, -0.25, -1.8);
    this.hull.add(boiler, funnel, cap, tiller, rudder);
    this.hull.traverse((o) => (o.castShadow = true));
    this.group.add(this.hull);
    this.group.name = 'skiff';
    this.place();
  }

  /** Back where it was moored (respawn, restart). */
  moor(at: THREE.Vector3, heading: number): void {
    this.pos.copy(at);
    this.heading = heading;
    this.speed = 0;
    this.throttle = 0;
    this.aground = false;
    this.place();
  }

  get forward(): THREE.Vector3 {
    return v3(Math.sin(this.heading), 0, Math.cos(this.heading));
  }

  /** Where Mara's feet are when she sits at the stern. */
  seatFeet(out = new THREE.Vector3()): THREE.Vector3 {
    const f = this.forward;
    return out.set(this.pos.x - f.x * 1.0, this.level + 0.22, this.pos.z - f.z * 1.0);
  }

  /** Is the water deep enough at `p`? A gentle bed there grounds the hull; anything steep is a strike. */
  private clear(p: THREE.Vector3): 'ok' | 'aground' | 'struck' {
    const down = this.physics.raycast({ x: p.x, y: this.level + 1, z: p.z }, { x: 0, y: -1, z: 0 }, 1 + SKIFF.draft, groups(Layer.CAMERA_QUERY, Layer.WORLD | Layer.NOCAM));
    if (!down) return 'ok';
    return down.normal.y < 0.6 ? 'struck' : 'aground';
  }

  /** The horizontal normal of whatever is ahead at the waterline, or null. */
  private obstacle(dir: THREE.Vector3, reach: number): THREE.Vector3 | null {
    const hit = this.physics.raycast({ x: this.pos.x, y: this.level + 0.25, z: this.pos.z }, dir, reach, groups(Layer.CAMERA_QUERY, Layer.WORLD | Layer.NOCAM));
    if (!hit) return null;
    const n = hit.normal.clone().setY(0);
    return n.lengthSq() > 1e-4 ? n.normalize() : dir.clone().negate();
  }

  /** One fixed step while drifting (nobody aboard) or ridden. */
  advance(dt: number, wishX: number, wishZ: number, throttle: number): void {
    this.time += dt;
    this.sinceBump += dt;
    this.throttle = throttle;
    if (throttle > 0.12) {
      const target = Math.atan2(wishX, wishZ);
      const diff = Math.atan2(Math.sin(target - this.heading), Math.cos(target - this.heading));
      // It comes round on the spot too (a little slower than under way).
      const rate = SKIFF.turn * (0.6 + 0.4 * Math.min(1, Math.abs(this.speed) / 3));
      this.heading += THREE.MathUtils.clamp(diff, -rate * dt, rate * dt);
      // Pointing well away from where it is going, it eases off while it comes round.
      const along = Math.max(0.15, Math.cos(diff));
      this.speed += (throttle * along * SKIFF.maxSpeed - this.speed) * Math.min(1, SKIFF.accel * dt / Math.max(1, SKIFF.maxSpeed * 0.3));
    } else {
      this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), SKIFF.drag * dt);
    }
    const f = this.forward;
    const sgn = Math.sign(this.speed || 1);
    const dir = f.clone().multiplyScalar(sgn);
    const next = this.pos.clone().addScaledVector(f, this.speed * dt);
    const bow = next.clone().addScaledVector(dir, SKIFF.length * 0.5);
    let hit: 'ok' | 'aground' | 'struck' = this.clear(bow);
    // Something solid at the waterline ahead (stairs, piles, rock faces, buoys).
    const wall = this.obstacle(dir, SKIFF.length * 0.5 + Math.abs(this.speed) * dt + 0.1);
    if (hit === 'ok' && wall) hit = 'struck';
    this.aground = hit === 'aground';
    if (hit !== 'ok') {
      if (Math.abs(this.speed) > 0.6 && this.sinceBump > 0.6) {
        this.bumps++;
        this.sinceBump = 0;
        this.onBump?.(hit, bow);
      }
      if (hit === 'struck' && wall) {
        // Glance off: keep the part of the motion along the obstacle and turn the bow that way.
        const t = dir.clone().addScaledVector(wall, -dir.dot(wall));
        if (t.lengthSq() > 1e-4) {
          t.normalize();
          const slide = this.pos.clone().addScaledVector(t, Math.abs(this.speed) * 0.5 * dt);
          if (this.clear(slide.clone().addScaledVector(t, SKIFF.length * 0.5)) === 'ok' && !this.obstacle(t, SKIFF.length * 0.5)) this.pos.copy(slide);
          const want = Math.atan2(t.x * sgn, t.z * sgn);
          this.heading += THREE.MathUtils.clamp(Math.atan2(Math.sin(want - this.heading), Math.cos(want - this.heading)), -1.2 * dt, 1.2 * dt);
        }
        this.speed *= 0.5;
      } else {
        this.speed = -this.speed * 0.25;
      }
    } else {
      this.pos.copy(next);
    }
    this.place();
  }

  /** Ride: the stick steers (relative to the camera) and is the throttle; Jump leaps out. */
  step(dt: number, input: InputFrame, cameraYaw: number): RideStep {
    const fx = -Math.sin(cameraYaw);
    const fz = -Math.cos(cameraYaw);
    const rx = Math.cos(cameraYaw);
    const rz = -Math.sin(cameraYaw);
    const wx = fx * input.moveY + rx * input.moveX;
    const wz = fz * input.moveY + rz * input.moveX;
    const mag = Math.min(1, Math.hypot(wx, wz));
    this.advance(dt, wx, wz, mag);
    const feet = this.seatFeet();
    if (input.jumpPressed) {
      this.ridden = false;
      const f = this.forward;
      return { feet, facing: this.heading, release: v3(f.x * this.speed * 0.6, Math.sqrt(2 * MOVEMENT.gravity * 1.3), f.z * this.speed * 0.6), jumped: true };
    }
    return { feet, facing: this.heading };
  }

  cancel(): void {
    this.ridden = false;
  }

  private place(): void {
    // It floats high: most of the hull shows above the (opaque) water.
    this.group.position.set(this.pos.x, this.level + 0.34, this.pos.z);
    this.group.rotation.set(0, this.heading, 0);
    // Bobbing, and the bow lifting with speed.
    this.hull.rotation.x = -Math.min(0.12, Math.abs(this.speed) * 0.016) + Math.sin(this.time * 1.7) * 0.025;
    this.hull.rotation.z = Math.sin(this.time * 1.3 + 1) * 0.035;
    this.hull.position.y = Math.sin(this.time * 2.1) * 0.03;
    this.group.updateMatrixWorld(true);
    this.funnelTop.set(0, 1.05, -0.15).applyMatrix4(this.group.matrixWorld);
  }
}
