import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { Layer, groups, type Physics } from '../physics/Physics';
import type { MaterialLibrary } from '../world/materials';
import { glowSprite } from '../world/props/Lanterns';

/**
 * A Watch automaton: Breakwater's steam-driven sentry. It runs on a rail (round the engine collar's
 * deck, down a village lane, round a playground's rim) sweeping a searchlight, stops now and then
 * to look back, and fills a suspicion meter while it can see Mara: inside its cone, in range, nothing
 * solid in between, and she is not hidden (tall grass). Full, it raises the alarm: if she is by its
 * rail it rolls after her and grabs her; if she is out of its reach it fires a tether at her after a
 * short beat. Either way she is caught (returned to the checkpoint). Out of sight for long enough it
 * gives up, searches, and goes back to its round. It hears noise (a creaking swing) and goes to look.
 * A ground pound beside it knocks it out for a few seconds. It never hurts her.
 *
 * Pure rules live in `step()` (deterministic, fixed step); `update()` animates.
 */
export type SentryState = 'patrol' | 'look' | 'alert' | 'search' | 'stunned' | 'investigate';

/** The rail a sentry runs on. */
export interface SentryTrack {
  /** The frame the sentry rides in (the collar deck, which moves; or the level). */
  readonly parent: THREE.Object3D;
  readonly length: number;
  /** A loop (the collar, a rim) or a line it runs up and down (a lane). */
  readonly loop: boolean;
  /** Point at arc length `s` in the parent's frame; y is the floor there. */
  local(s: number, out: THREE.Vector3): THREE.Vector3;
  /** The parent frame's offset in the world (the collar's height); null if it is the world. */
  offset(): THREE.Vector3 | null;
  /** Arc length of the track point nearest a world position. */
  nearest(p: THREE.Vector3Like): number;
}

/** A circle round the origin (the engine collar's deck), riding a parent that moves up and down. */
export class RingTrack implements SentryTrack {
  readonly loop = true;
  readonly length: number;
  private readonly off = new THREE.Vector3();

  constructor(
    readonly parent: THREE.Object3D,
    readonly radius: number,
    private readonly floorY: () => number,
  ) {
    this.length = Math.PI * 2 * radius;
  }

  /** Arc length at `angle` (radians, atan2(x, z)). */
  at(angle: number): number {
    const a = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    return a * this.radius;
  }

  local(s: number, out: THREE.Vector3): THREE.Vector3 {
    const a = s / this.radius;
    return out.set(Math.sin(a) * this.radius, 0, Math.cos(a) * this.radius);
  }

  offset(): THREE.Vector3 {
    return this.off.set(0, this.floorY(), 0);
  }

  nearest(p: THREE.Vector3Like): number {
    return this.at(Math.atan2(p.x, p.z));
  }
}

/** A rail through the world: a line it runs up and down, or a closed loop. */
export class PathTrack implements SentryTrack {
  readonly length: number;
  private readonly cum: number[] = [0];
  private readonly points: THREE.Vector3[];

