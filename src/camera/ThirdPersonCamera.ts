import * as THREE from 'three';
import type { Physics, RAPIER } from '../physics/Physics';
import { clamp, damp, dampAngle, lerp, smoothstep } from '../core/math';
import type { LookDelta } from '../core/Input';

/** A region that changes how the camera frames the player (tight in the cell, wide over the Well). */
export interface CameraZone {
  id: string;
  contains(p: THREE.Vector3): boolean;
  distance: number;
  /** Focus height above the feet. */
  height: number;
  fov?: number;
  priority?: number;
}

export const CAMERA_DEFAULTS = { distance: 4.9, height: 1.5, fov: 60 };

interface Shot {
  fromPos: THREE.Vector3;
  fromLook: THREE.Vector3;
  pos: THREE.Vector3;
  look: THREE.Vector3;
  t: number;
  duration: number;
}

const PROBE_RADIUS = 0.24;

export class ThirdPersonCamera {
  readonly camera: THREE.PerspectiveCamera;
  yaw = 0;
  pitch = 0.32;
  readonly zones: CameraZone[] = [];

  private readonly focus = new THREE.Vector3();
  private currentDist = CAMERA_DEFAULTS.distance;
  private zoneDist = CAMERA_DEFAULTS.distance;
  private zoneHeight = CAMERA_DEFAULTS.height;
  private zoneFov = CAMERA_DEFAULTS.fov;
  private initialised = false;
  private shot: Shot | null = null;
  private readonly lookPoint = new THREE.Vector3();
  private recenterTarget: number | null = null;
  /** 0..1, how much walls have pulled the camera in (smoothed). */
  private pullIn = 0;
  /** Seconds since the player last turned the camera (mouse or stick). */
  private sinceLook = 10;
  /** Seconds the player has been on the ground (0 while airborne, hanging or climbing). */
  private groundedFor = 0;
  private readonly prevFeet = new THREE.Vector3();
  private readonly velocity = new THREE.Vector3();
  private readonly lookAhead = new THREE.Vector3();
  activeZone = 'default';

  constructor(
    private readonly physics: Physics,
    private readonly exclude: RAPIER.Collider,
  ) {
    this.camera = new THREE.PerspectiveCamera(CAMERA_DEFAULTS.fov, 16 / 9, 0.05, 900);
  }

  /** Place the camera behind a yaw (used on spawn/respawn). */
  snapBehind(feet: THREE.Vector3, facing: number, pitch = 0.3, yaw?: number): void {
    this.yaw = yaw ?? facing + Math.PI;
    this.pitch = pitch;
    this.focus.set(feet.x, feet.y + this.zoneHeight, feet.z);
    this.initialised = false;
  }

  /** Smoothly swing the camera behind the given facing. */
  recenter(facing: number): void {
    this.recenterTarget = facing + Math.PI;
  }

  /** Cinematic shot. The camera eases from its current pose to the shot over `duration`. */
  playShot(pos: THREE.Vector3, look: THREE.Vector3, duration: number): void {
    this.shot = {
      fromPos: this.camera.position.clone(),
      fromLook: this.lookPoint.clone(),
      pos: pos.clone(),
      look: look.clone(),
      t: 0,
      duration: Math.max(0.001, duration),
    };
  }

  clearShot(): void {
    this.shot = null;
    this.initialised = false;
  }

  get inShot(): boolean {
    return this.shot !== null;
  }

  /** Distance from the camera to the player's focus point (used to fade the avatar). */
  get distance(): number {
    return this.currentDist;
  }

  /** Pitch limits in radians: looking up from below (negative) to looking down from above. */
  static readonly PITCH_MIN = -0.6;
  static readonly PITCH_MAX = 1.2;

