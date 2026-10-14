import * as THREE from 'three';
import { RAPIER, Physics, PLAYER_GROUPS, GROUND_QUERY_GROUPS } from '../physics/Physics';
import type { InputFrame } from '../core/Input';
import type { EventBus, GameEvents } from '../core/Events';
import { dampAngle } from '../core/math';

/** All movement feel parameters in one place so they can be tuned (and reviewed) without hunting. */
export const MOVEMENT = {
  maxSpeed: 6.0,
  carrySpeedFactor: 0.85,
  groundAccel: 58,
  groundDecel: 46,
  /** Acceleration when the stick points against the current velocity (snappy reversals). */
  turnAccel: 95,
  airAccel: 24,
  gravity: 26,
  fallGravityMul: 1.35,
  /** Extra gravity while rising with the jump button released (variable jump height). */
  jumpCutGravityMul: 2.6,
  jumpHeight: 1.45,
  maxFallSpeed: 26,
  coyoteTime: 0.12,
  jumpBuffer: 0.14,
  turnRate: 16,
  capsuleRadius: 0.3,
  capsuleHalfHeight: 0.45,
  /** Max height (above the feet) of a ledge the player is boosted onto when a jump falls just short. */
  ledgeAssist: 0.42,
};

export const PLAYER_CENTER_OFFSET = MOVEMENT.capsuleHalfHeight + MOVEMENT.capsuleRadius;

/** Anything that moves and can carry the player. */
export interface MovingPlatform {
  /** Translation applied during the current fixed step. */
  readonly stepDelta: THREE.Vector3;
}

const UP = new THREE.Vector3(0, 1, 0);

export class PlayerController {
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  private readonly kcc: RAPIER.KinematicCharacterController;

  readonly velocity = new THREE.Vector3();
  /** Yaw the character faces; forward = (sin, 0, cos). */
  facing = 0;
  grounded = false;
  readonly groundNormal = new THREE.Vector3(0, 1, 0);
  groundCollider: RAPIER.Collider | null = null;
  /** Feet position at the previous and current fixed step, for render interpolation. */
  readonly prevFeet = new THREE.Vector3();
  readonly feet = new THREE.Vector3();

  carrying = false;
  /** Cutscenes freeze the player completely. */
  frozen = false;
  /** Seconds of movement lock (interaction animations). */
  private lockTimer = 0;
  private faceTarget: number | null = null;

  private timeSinceGrounded = 0;
  private jumpBufferTimer = 0;
  private jumping = false;
  private lastJumpTime = -1;
  private time = 0;
  /** Downward speed during the most recent airborne step, reported as landing impact. */
  private lastFallSpeed = 0;
  /** Current horizontal input in world space (for animation). */
  readonly wish = new THREE.Vector3();

  readonly platforms = new Map<number, MovingPlatform>();

