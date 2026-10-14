import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RAPIER, type Physics } from '../../physics/Physics';
import type { MovingPlatform } from '../../player/PlayerController';
import type { MaterialLibrary } from '../materials';
import { smoothstep } from '../../core/math';

/**
 * A rigid group of body-less colliders moved together by repositioning them each step.
 * Rapier's character controller treats fixed colliders as ordinary floor, but stalled when pressing
 * into colliders on kinematic bodies. The player is carried explicitly instead (MovingPlatform), and
 * these colliders are moved after the player each fixed step.
 */
class MovingColliders {
  private readonly items: Array<{ collider: RAPIER.Collider; local: { x: number; y: number; z: number } }> = [];
  private readonly origin = new THREE.Vector3();

  constructor(private readonly physics: Physics) {}

  add(desc: RAPIER.ColliderDesc, local: { x: number; y: number; z: number }, rotY = 0, opts?: { blocksCamera?: boolean }): RAPIER.Collider {
    if (rotY) {
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
      desc.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    }
    desc.setTranslation(this.origin.x + local.x, this.origin.y + local.y, this.origin.z + local.z);
    const collider = this.physics.fixed(desc, opts);
    this.items.push({ collider, local: { ...local } });
    return collider;
  }

  /** Change one collider's offset (e.g. park the gap bar out of the way). */
  setLocal(collider: RAPIER.Collider, local: { x: number; y: number; z: number }): void {
    const item = this.items.find((i) => i.collider === collider);
    if (item) item.local = { ...local };
    this.moveTo(this.origin);
  }

  moveTo(origin: THREE.Vector3Like): void {
    this.origin.set(origin.x, origin.y, origin.z);
    for (const { collider, local } of this.items) {
      collider.setTranslation({ x: origin.x + local.x, y: origin.y + local.y, z: origin.z + local.z });
    }
  }

  get colliders(): RAPIER.Collider[] {
    return this.items.map((i) => i.collider);
  }
}

/**
 * Slow piston platform: rests at the bottom, rises, rests at the top, sinks. Deterministic from
 * time, so its state is the same on every run and after any respawn.
 */
export class PistonPlatform implements MovingPlatform {
  readonly group = new THREE.Group();
  private readonly solids: MovingColliders;
  readonly stepDelta = new THREE.Vector3();
  private readonly ram: THREE.Mesh;
  private readonly pos = new THREE.Vector3();
  private readonly prevPos = new THREE.Vector3();
  /** Offset from `base` at the far end of travel (vertical by default). */
  private readonly travel = new THREE.Vector3();
  private time = 0;

