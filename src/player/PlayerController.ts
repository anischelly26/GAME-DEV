import * as THREE from 'three';
import { RAPIER, Physics, PLAYER_GROUPS, GROUND_QUERY_GROUPS } from '../physics/Physics';
import type { InputFrame } from '../core/Input';
import type { EventBus, GameEvents } from '../core/Events';
import { dampAngle, smoothstep } from '../core/math';
import { MOVEMENT, PLAYER_CENTER_OFFSET } from './movement';
import { findLedge, findVault, TRAVERSAL, type Ledge, type TraversalSurfaces, type Vault } from './Traversal';

/** Traversal state: normal movement, hanging from a ledge, pulling up, or vaulting. */
export type MoveMode = 'move' | 'hang' | 'climb' | 'vault';

export { MOVEMENT, PLAYER_CENTER_OFFSET } from './movement';

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

  mode: MoveMode = 'move';
  /** Seconds (hang) or 0..1 progress (climb, vault) in the current traversal mode. */
  modeT = 0;
  /** Surfaces registered by the level as climbable / vaultable. Null disables both moves. */
  traversal: TraversalSurfaces | null = null;
  private ledge: Ledge | null = null;
  private vault: Vault | null = null;
  private readonly climbFrom = new THREE.Vector3();
  private readonly climbMid = new THREE.Vector3();
  private readonly climbTo = new THREE.Vector3();
  private vaultSpeed = 0;
  private regrabTimer = 0;
  private regrabCollider = -1;

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

  /** Push the player (steam, impacts). Never damage; briefly removes control. */
  knockback(v: THREE.Vector3, lockSeconds: number): void {
    if (this.mode !== 'move') return;
    this.velocity.copy(v);
    this.lockTimer = Math.max(this.lockTimer, lockSeconds);
  }

  teleport(feet: THREE.Vector3, facing: number): void {
    this.mode = 'move';
    this.ledge = null;
    this.vault = null;
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
    this.regrabTimer = Math.max(0, this.regrabTimer - dt);
    if (this.mode !== 'move') {
      this.updateTraversal(dt, input, cameraYaw);
      return;
    }
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

    // --- vault: jump pressed while running at a low, registered obstacle
    if (this.jumpBufferTimer > 0 && onGround && !this.isLocked && this.traversal && this.speed > 2.2) {
      const dir = new THREE.Vector3(this.velocity.x, 0, this.velocity.z);
      const v = findVault(this.physics, this.traversal, this.feet, dir, this.collider);
      if (v) {
        this.jumpBufferTimer = 0;
        this.startVault(v);
        return;
      }
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
      // Press gently into the ground so the controller slides along it (with zero vertical intent
      // it treats a floor inside its skin as blocking). On a platform that is moving vertically,
      // ride its motion exactly instead: pressing would snap the feet into the rising deck.
      const verticalPlatform = carried && platform && Math.abs(platform.stepDelta.y) > 1e-4;
      this.velocity.y = verticalPlatform ? 0 : -2;
      this.jumping = false;
    } else {
      this.velocity.y = Math.max(this.velocity.y - g * dt, -MOVEMENT.maxFallSpeed);
      if (this.velocity.y < 0) this.lastFallSpeed = -this.velocity.y;
    }
    const isCarried = carried && this.velocity.y <= 0;

    // --- move
    const desired = new THREE.Vector3(this.velocity.x * dt, this.velocity.y * dt, this.velocity.z * dt);
    // Ride along with the platform's motion for this step. The platform is not excluded from the
    // sweep: rising platforms move away from the feet, and a descending one lags by at most one
    // step. (Excluding it caused the controller to stall at deck/gantry edges.)
    if (isCarried && platform) desired.add(platform.stepDelta);
    this.kcc.computeColliderMovement(this.collider, desired, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, PLAYER_GROUPS);
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

    // Ledge catch: only with intent toward a registered ledge, near or past the apex.
    if (!this.grounded && this.traversal && this.velocity.y < 2.5 && wishLen > 0.3 && !this.isLocked) {
      const ledge = findLedge(this.physics, this.traversal, this.feet, this.wish, this.collider);
      if (ledge && (this.regrabTimer <= 0 || ledge.collider !== this.regrabCollider)) {
        const rel = ledge.topY - this.feet.y;
        if (rel < 1.25) this.startClimb(ledge, this.feet);
        else this.startHang(ledge);
        return;
      }
    }

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

  private setFeet(f: THREE.Vector3): void {
    this.feet.copy(f);
    this.body.setNextKinematicTranslation({ x: f.x, y: f.y + PLAYER_CENTER_OFFSET, z: f.z });
  }

  private startHang(ledge: Ledge): void {
    this.mode = 'hang';
    this.modeT = 0;
    this.ledge = ledge;
    this.velocity.set(0, 0, 0);
    this.jumping = false;
    this.grounded = false;
    this.facing = Math.atan2(-ledge.normal.x, -ledge.normal.z);
    this.setFeet(ledge.hangFeet);
    this.events.emit('sfx', { name: 'grab', x: ledge.hangFeet.x, y: ledge.topY, z: ledge.hangFeet.z });
  }

  private startClimb(ledge: Ledge, from: THREE.Vector3): void {
    this.mode = 'climb';
    this.modeT = 0;
    this.ledge = ledge;
    this.velocity.set(0, 0, 0);
    this.grounded = false;
    this.facing = Math.atan2(-ledge.normal.x, -ledge.normal.z);
    this.climbFrom.copy(from);
    this.climbMid.set(from.x, ledge.topY + 0.12, from.z);
    this.climbTo.copy(ledge.standFeet);
    this.events.emit('sfx', { name: 'climb', x: from.x, y: ledge.topY, z: from.z });
  }

  private startVault(v: Vault): void {
    this.mode = 'vault';
    this.modeT = 0;
    this.vault = v;
    this.vaultSpeed = Math.max(4.5, this.speed);
    this.grounded = false;
    this.facing = Math.atan2(v.to.x - v.from.x, v.to.z - v.from.z);
    this.events.emit('sfx', { name: 'vault', x: v.apex.x, y: v.apex.y, z: v.apex.z });
  }

  /** Scripted traversal moves. Endpoints were validated as free when the move started. */
  private updateTraversal(dt: number, input: InputFrame, cameraYaw: number): void {
    if (this.mode === 'hang' && this.ledge) {
      this.modeT += dt;
      const fx = -Math.sin(cameraYaw);
      const fz = -Math.cos(cameraYaw);
      const rx = Math.cos(cameraYaw);
      const rz = -Math.sin(cameraYaw);
      const wx = fx * input.moveY + rx * input.moveX;
      const wz = fz * input.moveY + rz * input.moveX;
      const toward = -(wx * this.ledge.normal.x + wz * this.ledge.normal.z);
      if (input.jumpPressed || (toward > 0.5 && this.modeT > 0.2)) {
        this.startClimb(this.ledge, this.feet.clone());
      } else if (toward < -0.5 && this.modeT > 0.15) {
        // Let go: drop away from the wall and don't re-catch the same ledge straight away.
        this.mode = 'move';
        this.regrabTimer = TRAVERSAL.regrabDelay;
        this.regrabCollider = this.ledge.collider;
        this.velocity.set(this.ledge.normal.x * 2, -1, this.ledge.normal.z * 2);
        this.ledge = null;
      } else {
        this.setFeet(this.ledge.hangFeet);
      }
      return;
    }
    if (this.mode === 'climb') {
      this.modeT = Math.min(1, this.modeT + dt / TRAVERSAL.pullUpTime);
      const t = this.modeT;
      const p = new THREE.Vector3();
      if (t < 0.6) p.lerpVectors(this.climbFrom, this.climbMid, smoothstep(0, 1, t / 0.6));
      else p.lerpVectors(this.climbMid, this.climbTo, smoothstep(0, 1, (t - 0.6) / 0.4));
      this.setFeet(p);
      if (t >= 1) {
        this.mode = 'move';
        this.ledge = null;
        this.grounded = true;
        this.velocity.set(0, -2, 0);
        this.events.emit('land', { impact: 2 });
      }
      return;
    }
    if (this.mode === 'vault' && this.vault) {
      this.modeT = Math.min(1, this.modeT + dt / TRAVERSAL.vaultTime);
      const t = this.modeT;
      const v = this.vault;
      const a = (1 - t) * (1 - t);
      const b = 2 * (1 - t) * t;
      const c = t * t;
      this.setFeet(new THREE.Vector3(v.from.x * a + v.apex.x * b + v.to.x * c, v.from.y * a + v.apex.y * b + v.to.y * c, v.from.z * a + v.apex.z * b + v.to.z * c));
      if (t >= 1) {
        // Leave the vault with forward momentum so the run continues.
        const dir = new THREE.Vector3(v.to.x - v.from.x, 0, v.to.z - v.from.z).normalize();
        this.velocity.set(dir.x * this.vaultSpeed, -2, dir.z * this.vaultSpeed);
        this.mode = 'move';
        this.vault = null;
        this.grounded = true;
        this.events.emit('land', { impact: 3 });
      }
      return;
    }
    this.mode = 'move';
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