  constructor(
    readonly parent: THREE.Object3D,
    points: THREE.Vector3[],
    readonly loop: boolean,
  ) {
    const pts = loop ? [...points, points[0]] : points;
    for (let i = 1; i < pts.length; i++) this.cum.push(this.cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
    this.length = this.cum[this.cum.length - 1];
    this.points = pts;
  }

  local(s: number, out: THREE.Vector3): THREE.Vector3 {
    const L = this.length;
    let t = this.loop ? ((s % L) + L) % L : THREE.MathUtils.clamp(s, 0, L);
    let i = 0;
    while (i < this.cum.length - 2 && this.cum[i + 1] < t) i++;
    t = (t - this.cum[i]) / Math.max(1e-6, this.cum[i + 1] - this.cum[i]);
    return out.lerpVectors(this.points[i], this.points[i + 1], t);
  }

  offset(): null {
    return null;
  }

  nearest(p: THREE.Vector3Like): number {
    let best = Infinity;
    let bestS = 0;
    const ab = new THREE.Vector3();
    const ap = new THREE.Vector3();
    for (let i = 0; i < this.points.length - 1; i++) {
      const a = this.points[i];
      ab.subVectors(this.points[i + 1], a).setY(0);
      ap.set(p.x - a.x, 0, p.z - a.z);
      const t = THREE.MathUtils.clamp(ap.dot(ab) / Math.max(1e-6, ab.lengthSq()), 0, 1);
      const d = ap.addScaledVector(ab, -t).lengthSq();
      if (d < best) {
        best = d;
        bestS = this.cum[i] + t * (this.cum[i + 1] - this.cum[i]);
      }
    }
    return bestS;
  }
}

const SPEED = 1.25;
const CHASE = 3.1;
const INVESTIGATE = 2.0;
const RANGE = 7.5;
const HALF_ANGLE = 0.44;
/** Close up it notices her in a much wider arc (no walking into someone it missed with the lamp). */
const NEAR = 1.9;
const NEAR_HALF_ANGLE = 1.25;
const EYE_HEIGHT = 1.42;
const LOOK_EVERY = 6.5;
const LOOK_FOR = 2.2;
const STUN_FOR = 6;
const GIVE_UP = 2.6;
/** The "!" shows this long before it can grab her. */
const GRAB_AFTER = 0.35;
/** Out of its reach: this long after the "!" (still seeing her), it fires its tether; it lands this fast. */
const TETHER_AFTER = 0.9;
const TETHER_FLIGHT = 0.45;
/** Within this of its rail, it rolls after her and grabs her rather than firing. */
const REACH = 1.15;

export class WatchSentry {
  readonly group = new THREE.Group();
  readonly collider: RAPIER.Collider;
  state: SentryState = 'patrol';
  /** 0..1: how sure it is that it saw someone. */
  suspicion = 0;
  /** Arc length along its track, and direction of travel (+1 / -1). */
  s: number;
  dir = 1;
  /** Times caught, stunned, and noises heard (tests). */
  catches = 0;
  stuns = 0;
  heard = 0;
  /** Sentries can be switched off (automated route tests). */
  enabled = true;
  /** How far its lamp reaches (a Watch on a rim, looking down, sees further). */
  readonly range: number;
  private readonly head = new THREE.Group();
  private readonly beam: THREE.Mesh;
  private readonly beamMat: THREE.ShaderMaterial;
  private readonly pool: THREE.Mesh;
  private readonly eyeMat: THREE.MeshStandardMaterial;
  private readonly icon: THREE.Sprite;
  private readonly iconTex: { canvas: HTMLCanvasElement; texture: THREE.CanvasTexture; shown: string };
  private readonly tether: THREE.Group;
  private readonly tetherLine: THREE.Mesh;
  private readonly tetherHook: THREE.Mesh;
  private patrolT = 0;
  private stateT = 0;
  private headYaw = 0;
  private unseenT = 0;
  private graceT = 0;
  private time = 0;
  /** Where it is going to look (investigate), and the tether in flight (0: none). */
  private targetS = 0;
  /** Where the noise it is looking for came from (null: it is searching where it lost her). */
  private noiseAt: THREE.Vector3 | null = null;
  private tetherT = 0;
  private readonly tetherTo = new THREE.Vector3();
  private readonly home: number;
  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();