  constructor(
    physics: Physics,
    m: MaterialLibrary,
    readonly base: THREE.Vector3,
    readonly rise: number,
    readonly size: { w: number; d: number },
    readonly timing = { rest: 2.2, travel: 2.6, phase: 0 },
    rotY = 0,
  ) {
    const deck = new THREE.Mesh(new RoundedBoxGeometry(size.w, 0.26, size.d, 2, 0.04), m.grate);
    deck.position.y = -0.13;
    deck.castShadow = deck.receiveShadow = true;
    const rim = new THREE.Mesh(new THREE.BoxGeometry(size.w + 0.08, 0.08, size.d + 0.08), m.brass);
    rim.position.y = -0.27;
    // Hazard-free edge marking: worn amber paint on the deck border, so the surface reads.
    const edge = new THREE.Mesh(new THREE.BoxGeometry(size.w - 0.02, 0.012, 0.08), new THREE.MeshStandardMaterial({ color: '#c89a3e', roughness: 0.8 }));
    for (const s of [-1, 1]) {
      const e = edge.clone();
      e.position.set(0, 0.002, s * (size.d / 2 - 0.06));
      this.group.add(e);
    }
    this.ram = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1, 14), new THREE.MeshStandardMaterial({ color: '#cfd6da', roughness: 0.15, metalness: 1 }));
    this.ram.geometry.translate(0, -0.5, 0);
    this.ram.position.y = -0.3;
    this.group.add(deck, rim, this.ram);
    this.group.rotation.y = rotY;
    this.travel.set(0, rise, 0);
    this.pos.copy(base);
    this.prevPos.copy(base);
    this.group.position.copy(base);
    this.solids = new MovingColliders(physics);
    this.solids.moveTo(base);
    this.solids.add(RAPIER.ColliderDesc.cuboid(size.w / 2, 0.13, size.d / 2), { x: 0, y: -0.13, z: 0 }, rotY);
  }

  get colliders(): RAPIER.Collider[] {
    return this.solids.colliders;
  }

  /** Move along an arbitrary offset instead of straight up (horizontal shuttles). */
  setTravel(offset: THREE.Vector3): void {
    this.travel.copy(offset);
    this.ram.visible = Math.abs(offset.y) > Math.hypot(offset.x, offset.z);
  }

  /** 0 at the start (bottom), 1 at the end (top). */
  heightAt(t: number): number {
    const { rest, travel, phase } = this.timing;
    const cycle = 2 * (rest + travel);
    const c = (((t + phase) % cycle) + cycle) % cycle;
    if (c < rest) return 0;
    if (c < rest + travel) return smoothstep(0, 1, (c - rest) / travel);
    if (c < 2 * rest + travel) return 1;
    return 1 - smoothstep(0, 1, (c - 2 * rest - travel) / travel);
  }

  get height(): number {
    return this.heightAt(this.time);
  }

  /** Advance the motion and publish this step's delta (before the player moves). */
  fixedUpdate(dt: number): void {
    this.time += dt;
    this.prevPos.copy(this.pos);
    this.pos.copy(this.base).addScaledVector(this.travel, this.height);
    this.stepDelta.subVectors(this.pos, this.prevPos);
  }

  /** Move the colliders to this step's pose (after the player has moved). */
  applyMotion(): void {
    this.solids.moveTo(this.pos);
  }

  render(alpha: number): void {
    this.group.position.lerpVectors(this.prevPos, this.pos, alpha);
    // A vertical ram reaches down to its floor socket at the base height.
    this.ram.scale.y = Math.max(0.05, this.group.position.y - this.base.y + 0.7);
  }
}

export type CollarMode = 'cycling' | 'braking' | 'held' | 'rising' | 'top';

/**
 * The Breathing Engine's collar: a railed ring deck around the tide-engine column that heaves up
 * and down with the engine. A gantry brake can catch it at boarding height; an onboard lever sends
 * it up to the top stop, where it latches. Every stable state is held until the player acts, so no
 * step depends on a second person or on precise timing.
 */
export class EngineCollar implements MovingPlatform {
  readonly group = new THREE.Group();
  private readonly solids: MovingColliders;
  readonly stepDelta = new THREE.Vector3();
  mode: CollarMode = 'cycling';
  private y: number;
  private prevY: number;
  private time = 0;
  private modeFrom = 0;
  private modeT = 0;
  readonly lamps: THREE.MeshStandardMaterial[] = [];
  onStop: ((mode: CollarMode) => void) | null = null;
  /** The level vetoes closing the gap while someone stands in it (never close a bar through a player). */
  canCloseGap: () => boolean = () => true;
  /** Closes the boarding gap whenever the collar is moving, so nobody steps off mid-ride. */
  readonly gapBar: RAPIER.Collider;
  /** The bar is parked far below the deck when open. */
  private gapClosed = true;
  private readonly gapBarLocal: { x: number; y: number; z: number };
  private readonly gapBarMesh: THREE.Mesh;

