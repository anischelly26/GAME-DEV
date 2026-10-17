import * as THREE from 'three';
import type { Physics, RAPIER } from '../physics/Physics';
import { clamp, damp, dampAngle, lerp, smoothstep } from '../core/math';
import type { LookDelta } from '../core/Input';

/** A region that changes how the camera frames the player (tight in the cell, wide over the hall). */
export interface CameraZone {
  id: string;
  contains(p: THREE.Vector3): boolean;
  distance: number;
  /** Pivot height above the feet. */
  height: number;
  /** Vertical field of view in degrees at the default setting; the player's FOV setting offsets it. */
  fov?: number;
  priority?: number;
}

export type CameraAssist = 'off' | 'weak' | 'strong';

/** Player-facing camera options (pause menu). */
export interface CameraSettings {
  assist: CameraAssist;
  shake: boolean;
  /** Horizontal field of view in degrees at 16:9 (70-110). */
  fovHorizontal: number;
}

/** What the camera needs to know about the player each frame. */
export interface CameraContext {
  grounded: boolean;
  speed: number;
  /** Controller mode: anything but 'move' is a traversal move (hang, climb, vault). */
  mode: string;
  /** The player is locked into an interaction (pulling a lever, reading a diagram). */
  interacting: boolean;
  /** How much the movement stick points forward relative to the camera: -1..1, 0 with no input. */
  forwardInput: number;
  /** Vertical speed (m/s, + up): a long fall lowers the aim to show the landing. */
  verticalSpeed?: number;
  /** What she rides in mode 'ride' (swing, slide, ladder, boat): some get their own framing. */
  ridePose?: string;
}

export const CAMERA_DEFAULTS = { distance: 4.9, height: 1.5, fov: 60, fovHorizontal: 90 };

/**
 * Auto-chase rates (per second) and how long the player must leave the camera alone first.
 * 'off' never turns the camera by itself.
 */
const ASSIST: Record<CameraAssist, { rate: number; after: number } | null> = {
  off: null,
  weak: { rate: 0.9, after: 1.5 },
  strong: { rate: 2.2, after: 0.8 },
};

interface Shot {
  fromPos: THREE.Vector3;
  fromLook: THREE.Vector3;
  pos: THREE.Vector3;
  look: THREE.Vector3;
  t: number;
  duration: number;
  /** Lens for the shot (vertical degrees), eased from the current one; undefined keeps it. */
  fromFov: number;
  fov?: number;
}

/** Radius of the spring arm's collision probe: wider than the near plane, so walls never clip. */
const PROBE_RADIUS = 0.26;
/** Closest the arm may get to the pivot. */
const MIN_ARM = 0.35;
/** The view aims this far above the pivot (scaled with the arm), so Mara sits low in the frame. */
const FRAME_LIFT = 0.42;
/** On a long fall the aim sinks by up to this much (m), so the landing comes into view in time. */
const FALL_LOOK = 1.1;

/**
 * Framing per traversal mode (or ride pose), added to the zone's distance (m), pivot height (m) and
 * field of view (degrees). Grinding stands back to show the drop; swimming sits low and close, the
 * waterline in the lower third; the swing stands back to show its whole arc and where the leap
 * lands; the slide stands back at speed. docs/MOVEMENT_2_0.md, B5.
 */
export const MODE_FRAMING: Record<string, { distance: number; height: number; fov: number }> = {
  grind: { distance: 1.2, height: 0.4, fov: 6 },
  swim: { distance: -0.6, height: -0.45, fov: 0 },
  swing: { distance: 1.3, height: 0.5, fov: 5 },
  slide: { distance: 0.8, height: 0.3, fov: 5 },
};

/**
 * Third-person orbit camera on a spring arm.
 *
 * - **Authority.** Mouse and right-stick look are applied directly every frame (already in radians,
 *   see Input), with no smoothing, and cancel any recenter or assist immediately.
 * - **Assist (auto-chase).** Only on the ground for 0.3 s, in normal movement, with the stick pushed
 *   forward, not interacting, not inside a precision volume, and only after the player has left
 *   the camera alone for a moment. Never in the air, while hanging, climbing or vaulting, or in a
 *   cinematic: movement is camera-relative, so turning the camera then would bend a held key.
 * - **Spring arm.** A sphere cast from the pivot toward the camera. The arm shortens at once when
 *   something is in the way (the camera never passes through geometry) and eases back out.
 * - **Framing.** The pivot is at chest height; the view aims above it and slightly ahead of the
 *   direction of travel, so Mara sits low in the frame with the route above and ahead of her.
 */