  constructor(
    private readonly physics: Physics,
    private readonly events: EventBus<GameEvents>,
    spawn: THREE.Vector3,
    facing: number,
  ) {
    const world = physics.world;
    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(spawn.x, spawn.y + PLAYER_CENTER_OFFSET, spawn.z),
    );
    this.collider = world.createCollider(
      RAPIER.ColliderDesc.capsule(MOVEMENT.capsuleHalfHeight, MOVEMENT.capsuleRadius).setCollisionGroups(PLAYER_GROUPS),
      this.body,
    );
    this.kcc = world.createCharacterController(0.02);
    this.kcc.setUp({ x: 0, y: 1, z: 0 });
    this.kcc.setSlideEnabled(true);
    this.kcc.enableAutostep(0.32, 0.15, false);
    this.kcc.enableSnapToGround(0.25);
    this.kcc.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
    this.kcc.setMinSlopeSlideAngle((60 * Math.PI) / 180);
    this.kcc.setApplyImpulsesToDynamicBodies(false);
    this.feet.copy(spawn);
    this.prevFeet.copy(spawn);
    this.facing = facing;
  }

  get speed(): number {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  get isLocked(): boolean {
    return this.frozen || this.lockTimer > 0;
  }

  /** Lock movement for `seconds` (e.g. while turning a valve) and optionally face a point. */
  lockFor(seconds: number, faceToward?: THREE.Vector3): void {
    this.lockTimer = Math.max(this.lockTimer, seconds);
    if (faceToward) this.faceTarget = Math.atan2(faceToward.x - this.feet.x, faceToward.z - this.feet.z);
  }

  teleport(feet: THREE.Vector3, facing: number): void {
    const c = { x: feet.x, y: feet.y + PLAYER_CENTER_OFFSET + 0.02, z: feet.z };
    this.body.setTranslation(c, true);
    this.body.setNextKinematicTranslation(c);
    this.physics.world.propagateModifiedBodyPositionsToColliders();
    this.velocity.set(0, 0, 0);
    this.feet.copy(feet);
    this.prevFeet.copy(feet);
    this.facing = facing;
    this.grounded = false;
    this.groundCollider = null;
    this.jumping = false;
    this.jumpBufferTimer = 0;
    this.timeSinceGrounded = 0;
    this.lockTimer = 0;
    this.faceTarget = null;
  }

  /** Runs once per fixed step, before `physics.step()`. */
  fixedUpdate(dt: number, input: InputFrame, cameraYaw: number): void {
    this.time += dt;
    this.prevFeet.copy(this.feet);
    const pos = this.body.translation();

    // --- ground probe (world state is consistent here: it is right after the previous step)
    const wasGrounded = this.grounded;
    const onGround = this.probeGround(pos);
    const platform = onGround && this.groundCollider ? this.platforms.get(this.groundCollider.handle) : undefined;
    const carried = !!platform;

    if (onGround) this.timeSinceGrounded = 0;
    else this.timeSinceGrounded += dt;
    this.jumpBufferTimer = input.jumpPressed ? MOVEMENT.jumpBuffer : Math.max(0, this.jumpBufferTimer - dt);
    this.lockTimer = Math.max(0, this.lockTimer - dt);

    // --- horizontal intent, relative to the camera
    const fx = -Math.sin(cameraYaw);
    const fz = -Math.cos(cameraYaw);
    const rx = Math.cos(cameraYaw);
    const rz = -Math.sin(cameraYaw);
    this.wish.set(fx * input.moveY + rx * input.moveX, 0, fz * input.moveY + rz * input.moveX);
    if (this.isLocked) this.wish.set(0, 0, 0);
    const wishLen = Math.min(1, this.wish.length());
    const maxSpeed = MOVEMENT.maxSpeed * (this.carrying ? MOVEMENT.carrySpeedFactor : 1);
    const targetVX = wishLen > 0 ? (this.wish.x / Math.max(wishLen, 1e-6)) * wishLen * maxSpeed : 0;
    const targetVZ = wishLen > 0 ? (this.wish.z / Math.max(wishLen, 1e-6)) * wishLen * maxSpeed : 0;

    let accel: number;
    if (onGround) {
      const reversing = this.velocity.x * targetVX + this.velocity.z * targetVZ < 0;
      accel = wishLen < 0.05 ? MOVEMENT.groundDecel : reversing ? MOVEMENT.turnAccel : MOVEMENT.groundAccel;
    } else {
      accel = MOVEMENT.airAccel;
    }
    // Approach target velocity as a 2D vector so diagonal changes are smooth.
    const dvx = targetVX - this.velocity.x;
    const dvz = targetVZ - this.velocity.z;
    const dvLen = Math.hypot(dvx, dvz);
    const maxDv = accel * dt;
    if (dvLen <= maxDv) {
      this.velocity.x = targetVX;
      this.velocity.z = targetVZ;
    } else {
      this.velocity.x += (dvx / dvLen) * maxDv;
      this.velocity.z += (dvz / dvLen) * maxDv;
    }

    // --- jumping
    if (this.jumpBufferTimer > 0 && this.timeSinceGrounded <= MOVEMENT.coyoteTime && !this.isLocked) {
      const height = MOVEMENT.jumpHeight * (this.carrying ? 0.85 : 1);
      this.velocity.y = Math.sqrt(2 * MOVEMENT.gravity * height);
      this.jumpBufferTimer = 0;
      this.timeSinceGrounded = MOVEMENT.coyoteTime + 1;
      this.jumping = true;
      this.lastJumpTime = this.time;
      if (platform) {
        // Keep the platform's horizontal momentum when jumping off it.
        this.velocity.x += platform.stepDelta.x / dt;
        this.velocity.z += platform.stepDelta.z / dt;
      }
      this.events.emit('jump', { speed: this.speed });
    }

    // --- gravity
    let g = MOVEMENT.gravity;
    if (this.velocity.y < 0) g *= MOVEMENT.fallGravityMul;
    else if (this.jumping && !input.jumpHeld) g *= MOVEMENT.jumpCutGravityMul;
    if (onGround && this.velocity.y <= 0) {
      this.velocity.y = carried ? 0 : -2;
      this.jumping = false;
    } else {
      this.velocity.y = Math.max(this.velocity.y - g * dt, -MOVEMENT.maxFallSpeed);
      if (this.velocity.y < 0) this.lastFallSpeed = -this.velocity.y;
    }
    const isCarried = carried && this.velocity.y <= 0;

    // --- move
    const desired = new THREE.Vector3(this.velocity.x * dt, this.velocity.y * dt, this.velocity.z * dt);
    if (isCarried && platform) desired.add(platform.stepDelta);
    const excluded = isCarried ? this.groundCollider : null;
    this.kcc.computeColliderMovement(
      this.collider,
      desired,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      PLAYER_GROUPS,
      excluded ? (c) => c.handle !== excluded.handle : undefined,
    );
    const moved = this.kcc.computedMovement();
    this.grounded = this.kcc.computedGrounded() || isCarried;

    // Ceiling bonk.
    if (this.velocity.y > 0 && moved.y < desired.y - 1e-4) this.velocity.y = 0;

    // Walls: remove the velocity that was absorbed so the player doesn't "stick" to geometry.
    const carryX = isCarried && platform ? platform.stepDelta.x : 0;
    const carryZ = isCarried && platform ? platform.stepDelta.z : 0;
    const ownX = moved.x - carryX;
    const ownZ = moved.z - carryZ;
    const desiredH = Math.hypot(this.velocity.x * dt, this.velocity.z * dt);
    const movedH = Math.hypot(ownX, ownZ);
    let blocked = false;
    if (desiredH > 1e-5 && movedH < desiredH * 0.98) {
      blocked = true;
      this.velocity.x = ownX / dt;
      this.velocity.z = ownZ / dt;
    }

    const next = new THREE.Vector3(pos.x + moved.x, pos.y + moved.y, pos.z + moved.z);

    // Ledge assist: a jump that falls a few centimetres short of a ledge lifts the player onto it.
    if (!this.grounded && blocked && wishLen > 0.3 && this.time - this.lastJumpTime < 1.5) {
      const lift = this.ledgeLift(next, this.wish);
      if (lift > 0) {
        next.y += lift;
        this.velocity.y = Math.max(this.velocity.y, 0);
      }
    }

    this.body.setNextKinematicTranslation(next);
    this.feet.set(next.x, next.y - PLAYER_CENTER_OFFSET, next.z);

    if (!wasGrounded && this.grounded) {
      this.jumping = false;
      this.events.emit('land', { impact: this.lastFallSpeed });
      this.lastFallSpeed = 0;
    }

    // --- facing
    if (this.faceTarget !== null && this.lockTimer > 0) {
      this.facing = dampAngle(this.facing, this.faceTarget, 14, dt);
    } else {
      this.faceTarget = null;
      if (wishLen > 0.1) {
        const target = Math.atan2(this.wish.x, this.wish.z);
        this.facing = dampAngle(this.facing, target, MOVEMENT.turnRate * (this.grounded ? 1 : 0.6), dt);
      }
    }
  }

  /** Called after `physics.step()` so feet match the simulated body. */
  postStep(): void {
    const t = this.body.translation();
    this.feet.set(t.x, t.y - PLAYER_CENTER_OFFSET, t.z);
  }

  interpolatedFeet(alpha: number, out: THREE.Vector3): THREE.Vector3 {
    return out.lerpVectors(this.prevFeet, this.feet, alpha);
  }

  /** Short downward sweep under the capsule. Sets `groundCollider`; returns true when standing on walkable ground. */
  private probeGround(center: RAPIER.Vector): boolean {
    const bottom = { x: center.x, y: center.y - MOVEMENT.capsuleHalfHeight, z: center.z };
    const hit = this.physics.world.castShape(
      bottom,
      { x: 0, y: 0, z: 0, w: 1 },
      { x: 0, y: -1, z: 0 },
      new RAPIER.Ball(MOVEMENT.capsuleRadius * 0.9),
      0,
      0.14,
      true,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      GROUND_QUERY_GROUPS,
      this.collider,
    );
    if (hit) {
      // The contact normal's sign convention differs between Rapier versions; orient it upward.
      const n = hit.normal1;
      const s = n.y >= 0 ? 1 : -1;
      this.groundNormal.set(n.x * s, n.y * s, n.z * s).normalize();
      if (this.groundNormal.dot(UP) > 0.6 && this.velocity.y <= 0.01) {
        this.groundCollider = hit.collider;
        return true;
      }
    }
    this.groundCollider = null;
    this.groundNormal.copy(UP);
    return false;
  }

  /** Returns how far to raise the player to stand on the ledge ahead, or 0. */
  private ledgeLift(center: THREE.Vector3, dir: THREE.Vector3): number {
    const d = dir.clone().setY(0).normalize();
    const feetY = center.y - PLAYER_CENTER_OFFSET;
    const probeTop = feetY + MOVEMENT.ledgeAssist + 0.05;
    const origin = new THREE.Vector3(center.x + d.x * (MOVEMENT.capsuleRadius + 0.2), probeTop, center.z + d.z * (MOVEMENT.capsuleRadius + 0.2));
    const hit = this.physics.raycast(origin, { x: 0, y: -1, z: 0 }, MOVEMENT.ledgeAssist + 0.05, GROUND_QUERY_GROUPS, this.collider);
    if (!hit || hit.normal.y < 0.75) return 0;
    const ledgeY = probeTop - hit.distance;
    const lift = ledgeY - feetY + 0.03;
    if (lift <= 0.02 || lift > MOVEMENT.ledgeAssist) return 0;
    // Make sure there is headroom to rise.
    const free = this.physics.world.castShape(
      center,
      { x: 0, y: 0, z: 0, w: 1 },
      { x: 0, y: 1, z: 0 },
      new RAPIER.Capsule(MOVEMENT.capsuleHalfHeight, MOVEMENT.capsuleRadius * 0.95),
      0,
      lift,
      true,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      GROUND_QUERY_GROUPS,
      this.collider,
    );
    return free ? 0 : lift;
  }
}