  /**
   * @param columnR radius of the engine column
   * @param width deck width (radial)
   * @param gapAngle direction (yaw) of the boarding gap in the outer railing
   * @param boardY deck height where the brake holds it (gantry level)
   * @param topY deck height of the top stop
   * @param cycle natural motion: centre, amplitude, period
   */
  constructor(
    physics: Physics,
    m: MaterialLibrary,
    readonly columnR: number,
    readonly width: number,
    readonly gapAngle: number,
    readonly boardY: number,
    readonly topY: number,
    readonly cycle = { centre: 0, amplitude: 3.0, period: 8.4 },
  ) {
    const rIn = columnR + 0.05;
    const rOut = columnR + width;
    const segs = 20;
    const deckGeo = new THREE.RingGeometry(rIn, rOut, 48, 1);
    deckGeo.rotateX(-Math.PI / 2);
    const deck = new THREE.Mesh(deckGeo, m.grate);
    deck.receiveShadow = true;
    const under = new THREE.Mesh(new THREE.CylinderGeometry(rOut, rOut, 0.3, 48, 1, true), m.ironDark.clone());
    (under.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    under.position.y = -0.15;
    const lip = new THREE.Mesh(new THREE.TorusGeometry(rOut, 0.07, 6, 48), m.brass);
    lip.rotation.x = Math.PI / 2;
    this.group.add(deck, under, lip);
    // Railing around the outer edge with a boarding gap facing the gantry.
    const gapHalf = 0.42; // radians
    const postGeo = new THREE.BoxGeometry(0.06, 1.05, 0.06);
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      if (Math.abs(angleDiff(a, gapAngle)) < gapHalf) continue;
      const post = new THREE.Mesh(postGeo, m.iron);
      post.position.set(Math.sin(a) * (rOut - 0.08), 0.52, Math.cos(a) * (rOut - 0.08));
      post.castShadow = true;
      this.group.add(post);
    }
    const railArc = new THREE.Mesh(new THREE.TorusGeometry(rOut - 0.08, 0.035, 6, 64, Math.PI * 2 - gapHalf * 2), m.iron);
    railArc.rotation.set(Math.PI / 2, 0, 0);
    railArc.rotation.z = -(gapAngle + gapHalf) + Math.PI / 2;
    railArc.position.y = 1.04;
    this.group.add(railArc);
    // Warning lamps that pulse while it moves.
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const mat = m.warningLamp.clone();
      mat.emissiveIntensity = 1.2;
      this.lamps.push(mat);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), mat);
      lamp.position.set(Math.sin(a) * (rOut + 0.02), -0.2, Math.cos(a) * (rOut + 0.02));
      this.group.add(lamp);
    }
    this.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });

    this.y = this.prevY = this.cycleY(0);
    this.group.position.y = this.y;
    this.solids = new MovingColliders(physics);
    this.solids.moveTo({ x: 0, y: this.y, z: 0 });
    // Ring collider: deck segments plus invisible rail walls (except at the boarding gap).
    const rMid = (rIn + rOut) / 2;
    const halfLen = rOut * Math.tan(Math.PI / segs) + 0.02;
    for (let i = 0; i < segs; i++) {
      const a = ((i + 0.5) / segs) * Math.PI * 2;
      this.solids.add(RAPIER.ColliderDesc.cuboid(halfLen, 0.15, (rOut - rIn) / 2), { x: Math.sin(a) * rMid, y: -0.15, z: Math.cos(a) * rMid }, a);
      if (Math.abs(angleDiff(a, gapAngle)) > gapHalf + 0.05) {
        this.solids.add(RAPIER.ColliderDesc.cuboid(halfLen, 1.2, 0.05), { x: Math.sin(a) * (rOut - 0.05), y: 1.2, z: Math.cos(a) * (rOut - 0.05) }, a, { blocksCamera: false });
      }
    }
    const gapLen = rOut * Math.sin(gapHalf) + 0.1;
    this.gapBarLocal = { x: Math.sin(gapAngle) * (rOut + 0.07), y: 1.2, z: Math.cos(gapAngle) * (rOut + 0.07) };
    this.gapBar = this.solids.add(RAPIER.ColliderDesc.cuboid(gapLen, 1.2, 0.05), this.gapBarLocal, gapAngle, { blocksCamera: false });
    // Visible safety chain across the gap while moving.
    this.gapBarMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, gapLen * 2, 6), m.brass);
    this.gapBarMesh.rotation.set(0, gapAngle, Math.PI / 2);
    this.gapBarMesh.position.set(Math.sin(gapAngle) * (rOut + 0.07), 0.95, Math.cos(gapAngle) * (rOut + 0.07));
    this.group.add(this.gapBarMesh);
  }

  private cycleY(t: number): number {
    return this.cycle.centre + Math.sin((t / this.cycle.period) * Math.PI * 2) * this.cycle.amplitude;
  }

  /** Normalised cycle speed sign: >0 rising. */
  get deckY(): number {
    return this.y;
  }

  /** Gantry brake: catch the collar and hold it at boarding height. */
  brake(): boolean {
    if (this.mode !== 'cycling') return false;
    this.mode = 'braking';
    this.modeFrom = this.y;
    this.modeT = 0;
    return true;
  }

  /** From the top stop, bring the collar back down to boarding height (gantry or deck lever). */
  callDown(): boolean {
    if (this.mode !== 'top') return false;
    this.mode = 'braking';
    this.modeFrom = this.y;
    this.modeT = 0;
    return true;
  }

  /** Onboard lever: ride to the top stop. */
  release(): boolean {
    if (this.mode !== 'held') return false;
    this.mode = 'rising';
    this.modeFrom = this.y;
    this.modeT = 0;
    return true;
  }

  /** Put the collar straight into a stable state (checkpoint restore / reset). */
  setMode(mode: 'cycling' | 'held' | 'top', time = 0): void {
    this.mode = mode;
    this.time = time;
    this.y = this.prevY = mode === 'held' ? this.boardY : mode === 'top' ? this.topY : this.cycleY(time);
    this.stepDelta.set(0, 0, 0);
    this.setGap(mode === 'cycling');
    this.applyMotion();
  }

  fixedUpdate(dt: number): void {
    this.time += dt;
    this.prevY = this.y;
    if (this.mode === 'cycling') {
      this.y = this.cycleY(this.time);
    } else if (this.mode === 'braking' || this.mode === 'rising') {
      const target = this.mode === 'braking' ? this.boardY : this.topY;
      const duration = Math.max(1.2, Math.abs(target - this.modeFrom) / (this.mode === 'braking' ? 2.2 : 2.6));
      this.modeT = Math.min(1, this.modeT + dt / duration);
      this.y = this.modeFrom + (target - this.modeFrom) * smoothstep(0, 1, this.modeT);
      if (this.modeT >= 1) {
        this.mode = this.mode === 'braking' ? 'held' : 'top';
        this.onStop?.(this.mode);
      }
    }
    this.stepDelta.set(0, this.y - this.prevY, 0);
    const open = this.mode === 'held' || this.mode === 'top';
    if (open && this.gapClosed) this.setGap(false);
    else if (!open && !this.gapClosed && this.canCloseGap()) this.setGap(true);
  }

  private setGap(closed: boolean): void {
    this.gapClosed = closed;
    const l = this.gapBarLocal;
    this.solids.setLocal(this.gapBar, closed ? l : { x: l.x, y: -60, z: l.z });
  }

  /** Move the colliders to this step's pose (after the player has moved). */
  applyMotion(): void {
    this.solids.moveTo({ x: 0, y: this.y, z: 0 });
  }

  get colliders(): RAPIER.Collider[] {
    return this.solids.colliders;
  }

  get gapIsClosed(): boolean {
    return this.gapClosed;
  }

  render(alpha: number, time: number): void {
    this.gapBarMesh.visible = this.gapClosed;
    this.group.position.y = this.prevY + (this.y - this.prevY) * alpha;
    const moving = this.mode === 'cycling' || this.mode === 'braking' || this.mode === 'rising';
    const glow = moving ? 0.6 + 1.4 * Math.max(0, Math.sin(time * 7)) : 0.5;
    for (const l of this.lamps) l.emissiveIntensity = glow;
  }
}

function angleDiff(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