export class ThirdPersonCamera {
  readonly camera: THREE.PerspectiveCamera;
  yaw = 0;
  pitch = 0.32;
  readonly zones: CameraZone[] = [];
  /** Volumes around jumps, vaults and ledges where the assist never turns the camera. */
  readonly precision: Array<(p: THREE.Vector3) => boolean> = [];
  readonly settings: CameraSettings = { assist: 'weak', shake: true, fovHorizontal: CAMERA_DEFAULTS.fovHorizontal };
  /** Added to every zone's pivot height: the zones are set for a 1.7 m figure (the toy hero is shorter). */
  pivotOffset = 0;

  private readonly focus = new THREE.Vector3();
  private currentDist = CAMERA_DEFAULTS.distance;
  private zoneDist = CAMERA_DEFAULTS.distance;
  private zoneHeight = CAMERA_DEFAULTS.height;
  private zoneFov = CAMERA_DEFAULTS.fov;
  private initialised = false;
  private shot: Shot | null = null;
  private readonly lookPoint = new THREE.Vector3();
  private recenterTarget: number | null = null;
  /** Seconds since the player last turned the camera (mouse or stick). */
  private sinceLook = 10;
  /** Seconds the player has been on the ground in normal movement (0 in the air or traversing). */
  private groundedFor = 0;
  private readonly prevFeet = new THREE.Vector3();
  private readonly velocity = new THREE.Vector3();
  private readonly lookAhead = new THREE.Vector3();
  private trauma = 0;
  private fovKick = 0;
  /** How long she has been falling (s), and how far the aim has sunk for it (m). */
  private fallingFor = 0;
  private fallLook = 0;
  private time = 0;
  /** Whether the assist turned the camera on the last update (debug overlay, tests). */
  assisting = false;
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
    this.recenterTarget = null;
    this.focus.set(feet.x, feet.y + this.zoneHeight + this.pivotOffset, feet.z);
    this.initialised = false;
  }

  /** Smoothly swing the camera behind the given facing (C, middle mouse, stick click). */
  recenter(facing: number): void {
    this.recenterTarget = facing + Math.PI;
  }

  /**
   * Cinematic shot. The camera eases from its current pose to the shot over `duration`; with
   * `from` it cuts to that pose first (a cut and a slow dolly in one call). `fov` sets the lens
   * (vertical degrees) for the shot.
   */
  playShot(pos: THREE.Vector3, look: THREE.Vector3, duration: number, opts: { from?: { pos: THREE.Vector3; look: THREE.Vector3 }; fov?: number } = {}): void {
    this.shot = {
      fromPos: (opts.from?.pos ?? this.camera.position).clone(),
      fromLook: (opts.from?.look ?? this.lookPoint).clone(),
      pos: pos.clone(),
      look: look.clone(),
      t: 0,
      duration: Math.max(0.001, duration),
      fromFov: this.camera.fov,
      fov: opts.fov,
    };
    if (opts.from && opts.fov !== undefined) this.shot.fromFov = opts.fov;
  }

  clearShot(): void {
    this.shot = null;
    this.initialised = false;
  }

  get inShot(): boolean {
    return this.shot !== null;
  }

  /** Distance from the camera to the player's pivot (used to fade the avatar). */
  get distance(): number {
    return this.currentDist;
  }

  /** Widen the view for a moment (degrees): dashes and boosts read as speed. */
  kick(degrees: number): void {
    this.fovKick = Math.max(this.fovKick, degrees);
  }

  /** Add camera shake (0..1); ignored when the player has turned shake off. */
  shake(amount: number): void {
    if (this.settings.shake) this.trauma = Math.min(1, this.trauma + amount);
  }

  /** Pitch limits in radians: looking up from below (negative) to looking down from above. */
  static readonly PITCH_MIN = -0.6;
  static readonly PITCH_MAX = 1.2;

  /**
   * `look` is already in radians (Input applies sensitivity and inversion exactly once).
   * The last two arguments may also be `(grounded, speed)` (older call sites and probes).
   */
  update(dt: number, look: LookDelta, feet: THREE.Vector3, context: CameraContext | boolean, speedArg = 0): void {
    const c: CameraContext =
      typeof context === 'boolean' ? { grounded: context, speed: speedArg, mode: 'move', interacting: false, forwardInput: 1 } : context;
    this.time += dt;
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    this.fovKick = damp(this.fovKick, 0, 5, dt);

    if (this.shot) {
      const s = this.shot;
      s.t = Math.min(s.duration, s.t + dt);
      const k = s.t / s.duration;
      const e = k * k * (3 - 2 * k);
      this.camera.position.lerpVectors(s.fromPos, s.pos, e);
      this.lookPoint.lerpVectors(s.fromLook, s.look, e);
      this.camera.lookAt(this.lookPoint);
      if (s.fov !== undefined) {
        this.camera.fov = lerp(s.fromFov, s.fov, e);
        this.camera.updateProjectionMatrix();
      }
      this.applyShake();
      this.assisting = false;
      return;
    }

    // --- player look: immediate authority
    if (look.yaw !== 0 || look.pitch !== 0) {
      this.recenterTarget = null;
      this.sinceLook = 0;
    } else this.sinceLook += dt;
    this.yaw -= look.yaw;
    this.pitch = clamp(this.pitch + look.pitch, ThirdPersonCamera.PITCH_MIN, ThirdPersonCamera.PITCH_MAX);
    if (this.recenterTarget !== null) {
      this.yaw = dampAngle(this.yaw, this.recenterTarget, 10, dt);
      if (Math.abs(Math.atan2(Math.sin(this.yaw - this.recenterTarget), Math.cos(this.yaw - this.recenterTarget))) < 0.01) this.recenterTarget = null;
    }

    // --- velocity of the feet (for the assist and look-ahead)
    if (this.initialised && dt > 0) {
      this.velocity.set((feet.x - this.prevFeet.x) / dt, 0, (feet.z - this.prevFeet.z) / dt);
      if (this.velocity.lengthSq() > 400) this.velocity.set(0, 0, 0); // teleports
    }
    this.prevFeet.copy(feet);
    const v = this.velocity.length();

    // --- assist: drift behind the direction of travel, only when it cannot surprise the player
    const traversing = c.mode !== 'move';
    this.groundedFor = c.grounded && !traversing ? this.groundedFor + dt : 0;
    const assist = ASSIST[this.settings.assist];
    this.assisting = false;
    if (
      assist &&
      this.recenterTarget === null &&
      this.sinceLook > assist.after &&
      this.groundedFor > 0.3 &&
      !c.interacting &&
      c.forwardInput > 0.5 &&
      v > 1.2 &&
      !this.precision.some((inside) => inside(feet))
    ) {
      const behind = Math.atan2(-this.velocity.x, -this.velocity.z);
      const diff = Math.atan2(Math.sin(behind - this.yaw), Math.cos(behind - this.yaw));
      if (Math.abs(diff) > 0.02 && Math.abs(diff) < 2.4) {
        const ramp = clamp((v - 1.2) / 3, 0, 1) * clamp((this.sinceLook - assist.after) / 0.6, 0, 1);
        this.yaw = dampAngle(this.yaw, this.yaw + diff, assist.rate * ramp, dt);
        this.assisting = ramp > 0;
      }
    }

    // --- grinding: Mara is along for the ride, so the camera swings behind the direction of travel
    // (yielding to the mouse or stick for a moment) and pulls back to show the drop.
    const grinding = c.mode === 'grind';
    if (grinding && this.recenterTarget === null && this.sinceLook > 0.6 && v > 1) {
      const behind = Math.atan2(-this.velocity.x, -this.velocity.z);
      const ramp = clamp((this.sinceLook - 0.6) / 0.5, 0, 1);
      this.yaw = dampAngle(this.yaw, behind, 2.8 * ramp, dt);
      this.pitch = damp(this.pitch, 0.36, 1.6 * ramp, dt);
      this.assisting = true;
    }

    // --- zone (highest priority wins)
    let zone: CameraZone | null = null;
    for (const z of this.zones) {
      if (z.contains(feet) && (!zone || (z.priority ?? 0) > (zone.priority ?? 0))) zone = z;
    }
    this.activeZone = zone?.id ?? 'default';
    const zl = this.initialised ? 3 : 1000;
    const framing = MODE_FRAMING[c.mode === 'ride' ? (c.ridePose ?? '') : c.mode];
    const gl = framing && this.initialised ? 2 : zl;
    this.zoneDist = damp(this.zoneDist, (zone?.distance ?? CAMERA_DEFAULTS.distance) + (framing?.distance ?? 0), gl, dt);
    this.zoneHeight = damp(this.zoneHeight, (zone?.height ?? CAMERA_DEFAULTS.height) + (framing?.height ?? 0), gl, dt);
    this.zoneFov = damp(this.zoneFov, (zone?.fov ?? CAMERA_DEFAULTS.fov) + (framing?.fov ?? 0), gl, dt);

    // --- pivot: tight horizontally; vertically steady through jumps, quick when climbing or falling
    const targetY = feet.y + this.zoneHeight + this.pivotOffset;
    if (!this.initialised) {
      this.focus.set(feet.x, targetY, feet.z);
      this.currentDist = this.zoneDist;
    } else {
      this.focus.x = damp(this.focus.x, feet.x, 20, dt);
      this.focus.z = damp(this.focus.z, feet.z, 20, dt);
      let lambda = 9;
      if (traversing) lambda = 10;
      else if (!c.grounded) lambda = targetY > this.focus.y ? 2.2 : 11;
      this.focus.y = damp(this.focus.y, targetY, lambda, dt);
      this.focus.y = clamp(this.focus.y, targetY - 1.0, targetY + 1.2);
    }

    // --- spring arm: never through geometry. When the arm is blocked at the player's pitch (a
    // doorway's lintel, a wall above a ledge), it tries a lower angle and eases to the clearly
    // freer one, looking under the obstruction instead of collapsing into Mara. Yaw never changes.
    const reach = this.zoneDist + 0.3;
    const cast = (p: number, from: THREE.Vector3 = this.focus) => this.physics.sphereCastDistance(from, this.armDir(p, this.tmpDir), reach, PROBE_RADIUS, this.exclude);
    let bestOffset = 0;
    let bestFree = cast(this.pitch);
    if (bestFree < this.zoneDist * 0.7) {
      for (const offset of [-0.2, -0.4]) {
        const p = Math.max(ThirdPersonCamera.PITCH_MIN, this.pitch + offset);
        const f = cast(p);
        if (f > bestFree + 0.4) {
          bestFree = f;
          bestOffset = p - this.pitch;
        }
      }
    }
    this.armOffset = this.initialised ? damp(this.armOffset, bestOffset, 5, dt) : bestOffset;
    const pitch = this.pitch + this.armOffset;
    const dir = this.armDir(pitch, new THREE.Vector3());

    // Still pinned behind Mara (machinery, a column at her back): shift the pivot over a
    // shoulder, up to 0.9 m to either side, keeping the view direction. The view becomes
    // over-the-shoulder; the yaw, and with it the meaning of the controls, does not change.
    const right = this.tmpRight.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const sideRoom = (side: number) => Math.max(0, this.physics.sphereCastDistance(this.focus, right.clone().multiplyScalar(side), 0.9, PROBE_RADIUS, this.exclude) - 0.1);
    let targetLateral = 0;
    const straight = cast(pitch);
    if (straight < this.zoneDist * 0.45) {
      let best = straight;
      for (const side of [1, -1]) {
        const room = Math.min(0.9, sideRoom(side));
        if (room < 0.4) continue;
        const f = cast(pitch, this.tmpPivot.copy(this.focus).addScaledVector(right, side * room));
        if (f > best + 0.6) {
          best = f;
          targetLateral = side * room;
        }
      }
    }
    this.lateral = this.initialised ? damp(this.lateral, targetLateral, 4, dt) : targetLateral;
    // Never further sideways than there is room right now.
    if (this.lateral !== 0) this.lateral = Math.sign(this.lateral) * Math.min(Math.abs(this.lateral), sideRoom(Math.sign(this.lateral)));
    const pivot = this.tmpPivot.copy(this.focus).addScaledVector(right, this.lateral);
    const free = cast(pitch, pivot);
    const targetDist = clamp(free - 0.1, MIN_ARM, this.zoneDist);
    if (!this.initialised || targetDist < this.currentDist) this.currentDist = targetDist;
    else this.currentDist = damp(this.currentDist, targetDist, 4, dt);
    this.initialised = true;
    this.camera.position.copy(pivot).addScaledVector(dir, this.currentDist);

    // --- aim: above the pivot and a little ahead of travel
    const ahead = this.velocity.clone().multiplyScalar(clamp(v / 5, 0, 1) * 0.14);
    this.lookAhead.lerp(ahead, 1 - Math.exp(-4 * dt));
    const lift = FRAME_LIFT * clamp(this.currentDist / CAMERA_DEFAULTS.distance, 0.25, 1);
    // A long fall sinks the aim with the fall speed, so the ground comes into view before she
    // lands. Ordinary jumps (about 0.3 s of falling) never move it.
    const vy = c.verticalSpeed ?? 0;
    this.fallingFor = !c.grounded && c.mode === 'move' && vy < -1.5 ? this.fallingFor + dt : 0;
    const fallTarget = FALL_LOOK * smoothstep(0.3, 0.6, this.fallingFor) * smoothstep(4, 14, -vy);
    this.fallLook = damp(this.fallLook, fallTarget, fallTarget > this.fallLook ? 6 : 4, dt);
    this.lookPoint.copy(this.focus).add(this.lookAhead).addScaledVector(right, this.lateral);
    this.lookPoint.y += lift - this.fallLook;
    this.camera.lookAt(this.lookPoint);
    this.applyShake();

    // --- field of view: the player's setting, offset by the zone, widened a little at speed
    const aspect = this.camera.aspect || 16 / 9;
    const base = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(this.settings.fovHorizontal) / 2) / (16 / 9)));
    const portrait = aspect < 16 / 9 ? THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(this.settings.fovHorizontal) / 2) / aspect)) : base;
    const fov = clamp(Math.min(portrait, base + 12) + (this.zoneFov - CAMERA_DEFAULTS.fov) + clamp(c.speed / 6, 0, 1) * 3 + this.fovKick, 35, 105);
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      // A kick snaps out quickly and eases back; everything else eases both ways.
      this.camera.fov = fov > this.camera.fov + 1 && this.fovKick > 1 ? lerp(this.camera.fov, fov, 1 - Math.exp(-20 * dt)) : lerp(this.camera.fov, fov, 1 - Math.exp(-6 * dt));
      this.camera.updateProjectionMatrix();
    }
  }

  private readonly tmpDir = new THREE.Vector3();
  private readonly tmpRight = new THREE.Vector3();
  private readonly tmpPivot = new THREE.Vector3();
  /** Sideways pivot shift (over a shoulder) when the arm is pinned behind Mara; 0 in the open. */
  private lateral = 0;
  /** Pitch the arm is lowered by to see under an obstruction (eased; 0 in the open). */
  private armOffset = 0;

  /** Unit vector from the pivot toward the camera for the current yaw and the given pitch. */
  private armDir(pitch: number, out: THREE.Vector3): THREE.Vector3 {
    const cp = Math.cos(pitch);
    return out.set(Math.sin(this.yaw) * cp, Math.sin(pitch), Math.cos(this.yaw) * cp);
  }

  /** Small rotational shake from accumulated trauma (squared, so light hits stay subtle). */
  private applyShake(): void {
    if (this.trauma <= 0) return;
    const k = this.trauma * this.trauma * 0.03;
    const t = this.time * 31;
    this.camera.rotateX(k * (Math.sin(t * 1.7) + Math.sin(t * 2.9) * 0.5));
    this.camera.rotateY(k * (Math.sin(t * 2.3 + 1.3) + Math.sin(t * 3.7) * 0.5));
  }
}
