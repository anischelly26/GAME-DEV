import * as THREE from 'three';
import { RAPIER, Physics, PLAYER_GROUPS, GROUND_QUERY_GROUPS } from '../physics/Physics';
import type { InputFrame } from '../core/Input';
import type { EventBus, GameEvents } from '../core/Events';
import { dampAngle, smoothstep } from '../core/math';
import { MOVEMENT, PLAYER_CENTER_OFFSET } from './movement';
import { findLedge, findVault, TRAVERSAL, type Ledge, type TraversalSurfaces, type Vault } from './Traversal';
import type { GrindRail } from './GrindRail';

/**
 * Traversal state: normal movement, hanging from a ledge, pulling up, vaulting, grinding a pipe, or
 * riding something that carries her (a swing, a slide).
 */
export type MoveMode = 'move' | 'hang' | 'climb' | 'vault' | 'grind' | 'ride' | 'swim';

/** Open water a level provides: the surface height at (x, z), or null where there is none. */
export interface WaterSurface {
  level(x: number, z: number): number | null;
}

/**
 * Swimming: she starts to swim where the water is deeper than `enter` (above her waist) and stands
 * again where it is shallower than `exit`. Swimming, she lies forward with her feet `float` below
 * the surface, so her back and head are out of the water.
 */
export const SWIM = { enter: 0.95, exit: 0.75, float: 0.42, speed: 2.9, accel: 7, decel: 5, hop: 1.6 };

/**
 * Something Mara rides: it places her feet each fixed step and decides when she lets go, and how
 * fast she leaves. The level owns the rules (a swing's pendulum, a slide's chute).
 */
export interface Ride {
  /** Avatar pose while riding. */
  readonly pose: 'swing' | 'slide' | 'ladder' | 'boat';
  /** Lean for the avatar (radians, + forward), about the seat. */
  readonly tilt?: number;
  step(dt: number, input: InputFrame, cameraYaw: number): RideStep;
  /** She was taken off (respawn, teleport, restart). */
  cancel?(): void;
}