  constructor(
    private readonly physics: Physics,
    m: MaterialLibrary,
    readonly track: SentryTrack,
    start: number,
    opts: { range?: number } = {},
  ) {
    this.s = this.home = start;
    this.range = opts.range ?? RANGE;
    const g = this.group;
    g.name = 'watch-sentry';
    // A drum on a single broad wheel, a riveted brass boiler, a domed iron head with one big lamp.
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = g) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      parent.add(mesh);
      return mesh;
    };
    const wheel = add(new THREE.CylinderGeometry(0.22, 0.22, 0.2, 24), m.ironDark, 0, 0.22, 0);
    wheel.rotation.z = Math.PI / 2;
    add(new THREE.CylinderGeometry(0.34, 0.38, 0.22, 24), m.ironDark, 0, 0.42, 0);
    add(new THREE.CylinderGeometry(0.31, 0.33, 0.62, 24), m.brass, 0, 0.84, 0);
    for (const y of [0.6, 0.84, 1.08]) add(new THREE.TorusGeometry(0.325, 0.022, 6, 28), m.ironDark, 0, y, 0).rotation.x = Math.PI / 2;
    add(new THREE.CylinderGeometry(0.06, 0.07, 0.42, 10), m.ironDark, 0, 1.15, -0.28);
    for (const s of [-1, 1]) {
      const arm = add(new THREE.CylinderGeometry(0.045, 0.04, 0.42, 10), m.iron, s * 0.38, 0.92, 0.06);
      arm.rotation.z = s * 0.5;
      add(new THREE.SphereGeometry(0.07, 12, 10), m.ironDark, s * 0.36, 1.08, 0.04);
      add(new THREE.SphereGeometry(0.06, 12, 10), m.brass, s * 0.47, 0.74, 0.1);
    }
    this.head.position.set(0, 1.2, 0);
    g.add(this.head);
    add(new THREE.SphereGeometry(0.25, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), m.ironDark, 0, 0, 0, this.head);
    add(new THREE.CylinderGeometry(0.25, 0.25, 0.12, 24), m.iron, 0, -0.05, 0, this.head);
    const capMat = new THREE.MeshStandardMaterial({ color: '#1f2c3a', roughness: 0.7 });
    add(new THREE.CylinderGeometry(0.3, 0.24, 0.13, 28), capMat, 0, 0.27, -0.02, this.head);
    add(new THREE.TorusGeometry(0.245, 0.018, 6, 28), m.brass, 0, 0.22, -0.02, this.head).rotation.x = Math.PI / 2;
    const visor = add(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 24, 1, false, -Math.PI / 2, Math.PI), m.ironDark, 0, 0.21, 0.08, this.head);
    visor.rotation.x = 0.18;
    visor.scale.set(1, 1, 0.8);
    add(new THREE.CircleGeometry(0.045, 12), m.brass, 0, 0.29, 0.255, this.head).rotation.x = -0.25;
    // Chest badge and a ring of cell keys on its belt.
    add(new THREE.CylinderGeometry(0.07, 0.07, 0.02, 6), m.brass, 0.12, 1.0, 0.31).rotation.x = Math.PI / 2;
    add(new THREE.TorusGeometry(0.07, 0.012, 6, 16), m.iron, -0.24, 0.55, 0.26).rotation.y = 0.6;
    for (const a of [-0.5, 0, 0.5]) {
      const key = add(new THREE.BoxGeometry(0.018, 0.11, 0.006), m.brass, -0.24 + Math.sin(a) * 0.05, 0.46, 0.27 + Math.cos(a) * 0.01);
      key.rotation.z = a;
    }
    this.eyeMat = new THREE.MeshStandardMaterial({ color: '#2a1a08', emissive: '#ffb347', emissiveIntensity: 2.4, roughness: 0.2 });
    add(new THREE.CylinderGeometry(0.11, 0.12, 0.08, 20), m.brass, 0, 0.06, 0.22, this.head).rotation.x = Math.PI / 2;
    add(new THREE.CircleGeometry(0.095, 20), this.eyeMat, 0, 0.06, 0.262, this.head);
    // The searchlight: a soft cone and a pool where it meets the ground.
    this.beamMat = beamMaterial();
    const beamLen = Math.min(9, this.range * 0.7);
    const cone = new THREE.ConeGeometry(Math.tan(HALF_ANGLE) * beamLen, beamLen, 24, 1, true);
    cone.translate(0, -beamLen / 2, 0);
    cone.rotateX(-Math.PI / 2);
    this.beam = new THREE.Mesh(cone, this.beamMat);
    this.beam.position.set(0, 0.06, 0.26);
    // Tipped down toward the ground ahead (the pool of light it throws).
    this.beam.rotation.x = 0.2;
    this.head.add(this.beam);
    this.pool = new THREE.Mesh(new THREE.CircleGeometry(1.1, 24), new THREE.MeshBasicMaterial({ map: glowSprite(), color: '#ffcf7a', transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.pool.rotation.x = -Math.PI / 2;
    g.add(this.pool);
    // "?" and "!" above its head.
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    this.iconTex = { canvas, texture, shown: '' };
    this.icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false, fog: false }));
    this.icon.position.set(0, 1.85, 0);
    this.icon.scale.setScalar(0.42);
    this.icon.visible = false;
    this.icon.renderOrder = 5;
    g.add(this.icon);
    track.parent.add(g);
    // The tether: a brass hook on a line, fired from its arm (drawn in world space).
    this.tether = new THREE.Group();
    this.tether.name = 'watch-tether';
    this.tether.visible = false;
    this.tetherLine = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 6), new THREE.MeshStandardMaterial({ color: '#c9b48a', roughness: 0.8 }));
    this.tetherHook = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.025, 6, 12, Math.PI * 1.4), m.brass);
    this.tether.add(this.tetherLine, this.tetherHook);
    let world: THREE.Object3D = track.parent;
    while (world.parent) world = world.parent;
    world.add(this.tether);
    this.collider = physics.cylinder({ x: 0, y: 0, z: 0 }, 0.75, 0.36);
    // Solid to Mara only: the camera passes through it, and so does its own sight ray.
    this.collider.setCollisionGroups(groups(Layer.WORLD, Layer.PLAYER));
    this.place();
  }

  /** Back to its round, far from where Mara comes back (after a catch, a respawn or a restart). */
  reset(s = this.home, dir = 1): void {
    this.s = s;
    this.dir = dir;
    this.state = 'patrol';
    this.suspicion = 0;
    this.patrolT = 0;
    this.stateT = 0;
    this.unseenT = 0;
    this.headYaw = 0;
    this.tetherT = 0;
    this.noiseAt = null;
    this.graceT = 3;
    this.place();
  }

  /** A ground pound landed at `at`: knocked out if it was close. */
  pound(at: THREE.Vector3Like): boolean {
    const p = this.position();
    if (Math.hypot(at.x - p.x, at.z - p.z) > 1.7 || Math.abs(at.y - p.y) > 1.6 || this.state === 'stunned') return false;
    this.state = 'stunned';
    this.stateT = 0;
    this.suspicion = 0;
    this.tetherT = 0;
    this.stuns++;
    return true;
  }

  /** A noise at `at`, heard up to `radius` away: it goes to look (unless already chasing or out cold). */
  hear(at: THREE.Vector3Like, radius: number): boolean {
    if (!this.enabled || this.state === 'alert' || this.state === 'stunned') return false;
    const p = this.position(this.tmp2);
    if (Math.hypot(at.x - p.x, at.z - p.z) > radius) return false;
    this.state = 'investigate';
    this.stateT = 0;
    this.targetS = this.track.nearest(at);
    this.noiseAt = new THREE.Vector3(at.x, at.y, at.z);
    this.suspicion = Math.max(this.suspicion, 0.12);
    this.heard++;
    return true;
  }

  /** Feet, in the world. */
  position(out = new THREE.Vector3()): THREE.Vector3 {
    this.track.local(this.s, out);
    const o = this.track.offset();
    if (o) out.add(o);
    return out;
  }

  /** Travel yaw: along the rail in the direction it is going. */
  private travelYaw(): number {
    const a = this.track.local(this.s - 0.05, this.tmp2);
    const ax = a.x;
    const az = a.z;
    const b = this.track.local(this.s + 0.05, this.tmp2);
    return Math.atan2((b.x - ax) * this.dir, (b.z - az) * this.dir);
  }

  /** Where it is looking (unit vector, world). */
  facing(out = new THREE.Vector3()): THREE.Vector3 {
    const yaw = this.travelYaw() + this.headYaw;
    return out.set(Math.sin(yaw), 0, Math.cos(yaw));
  }

  /** Signed distance along the track from `from` to `to` (the shorter way round a loop). */
  private along(from: number, to: number): number {
    const d = to - from;
    if (!this.track.loop) return d;
    const L = this.track.length;
    return ((((d + L / 2) % L) + L) % L) - L / 2;
  }

  /** Move toward arc length `target` at `speed`; true when there. */
  private moveToward(target: number, speed: number, dt: number): boolean {
    const d = this.along(this.s, target);
    if (Math.abs(d) < 0.05) return true;
    this.dir = d > 0 ? 1 : -1;
    this.s += this.dir * Math.min(Math.abs(d), speed * dt);
    return false;
  }

  /**
   * One fixed step. `chest`: Mara's chest; `inZone`: whether she is where this sentry can act (on
   * its deck, its lane, its green); `hidden`: she is in cover it cannot see into (tall grass).
   * Returns 'alert' the step it raises the alarm, 'caught' the step it gets her.
   */
  step(dt: number, chest: THREE.Vector3, inZone: boolean, exclude: RAPIER.Collider, hidden = false): 'alert' | 'caught' | null {
    this.time += dt;
    this.stateT += dt;
    this.graceT = Math.max(0, this.graceT - dt);
    let event: 'alert' | 'caught' | null = null;
    if (!this.enabled) {
      this.place();
      return null;
    }
    if (this.state === 'stunned') {
      if (this.stateT > STUN_FOR) {
        this.state = 'patrol';
        this.stateT = 0;
      }
      this.headYaw += (0 - this.headYaw) * Math.min(1, dt * 2);
      this.place();
      return null;
    }
    const sees = inZone && this.graceT <= 0 && this.canSee(chest, exclude, hidden);
    // Suspicion: about 0.8 s right in front of it, 2.4 s at the edge of its range; drains unseen.
    if (sees) {
      const d = this.tmp.copy(chest).sub(this.eye()).length();
      this.suspicion = Math.min(1, this.suspicion + dt * (0.35 + 1.0 * Math.max(0, 1 - d / this.range)));
      this.unseenT = 0;
    } else {
      this.suspicion = Math.max(0, this.suspicion - dt * (this.state === 'alert' ? 0.15 : 0.45));
      this.unseenT += dt;
    }
    if (this.suspicion >= 1 && this.state !== 'alert') {
      this.state = 'alert';
      this.stateT = 0;
      this.tetherT = 0;
      event = 'alert';
    }
    if (this.state === 'alert') {
      // Roll after her along the rail (the shorter way), faster than she walks.
      const target = this.track.nearest(chest);
      if (inZone) this.moveToward(target, CHASE, dt);
      this.headYaw += (0 - this.headYaw) * Math.min(1, dt * 6);
      const p = this.position(this.tmp);
      const close = Math.hypot(chest.x - p.x, chest.z - p.z) < REACH && Math.abs(chest.y - (p.y + 1)) < 1.4;
      if (this.tetherT > 0) {
        // The tether is in flight: it lands where she is.
        this.tetherT += dt;
        this.tetherTo.copy(chest);
        if (this.tetherT >= TETHER_FLIGHT) {
          this.tetherT = 0;
          this.catches++;
          event = 'caught';
        }
      } else if (inZone && this.stateT > GRAB_AFTER && close) {
        this.catches++;
        event = 'caught';
      } else if (sees && this.stateT > TETHER_AFTER) {
        // Out of its reach and still in its lamp: it fires.
        this.tetherT = 1e-4;
        this.tetherTo.copy(chest);
      } else if (!sees && this.unseenT > GIVE_UP) {
        this.state = 'search';
        this.stateT = 0;
      }
    } else if (this.state === 'investigate') {
      // Off to where the noise was, a little faster than its round, lamp turned toward it; then a
      // look around. If it glimpses her on the way, it stops and stares instead.
      this.headYaw = dampYaw(this.headYaw, this.yawToward(this.noiseAt), dt * 4);
      if (this.suspicion < 0.2 && this.moveToward(this.targetS, INVESTIGATE, dt)) {
        this.state = 'search';
        this.stateT = 0;
      }
    } else if (this.state === 'search') {
      // Sweep the lamp round where the noise was (or straight ahead where it lost her).
      this.headYaw = dampYaw(this.headYaw, this.yawToward(this.noiseAt) + Math.sin(this.stateT * 2.4) * 0.7, dt * 6);
      if (this.stateT > 3.2 && this.suspicion < 0.05) {
        this.state = 'patrol';
        this.stateT = 0;
        this.suspicion = 0;
        this.noiseAt = null;
      }
    } else {
      // Patrol, stopping every few seconds to look back the way it came.
      this.patrolT += dt;
      if (this.state === 'patrol' && this.patrolT > LOOK_EVERY) {
        this.state = 'look';
        this.stateT = 0;
        this.patrolT = 0;
      }
      if (this.state === 'look') {
        const k = Math.min(1, this.stateT / 0.5) * Math.min(1, Math.max(0, (LOOK_FOR - this.stateT) / 0.5));
        this.headYaw = Math.PI * k;
        if (this.stateT > LOOK_FOR) {
          this.state = 'patrol';
          this.stateT = 0;
        }
      } else if (this.suspicion > 0.05) {
        // Something caught its eye: it stops and stares.
        this.headYaw += (0 - this.headYaw) * Math.min(1, dt * 4);
      } else {
        this.s += this.dir * SPEED * dt;
        // The end of a line: turn round (and have a look back down it).
        if (!this.track.loop && (this.s <= 0 || this.s >= this.track.length)) {
          this.s = THREE.MathUtils.clamp(this.s, 0, this.track.length);
          this.dir = -this.dir;
          this.state = 'look';
          this.stateT = LOOK_FOR * 0.5;
          this.patrolT = 0;
        }
        this.headYaw = Math.sin(this.time * 0.8) * 0.3;
      }
    }
    if (this.track.loop) this.s = ((this.s % this.track.length) + this.track.length) % this.track.length;
    this.place();
    return event;
  }

  /** Head yaw (relative to travel) that points the lamp at `p`; 0 for none. */
  private yawToward(p: THREE.Vector3 | null): number {
    if (!p) return 0;
    const me = this.position(this.tmp2);
    const yaw = Math.atan2(p.x - me.x, p.z - me.z) - this.travelYaw();
    return Math.atan2(Math.sin(yaw), Math.cos(yaw));
  }

  private eye(out = new THREE.Vector3()): THREE.Vector3 {
    const p = this.position(out);
    return p.setY(p.y + EYE_HEIGHT);
  }

  private canSee(chest: THREE.Vector3, exclude: RAPIER.Collider, hidden = false): boolean {
    const eye = this.eye(new THREE.Vector3());
    const to = chest.clone().sub(eye);
    const d = to.length();
    if (d > this.range || d < 0.05) return false;
    // In tall grass it only notices her when it all but bumps into her.
    if (hidden && d > 1.3) return false;
    to.divideScalar(d);
    const f = this.facing(new THREE.Vector3());
    const flat = Math.hypot(to.x, to.z);
    if (flat < 1e-3) return false;
    const cos = (to.x * f.x + to.z * f.z) / flat;
    if (cos < Math.cos(d * flat < NEAR ? NEAR_HALF_ANGLE : HALF_ANGLE)) return false;
    // Solid things (the column, walls, cottages, hedges) block its sight; railings and bars do not.
    // The ray starts just outside its own body.
    const start = eye.clone().addScaledVector(to, 0.45);
    if (d < 0.8) return true;
    const hit = this.physics.raycast(start, to, d - 0.75, groups(Layer.CAMERA_QUERY, Layer.WORLD), exclude);
    return !hit;
  }

  private place(): void {
    const p = this.track.local(this.s, this.tmp);
    this.group.position.copy(p);
    this.group.rotation.y = this.travelYaw();
    const o = this.track.offset();
    this.collider.setTranslation({ x: p.x + (o?.x ?? 0), y: p.y + (o?.y ?? 0) + 0.76, z: p.z + (o?.z ?? 0) });
    // A switched-off sentry is not there at all (automated route tests).
    if (this.collider.isEnabled() !== this.enabled) this.collider.setEnabled(this.enabled);
  }

  /** Animate (render rate): head, lamp colour, beam, pool, the "?" / "!", the tether. */
  update(): void {
    const stunned = this.state === 'stunned';
    const alert = this.state === 'alert';
    const visible = this.enabled;
    this.group.visible = visible;
    if (!visible) {
      this.tether.visible = false;
      return;
    }
    this.head.rotation.y = this.headYaw + (stunned ? Math.sin(this.time * 9) * 0.1 : 0);
    this.head.rotation.x = stunned ? 0.45 : 0;
    const wary = this.suspicion > 0.05 || this.state === 'investigate' || this.state === 'search';
    const color = alert ? '#ff3a24' : wary ? '#ffd24a' : '#ffb347';
    this.eyeMat.emissive.set(color);
    this.eyeMat.emissiveIntensity = stunned ? 0.15 + Math.abs(Math.sin(this.time * 13)) * 0.4 : alert ? 3.2 : 2.4;
    this.beamMat.uniforms.color.value.set(alert ? '#ff6a4a' : '#ffcf7a');
    this.beamMat.uniforms.opacity.value = stunned ? 0 : alert ? 0.34 : 0.22;
    this.beam.visible = !stunned;
    (this.pool.material as THREE.MeshBasicMaterial).opacity = stunned ? 0 : 0.22;
    (this.pool.material as THREE.MeshBasicMaterial).color.set(alert ? '#ff6a4a' : '#ffcf7a');
    const ahead = 2.6;
    this.pool.position.set(Math.sin(this.headYaw) * ahead, 0.02, Math.cos(this.headYaw) * ahead);
    const mark = stunned ? 'z' : alert ? '!' : wary ? '?' : '';
    this.icon.visible = mark !== '';
    if (mark !== this.iconTex.shown) this.drawIcon(mark);
    this.icon.material.opacity = mark === '?' ? 0.35 + Math.max(this.suspicion, this.state === 'investigate' ? 0.4 : 0) * 0.65 : 1;
    this.icon.scale.setScalar(mark === '!' ? 0.5 + Math.sin(this.time * 14) * 0.03 : 0.42);
    // The tether: from its arm to where it is going, unreeling over the flight.
    this.tether.visible = this.tetherT > 0;
    if (this.tetherT > 0) {
      const from = this.position(new THREE.Vector3()).add(new THREE.Vector3(0, 1.0, 0));
      const k = Math.min(1, this.tetherT / TETHER_FLIGHT);
      const to = from.clone().lerp(this.tetherTo, k);
      const len = from.distanceTo(to);
      this.tetherLine.position.copy(from).add(to).multiplyScalar(0.5);
      this.tetherLine.scale.set(1, Math.max(0.01, len), 1);
      if (len > 1e-3) this.tetherLine.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
      this.tetherHook.position.copy(to);
      this.tetherHook.rotation.y = this.time * 20;
    }
  }

  private drawIcon(mark: string): void {
    const { canvas, texture } = this.iconTex;
    const g = canvas.getContext('2d')!;
    g.clearRect(0, 0, 128, 128);
    if (mark) {
      g.fillStyle = mark === '!' ? '#ff3a24' : mark === 'z' ? '#9fc4e6' : '#ffc24a';
      g.beginPath();
      g.arc(64, 64, 52, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = 8;
      g.strokeStyle = '#1a0d06';
      g.stroke();
      g.fillStyle = '#1a0d06';
      g.font = 'bold 76px Georgia, serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(mark, 64, 70);
    }
    texture.needsUpdate = true;
    this.iconTex.shown = mark;
  }
}

/** Turn an angle toward a target the short way round, at most `k` (0..1) of the way per call. */
function dampYaw(from: number, to: number, k: number): number {
  const d = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + d * Math.min(1, k);
}

/** The searchlight cone: additive, strongest at the lamp, fading along its length and at its rim. */
function beamMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color('#ffcf7a') }, opacity: { value: 0.22 } },
    vertexShader: /* glsl */ `
      varying float vAlong;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vAlong = uv.y;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 color;
      uniform float opacity;
      varying float vAlong;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float facing = abs(dot(normalize(vNormal), normalize(vView)));
        float a = opacity * pow(vAlong, 1.6) * pow(facing, 1.4);
        gl_FragColor = vec4(color * a, a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}