  /** `look` is already in radians (Input applies sensitivity and invert exactly once). */
  update(dt: number, look: LookDelta, feet: THREE.Vector3, grounded: boolean, speed: number): void {
    if (this.shot) {
      const s = this.shot;
      s.t = Math.min(s.duration, s.t + dt);
      const k = smoothstep(0, 1, s.t / s.duration);
      this.camera.position.lerpVectors(s.fromPos, s.pos, k);
      this.lookPoint.lerpVectors(s.fromLook, s.look, k);
      this.camera.lookAt(this.lookPoint);
      return;
    }

    if (look.yaw !== 0 || look.pitch !== 0) {
      this.recenterTarget = null;
      this.sinceLook = 0;
    } else this.sinceLook += dt;
    this.yaw -= look.yaw;
    this.pitch = clamp(this.pitch + look.pitch, ThirdPersonCamera.PITCH_MIN, ThirdPersonCamera.PITCH_MAX);
    if (this.recenterTarget !== null) {
      this.yaw = dampAngle(this.yaw, this.recenterTarget, 10, dt);
      if (Math.abs(this.yaw - this.recenterTarget) < 0.01) this.recenterTarget = null;
    }

    // Horizontal velocity of the player (from the feet), for lazy follow and look-ahead.
    if (this.initialised && dt > 0) {
      this.velocity.set((feet.x - this.prevFeet.x) / dt, 0, (feet.z - this.prevFeet.z) / dt);
      if (this.velocity.lengthSq() > 400) this.velocity.set(0, 0, 0); // teleports
    }
    this.prevFeet.copy(feet);
    const v = this.velocity.length();

    // Lazy follow: when the player hasn't touched the camera for a moment, drift around behind the
    // direction of travel, slowly and never when running toward the camera (that would spin it).
    // Only on the ground: movement is camera-relative, so turning the camera during a jump, hang or
    // climb would bend the direction of a held key mid-air.
    this.groundedFor = grounded ? this.groundedFor + dt : 0;
    if (this.recenterTarget === null && this.sinceLook > 1.0 && v > 1.2 && this.groundedFor > 0.3) {
      const behind = Math.atan2(-this.velocity.x, -this.velocity.z);
      const diff = Math.atan2(Math.sin(behind - this.yaw), Math.cos(behind - this.yaw));
      if (Math.abs(diff) < 2.4) this.yaw = dampAngle(this.yaw, this.yaw + diff, 0.9 * clamp((v - 1.2) / 4, 0, 1) * clamp((this.sinceLook - 1) / 0.8, 0, 1), dt);
    }

    // Zone selection (highest priority wins).
    let zone: CameraZone | null = null;
    for (const z of this.zones) {
      if (z.contains(feet) && (!zone || (z.priority ?? 0) > (zone.priority ?? 0))) zone = z;
    }
    this.activeZone = zone?.id ?? 'default';
    const zl = this.initialised ? 3 : 1000;
    this.zoneDist = damp(this.zoneDist, zone?.distance ?? CAMERA_DEFAULTS.distance, zl, dt);
    this.zoneHeight = damp(this.zoneHeight, zone?.height ?? CAMERA_DEFAULTS.height, zl, dt);
    this.zoneFov = damp(this.zoneFov, zone?.fov ?? CAMERA_DEFAULTS.fov, zl, dt);

    // Focus follows tightly in the horizontal plane; vertically it holds steady during jumps so
    // platforming is readable, but follows quickly when falling.
    const targetY = feet.y + this.zoneHeight;
    if (!this.initialised) {
      this.focus.set(feet.x, targetY, feet.z);
      this.currentDist = this.zoneDist;
    } else {
      this.focus.x = damp(this.focus.x, feet.x, 20, dt);
      this.focus.z = damp(this.focus.z, feet.z, 20, dt);
      let lambda = 9;
      if (!grounded) lambda = targetY > this.focus.y ? 2.2 : 11;
      this.focus.y = damp(this.focus.y, targetY, lambda, dt);
      this.focus.y = clamp(this.focus.y, targetY - 1.0, targetY + 1.2);
    }

    // When a wall pulls the camera in, tilt it up over the shoulder so the player doesn't fill the frame.
    const pitch = Math.min(1.25, this.pitch + this.pullIn * 0.45);
    const cp = Math.cos(pitch);
    const dir = new THREE.Vector3(Math.sin(this.yaw) * cp, Math.sin(pitch), Math.cos(this.yaw) * cp);
    const free = this.physics.sphereCastDistance(this.focus, dir, this.zoneDist + 0.3, PROBE_RADIUS, this.exclude);
    const targetDist = clamp(free - 0.08, 0.3, this.zoneDist);
    // Pull in quickly when something blocks the view (no hard snap unless it is very close), ease out.
    if (!this.initialised || targetDist < this.currentDist - 0.8) this.currentDist = targetDist;
    else if (targetDist < this.currentDist) this.currentDist = damp(this.currentDist, targetDist, 22, dt);
    else this.currentDist = damp(this.currentDist, targetDist, 3.2, dt);
    this.pullIn = damp(this.pullIn, clamp(1 - this.currentDist / Math.max(0.5, this.zoneDist), 0, 1), 5, dt);
    this.initialised = true;

    this.camera.position.copy(this.focus).addScaledVector(dir, this.currentDist);
    // Aim a little ahead of the direction of travel so the next landing is in view.
    const ahead = this.velocity.clone().multiplyScalar(clamp(v / 5, 0, 1) * 0.12);
    this.lookAhead.lerp(ahead, 1 - Math.exp(-4 * dt));
    this.lookPoint.copy(this.focus).add(this.lookAhead);
    this.camera.lookAt(this.lookPoint);

    const fov = this.zoneFov + clamp(speed / 6, 0, 1) * 3;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = lerp(this.camera.fov, fov, 1 - Math.exp(-6 * dt));
      this.camera.updateProjectionMatrix();
    }
  }
}