export interface RideStep {
  feet: THREE.Vector3;
  facing: number;
  /** Let go with this velocity (a leap off a swing, the end of a slide). */
  release?: THREE.Vector3;
  /** The release was a jump (plays the jump). */
  jumped?: boolean;
}

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
  /** Number of knockbacks so far (the avatar plays a stagger for each). */
  knockbacks = 0;
  /** Seconds of movement lock (interaction animations). */
  private lockTimer = 0;
  private faceTarget: number | null = null;

  private timeSinceGrounded = 0;
  private jumpBufferTimer = 0;
  /** Camera yaw the movement stick is read against (see `readInputYaw`). */
  private inputYaw = 0;
  private airStick: { x: number; y: number } | null = null;
  private jumping = false;
  private lastJumpTime = -1;
  private time = 0;
  /** Downward speed during the most recent airborne step, reported as landing impact. */
  private lastFallSpeed = 0;
  /** Current horizontal input in world space (for animation). */
  readonly wish = new THREE.Vector3();

  // --- Movement 2.0 ------------------------------------------------------------------------------
  /** Moves powered by Ivo's steam kicker: double jump, air dash, ground pound. */
  steam = false;
  /** Double jumps and air dashes left this airtime (refilled on landing, ledges, grinding). */
  airJumps = 1;
  airDashes = 1;
  /** Seconds left in the current dash, its direction, and whether it started in the air. */
  dashT = 0;
  dashAir = false;
  private readonly dashDir = new THREE.Vector3();
  private dashCooldown = 0;
  /** Sprinting: dash held after a ground dash. */
  sprinting = false;
  /** Ground pound phase: hovering, slamming down, recovering on the ground. */
  pound: 'none' | 'hover' | 'fall' | 'land' = 'none';
  private poundT = 0;
  /** Counters the avatar watches to start one-shot animations. */
  doubleJumps = 0;
  dashes = 0;
  pounds = 0;

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
  /** Grinding: the pipe, the distance along it, which way, and how fast. */
  private rail: GrindRail | null = null;
  private railS = 0;
  private railDir = 1;
  railSpeed = 0;
  private railCooldown = 0;
  /** Seconds of carried momentum after leaving a pipe (air control is light meanwhile). */
  private carryT = 0;
  /** Pipes ridden so far (tests, the avatar). */
  grinds = 0;
  /** What she is riding (mode 'ride'). */
  ride: Ride | null = null;
  /** Open water (null: none in this level). */
  water: WaterSurface | null = null;
  /** Times she has gone into the water (tests). */
  swims = 0;

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
    this.dashT = 0;
    this.pound = 'none';
    this.knockbacks++;
    this.velocity.copy(v);
    this.lockTimer = Math.max(this.lockTimer, lockSeconds);
  }

  teleport(feet: THREE.Vector3, facing: number): void {
    // Taken off a pipe mid-grind (respawn, restart, a dev teleport): end it like any other exit.
    if (this.mode === 'grind') this.events.emit('grind', { on: false, x: this.feet.x, y: this.feet.y, z: this.feet.z });
    if (this.mode === 'ride') this.ride?.cancel?.();
    if (this.mode === 'swim') this.events.emit('swim', { on: false, x: feet.x, y: feet.y, z: feet.z });
    this.ride = null;
    this.mode = 'move';
    this.ledge = null;
    this.vault = null;
    this.rail = null;
    this.carryT = 0;
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
    this.resetMoves();
  }

  /** Cancel any dash or ground pound and refill the air moves (teleports, respawns, ledges). */
  resetMoves(): void {
    this.dashT = 0;
    this.dashAir = false;
    this.sprinting = false;
    this.pound = 'none';
    this.poundT = 0;
    this.airJumps = 1;
    this.airDashes = 1;
  }

  /**
   * The camera yaw to read the stick against. On the ground it is the live camera. In the air a
   * held direction keeps the yaw it had at takeoff, so turning the camera mid-jump does not bend
   * the jump; releasing the stick or pushing a clearly different direction (over 35 degrees) reads
   * the live camera again.
   */
  private readInputYaw(onGround: boolean, input: InputFrame, cameraYaw: number): number {
    const len = Math.hypot(input.moveX, input.moveY);
    if (onGround || this.isLocked) {
      this.airStick = null;
      this.inputYaw = cameraYaw;
      return cameraYaw;
    }
    if (len < 0.25) {
      this.airStick = null;
      this.inputYaw = cameraYaw;
    } else if (!this.airStick) {
      this.airStick = { x: input.moveX / len, y: input.moveY / len };
    } else if (this.airStick.x * input.moveX + this.airStick.y * input.moveY < Math.cos((35 * Math.PI) / 180) * len) {
      this.airStick = { x: input.moveX / len, y: input.moveY / len };
      this.inputYaw = cameraYaw;
    }
    return this.inputYaw;
  }

  /** Runs once per fixed step, before `physics.step()`. */
  fixedUpdate(dt: number, input: InputFrame, cameraYaw: number): void {
    this.time += dt;
    this.prevFeet.copy(this.feet);
    this.regrabTimer = Math.max(0, this.regrabTimer - dt);
    this.railCooldown = Math.max(0, this.railCooldown - dt);
    this.carryT = Math.max(0, this.carryT - dt);
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

    if (onGround) {
      this.timeSinceGrounded = 0;
      this.carryT = 0;
    } else this.timeSinceGrounded += dt;
    if (onGround && this.pound !== 'fall') {
      this.airJumps = 1;
      this.airDashes = 1;
    }
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    this.jumpBufferTimer = input.jumpPressed ? MOVEMENT.jumpBuffer : Math.max(0, this.jumpBufferTimer - dt);
    this.lockTimer = Math.max(0, this.lockTimer - dt);

    // --- horizontal intent, relative to the camera
    const yaw = this.readInputYaw(onGround, input, cameraYaw);
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    this.wish.set(fx * input.moveY + rx * input.moveX, 0, fz * input.moveY + rz * input.moveX);
    if (this.isLocked) this.wish.set(0, 0, 0);
    const wishLen = Math.min(1, this.wish.length());
    // Sprint lasts while dash is held after a ground dash, and only while moving.
    if (this.sprinting && (!input.dashHeld || (onGround && wishLen < 0.3) || this.isLocked)) this.sprinting = false;
    const maxSpeed = (this.sprinting ? MOVEMENT.sprintSpeed : MOVEMENT.maxSpeed) * (this.carrying ? MOVEMENT.carrySpeedFactor : 1);
    const targetVX = wishLen > 0 ? (this.wish.x / Math.max(wishLen, 1e-6)) * wishLen * maxSpeed : 0;
    const targetVZ = wishLen > 0 ? (this.wish.z / Math.max(wishLen, 1e-6)) * wishLen * maxSpeed : 0;

    let accel: number;
    if (onGround) {
      const speed = Math.hypot(this.velocity.x, this.velocity.z);
      const targetSpeed = Math.hypot(targetVX, targetVZ);
      // Turning sharply: the angle between where Mara is going and where the stick points.
      const cos = speed > 0.5 && targetSpeed > 0.5 ? (this.velocity.x * targetVX + this.velocity.z * targetVZ) / (speed * targetSpeed) : 1;
      if (wishLen < 0.05) accel = MOVEMENT.groundDecel;
      else if (cos < 0.5) accel = MOVEMENT.turnAccel;
      else accel = speed < MOVEMENT.maxSpeed * MOVEMENT.launchFraction ? MOVEMENT.launchAccel : MOVEMENT.groundAccel;
    } else {
      accel = MOVEMENT.airAccel * (this.carryT > 0 ? 0.2 : 1);
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

    // --- steam kicker and dash: these can take over the step entirely
    if (this.updateMoves(dt, input, onGround, wishLen)) return;

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

    // --- jumping (a press in the air past the coyote window is a double jump, if the kicker allows)
    if (this.jumpBufferTimer > 0 && this.timeSinceGrounded > MOVEMENT.coyoteTime && this.steam && this.airJumps > 0 && !this.isLocked && this.pound === 'none') {
      this.airJumps--;
      this.velocity.y = Math.sqrt(2 * MOVEMENT.gravity * MOVEMENT.doubleJumpHeight);
      // The second jump can redirect: it goes where the stick points, at least at running speed.
      if (wishLen > 0.2) {
        const sp = Math.max(Math.hypot(this.velocity.x, this.velocity.z), maxSpeed * 0.85 * wishLen);
        this.velocity.x = (this.wish.x / wishLen) * sp * Math.min(1, wishLen);
        this.velocity.z = (this.wish.z / wishLen) * sp * Math.min(1, wishLen);
      }
      this.jumpBufferTimer = 0;
      this.jumping = true;
      this.dashT = 0;
      this.lastJumpTime = this.time;
      this.doubleJumps++;
      this.events.emit('doubleJump', { x: this.feet.x, y: this.feet.y, z: this.feet.z });
    }
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
    if ((this.dashT > 0 && this.dashAir) || this.pound === 'hover') {
      // An air dash, and the ground pound's wind-up, hold their height.
      this.velocity.y = 0;
    } else if (this.pound === 'fall' && !onGround) {
      this.velocity.y = -MOVEMENT.poundSpeed;
      this.lastFallSpeed = MOVEMENT.poundSpeed;
    } else if (onGround && this.velocity.y <= 0) {
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
    // Walking on a slope (a ramp, a stair): follow it, with only a light press into it. The full
    // press (-2 m/s) would outweigh a walk from a standstill and slide her back down every step.
    const n = this.groundNormal;
    if (onGround && !carried && this.velocity.y <= 0 && this.pound === 'none' && n.y > 0.5 && n.y < 0.995) {
      const follow = -(n.x * this.velocity.x + n.z * this.velocity.z) / n.y;
      desired.y = (follow - 0.4) * dt;
    }
    // Ride along with the platform's motion for this step. The platform is not excluded from the
    // sweep: rising platforms move away from the feet, and a descending one lags by at most one
    // step. (Excluding it caused the controller to stall at deck/gantry edges.)
    if (isCarried && platform) desired.add(platform.stepDelta);
    this.kcc.computeColliderMovement(this.collider, desired, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, PLAYER_GROUPS);
    const moved = this.kcc.computedMovement();
    this.grounded = this.kcc.computedGrounded() || isCarried;
    // Standing against a wall, the ground probe can start inside it and miss the floor while the
    // controller still stands her on it: gravity must not pile up meanwhile, or the first step off
    // an edge drops like a stone.
    if (this.grounded && this.velocity.y < -2 && this.pound !== 'fall') this.velocity.y = -2;

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

    // Water: deep enough here and she floats (walking in from a beach, or falling in).
    if (this.water && this.velocity.y <= 0.5 && this.pound !== 'hover') {
      const level = this.water.level(this.feet.x, this.feet.z);
      if (level !== null && this.feet.y < level - SWIM.enter) {
        this.startSwim(level);
        return;
      }
    }

    // Grind: feet coming down onto a registered pipe ride it.
    if (!this.grounded && this.railCooldown <= 0 && this.traversal && this.traversal.rails.length && !this.isLocked && this.pound !== 'fall') {
      for (const rail of this.traversal.rails) {
        const hit = rail.closest(new THREE.Vector3(this.feet.x, this.feet.y - rail.radius, this.feet.z));
        // The last stretch is where she flies off, not somewhere to get on (it hangs over a walkway).
        if (hit.s > rail.length - MOVEMENT.grindNoCatchEnd) continue;
        const top = rail.pointAt(hit.s).y + rail.radius;
        // Near the top of the pipe, or fell through its top during this step (a fast fall).
        const p = rail.pointAt(hit.s);
        const across = Math.hypot(this.feet.x - p.x, this.feet.z - p.z) < MOVEMENT.grindAttach && this.prevFeet.y >= top - 0.05 && this.feet.y < top;
        if (((hit.distance < MOVEMENT.grindAttach && this.feet.y > top - 0.3) || across) && this.velocity.y < 3) {
          this.startGrind(rail, hit.s);
          return;
        }
      }
    }

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
      if (this.pound === 'fall') {
        this.pound = 'land';
        this.poundT = MOVEMENT.poundRecover;
        this.lockTimer = Math.max(this.lockTimer, MOVEMENT.poundRecover);
        this.events.emit('groundPound', { x: this.feet.x, y: this.feet.y, z: this.feet.z, collider: this.groundCollider?.handle ?? null });
      }
    }

    // --- facing
    if (this.dashT > 0) {
      this.facing = Math.atan2(this.dashDir.x, this.dashDir.z);
    } else if (this.faceTarget !== null && this.lockTimer > 0) {
      this.facing = dampAngle(this.facing, this.faceTarget, 14, dt);
    } else {
      this.faceTarget = null;
      if (wishLen > 0.1) {
        const target = Math.atan2(this.wish.x, this.wish.z);
        this.facing = dampAngle(this.facing, target, MOVEMENT.turnRate * (this.grounded ? 1 : 0.6), dt);
      }
    }
  }

  /**
   * Dash, sprint and the steam kicker's moves. Returns true when it moved the player itself this
   * step (ground pound hover and slam), so the normal movement step is skipped.
   */
  private updateMoves(dt: number, input: InputFrame, onGround: boolean, wishLen: number): boolean {
    const dirOf = (out: THREE.Vector3) => (wishLen > 0.2 ? out.set(this.wish.x, 0, this.wish.z).normalize() : out.set(Math.sin(this.facing), 0, Math.cos(this.facing)));

    // Ground pound: in the air, high enough above the ground.
    if (input.poundPressed && !onGround && this.steam && this.pound === 'none' && !this.isLocked && this.heightAboveGround() > MOVEMENT.poundMinHeight) {
      this.pound = 'hover';
      this.poundT = MOVEMENT.poundHover;
      this.dashT = 0;
      this.sprinting = false;
      this.pounds++;
      this.events.emit('sfx', { name: 'poundStart', x: this.feet.x, y: this.feet.y, z: this.feet.z });
    }
    if (this.pound === 'hover' || this.pound === 'fall') {
      if (this.pound === 'hover') {
        this.poundT -= dt;
        this.velocity.set(0, 0, 0);
        if (this.poundT <= 0) this.pound = 'fall';
      }
      if (this.pound === 'fall') this.velocity.set(0, -MOVEMENT.poundSpeed, 0);
      this.lastFallSpeed = this.pound === 'fall' ? MOVEMENT.poundSpeed : 0;
      return false;
    }
    if (this.pound === 'land') {
      this.poundT -= dt;
      if (this.poundT <= 0) this.pound = 'none';
    }

    // Dash: on the ground a roll (always), in the air a steam burst (kicker, once per airtime).
    if (input.dashPressed && !this.isLocked && this.pound === 'none') {
      if (onGround && this.dashCooldown <= 0) {
        this.dashT = MOVEMENT.dashTime;
        this.dashAir = false;
        dirOf(this.dashDir);
        this.dashCooldown = MOVEMENT.dashCooldown;
        this.sprinting = true;
        this.dashes++;
        this.events.emit('dash', { air: false, x: this.feet.x, y: this.feet.y, z: this.feet.z });
      } else if (!onGround && this.steam && this.airDashes > 0) {
        this.airDashes--;
        this.dashT = MOVEMENT.airDashTime;
        this.dashAir = true;
        dirOf(this.dashDir);
        this.jumping = false;
        this.dashes++;
        this.events.emit('dash', { air: true, x: this.feet.x, y: this.feet.y, z: this.feet.z });
      }
    }
    if (this.dashT > 0) {
      this.dashT = Math.max(0, this.dashT - dt);
      const speed = this.dashAir ? MOVEMENT.airDashSpeed : MOVEMENT.dashSpeed;
      this.velocity.x = this.dashDir.x * speed;
      this.velocity.z = this.dashDir.z * speed;
      if (this.dashAir) this.velocity.y = 0;
    }
    return false;
  }

  /** Distance from the feet down to walkable ground (up to 3 m; 3 if none). */
  private heightAboveGround(): number {
    const hit = this.physics.raycast(new THREE.Vector3(this.feet.x, this.feet.y + 0.05, this.feet.z), { x: 0, y: -1, z: 0 }, 3, GROUND_QUERY_GROUPS, this.collider);
    return hit ? hit.distance - 0.05 : 3;
  }

  private setFeet(f: THREE.Vector3): void {
    this.feet.copy(f);
    this.body.setNextKinematicTranslation({ x: f.x, y: f.y + PLAYER_CENTER_OFFSET, z: f.z });
  }

  private startHang(ledge: Ledge): void {
    this.resetMoves();
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
    this.resetMoves();
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

  private startGrind(rail: GrindRail, s: number): void {
    this.resetMoves();
    this.mode = 'grind';
    this.rail = rail;
    this.railS = s;
    const t = rail.tangentAt(s);
    const along = this.velocity.x * t.x + this.velocity.z * t.z;
    // Ride the way she was going; with no clear direction, ride downhill.
    this.railDir = Math.abs(along) > 1 ? Math.sign(along) : t.y <= 0 ? 1 : -1;
    this.railSpeed = THREE.MathUtils.clamp(Math.abs(along), MOVEMENT.grindMinSpeed, MOVEMENT.grindMaxSpeed);
    this.grounded = false;
    this.jumping = false;
    this.grinds++;
    const f = rail.feetAt(s);
    this.setFeet(f);
    this.events.emit('grind', { on: true, x: f.x, y: f.y, z: f.z });
  }

  private startSwim(level: number): void {
    this.mode = 'swim';
    this.modeT = 0;
    this.swims++;
    this.resetMoves();
    this.pound = 'none';
    this.dashT = 0;
    this.jumping = false;
    this.grounded = false;
    // A fall into the water keeps a little of its speed as a plunge; then she bobs up.
    this.velocity.y = 0;
    this.events.emit('swim', { on: true, x: this.feet.x, y: level, z: this.feet.z });
  }

  /** Swimming: the stick moves her across the surface; she climbs out where a ledge allows. */
  private updateSwim(dt: number, input: InputFrame, cameraYaw: number): void {
    const level = this.water?.level(this.feet.x, this.feet.z) ?? null;
    if (level === null) {
      this.mode = 'move';
      this.events.emit('swim', { on: false, x: this.feet.x, y: this.feet.y, z: this.feet.z });
      return;
    }
    this.modeT += dt;
    this.lockTimer = Math.max(0, this.lockTimer - dt);
    const fx = -Math.sin(cameraYaw);
    const fz = -Math.cos(cameraYaw);
    const rx = Math.cos(cameraYaw);
    const rz = -Math.sin(cameraYaw);
    this.wish.set(fx * input.moveY + rx * input.moveX, 0, fz * input.moveY + rz * input.moveX);
    if (this.isLocked) this.wish.set(0, 0, 0);
    const wishLen = Math.min(1, this.wish.length());
    const tvx = wishLen > 0 ? (this.wish.x / Math.max(this.wish.length(), 1e-6)) * wishLen * SWIM.speed : 0;
    const tvz = wishLen > 0 ? (this.wish.z / Math.max(this.wish.length(), 1e-6)) * wishLen * SWIM.speed : 0;
    const accel = (wishLen > 0.05 ? SWIM.accel : SWIM.decel) * dt;
    const dvx = tvx - this.velocity.x;
    const dvz = tvz - this.velocity.z;
    const dl = Math.hypot(dvx, dvz);
    if (dl <= accel) {
      this.velocity.x = tvx;
      this.velocity.z = tvz;
    } else {
      this.velocity.x += (dvx / dl) * accel;
      this.velocity.z += (dvz / dl) * accel;
    }
    if (this.speed > 0.3) this.facing = dampAngle(this.facing, Math.atan2(this.velocity.x, this.velocity.z), MOVEMENT.turnRate * 0.6, dt);

    // Climbing out: swimming into a registered ledge (a dock, a rock shelf) she can reach.
    if (this.traversal && wishLen > 0.3 && !this.isLocked) {
      const ledge = findLedge(this.physics, this.traversal, this.feet, this.wish, this.collider);
      if (ledge) {
        const rel = ledge.topY - this.feet.y;
        this.events.emit('swim', { on: false, x: this.feet.x, y: level, z: this.feet.z });
        if (rel < 1.25) this.startClimb(ledge, this.feet.clone());
        else this.startHang(ledge);
        return;
      }
    }
    // Jump: a kick up out of the water (onto something low, or just a splash).
    if (input.jumpPressed && !this.isLocked) {
      this.mode = 'move';
      this.velocity.y = Math.sqrt(2 * MOVEMENT.gravity * SWIM.hop);
      this.jumping = true;
      this.lastJumpTime = this.time;
      this.timeSinceGrounded = MOVEMENT.coyoteTime + 1;
      this.events.emit('swim', { on: false, x: this.feet.x, y: level, z: this.feet.z });
      this.events.emit('jump', { speed: this.speed });
      return;
    }

    // Float at the surface with a gentle bob; the controller keeps her out of rocks and walls.
    const pos = this.body.translation();
    const floatY = level - SWIM.float + Math.sin(this.time * 2.3) * 0.035;
    const desired = new THREE.Vector3(this.velocity.x * dt, (floatY - this.feet.y) * Math.min(1, dt * 8), this.velocity.z * dt);
    this.kcc.computeColliderMovement(this.collider, desired, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, PLAYER_GROUPS);
    const moved = this.kcc.computedMovement();
    const next = new THREE.Vector3(pos.x + moved.x, pos.y + moved.y, pos.z + moved.z);
    this.body.setNextKinematicTranslation(next);
    this.feet.set(next.x, next.y - PLAYER_CENTER_OFFSET, next.z);
    this.velocity.y = 0;

    // Shallow enough to stand: walk out.
    const ground = this.heightAboveGround();
    if (ground < 3 && level - (this.feet.y - ground) < SWIM.exit) {
      this.mode = 'move';
      this.events.emit('swim', { on: false, x: this.feet.x, y: level, z: this.feet.z });
    }
  }

  /** Get on a swing or a slide: it carries her until it lets her go. */
  startRide(ride: Ride): void {
    if (this.mode === 'grind') this.events.emit('grind', { on: false, x: this.feet.x, y: this.feet.y, z: this.feet.z });
    this.resetMoves();
    this.mode = 'ride';
    this.modeT = 0;
    this.ride = ride;
    this.rail = null;
    this.ledge = null;
    this.vault = null;
    this.velocity.set(0, 0, 0);
    this.grounded = false;
    this.jumping = false;
  }

  /** Off the end of the pipe, or a jump off it: momentum carries her on. */
  private leaveRail(t: THREE.Vector3, jumped: boolean): void {
    const rail = this.rail!;
    const f = rail.feetAt(THREE.MathUtils.clamp(this.railS, 0, rail.length));
    this.mode = 'move';
    this.rail = null;
    this.railCooldown = 0.45;
    this.carryT = MOVEMENT.grindCarry;
    const up = jumped ? Math.sqrt(2 * MOVEMENT.gravity * MOVEMENT.grindJumpHeight) : Math.max(0, t.y * this.railSpeed) + 2;
    this.velocity.set(t.x * this.railSpeed, up, t.z * this.railSpeed);
    this.jumping = jumped;
    this.timeSinceGrounded = MOVEMENT.coyoteTime + 1;
    this.lastJumpTime = this.time;
    this.setFeet(f);
    if (jumped) this.events.emit('jump', { speed: this.railSpeed });
    this.events.emit('grind', { on: false, x: f.x, y: f.y, z: f.z });
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
    if (this.mode === 'swim') {
      this.updateSwim(dt, input, cameraYaw);
      return;
    }
    if (this.mode === 'ride' && this.ride) {
      this.modeT += dt;
      const r = this.ride.step(dt, this.isLocked ? { ...input, jumpPressed: false, moveX: 0, moveY: 0 } : input, cameraYaw);
      this.velocity.subVectors(r.feet, this.feet).divideScalar(dt);
      this.facing = r.facing;
      this.setFeet(r.feet);
      if (r.release) {
        this.mode = 'move';
        this.ride = null;
        this.velocity.copy(r.release);
        this.carryT = MOVEMENT.grindCarry;
        this.jumping = !!r.jumped;
        this.timeSinceGrounded = MOVEMENT.coyoteTime + 1;
        this.lastJumpTime = this.time;
        this.airJumps = 1;
        this.airDashes = 1;
        if (r.jumped) this.events.emit('jump', { speed: Math.hypot(r.release.x, r.release.z) });
      }
      return;
    }
    if (this.mode === 'grind' && this.rail) {
      const rail = this.rail;
      const t = rail.tangentAt(this.railS).multiplyScalar(this.railDir);
      // Gravity along the slope and a little friction; never slower than a jog, never a blur.
      this.railSpeed += (-t.y * MOVEMENT.gravity * MOVEMENT.grindSlope - MOVEMENT.grindFriction) * dt;
      this.railSpeed = THREE.MathUtils.clamp(this.railSpeed, MOVEMENT.grindMinSpeed, MOVEMENT.grindMaxSpeed);
      this.railS += this.railDir * this.railSpeed * dt;
      this.facing = Math.atan2(t.x, t.z);
      this.velocity.copy(t).multiplyScalar(this.railSpeed);
      if (input.jumpPressed && !this.isLocked) {
        this.leaveRail(t, true);
        return;
      }
      if (this.railS <= 0 || this.railS >= rail.length) {
        this.leaveRail(t, false);
        return;
      }
      this.setFeet(rail.feetAt(this.railS));
      return;
    }
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
