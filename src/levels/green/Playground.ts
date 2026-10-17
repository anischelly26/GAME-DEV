import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { LevelContext } from '../Level';
import type { InputFrame } from '../../core/Input';
import type { Ride, RideStep } from '../../player/PlayerController';
import { MOVEMENT } from '../../player/movement';
import { Batcher, worldBox, trs } from '../../world/geometry';
import { mulberry32 } from '../../core/math';
import { G } from './layout';

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/**
 * The slide's chute, measured from the model (scripts: the centre-line profile of slide.glb): model
 * x along the chute and the height of its bed, platform end first.
 */
const CHUTE_PROFILE: Array<[number, number]> = [
  [-1.68, 1.497], [-1.48, 1.326], [-1.28, 1.11], [-1.08, 0.91], [-0.88, 0.736], [-0.68, 0.581],
  [-0.48, 0.448], [-0.28, 0.324], [-0.08, 0.215], [0.12, 0.114], [0.3, 0.05],
];
/** The model's platform: back edge, front edge (model x) and height; chute centre (model z). */
const PLATFORM = { back: -2.2, front: -1.68, top: 1.504, centreZ: -1.66, halfWidth: 0.31 };

/** Sitting height: the toy hero's pelvis above her feet when seated (measured in the story test). */
const SEAT_PELVIS = 0.33;

/** Model point (x along the chute, y up, z across) to the world, as placed. */
function slideToWorld(x: number, y: number, z: number): THREE.Vector3 {
  const S = G.slide.scale;
  // The model's +x runs north (+z) down the chute; its platform back sits at G.slide.backZ.
  return v3(-S * (z - PLATFORM.centreZ), G.bowl.floorY + S * y, G.slide.backZ + S * (x - PLATFORM.back));
}

/** Going down the slide: gravity along the chute, a little friction, a launch off the end. */
export class SlideRide implements Ride {
  readonly pose = 'slide' as const;
  readonly curve: THREE.CatmullRomCurve3;
  readonly length: number;
  private s = 0;
  private speed = 0;
  private readonly p = new THREE.Vector3();
  private readonly t = new THREE.Vector3();
  onEnd: (() => void) | null = null;

  constructor() {
    this.curve = new THREE.CatmullRomCurve3(CHUTE_PROFILE.map(([x, y]) => slideToWorld(x, y + 0.03, PLATFORM.centreZ)));
    this.length = this.curve.getLength();
  }

  start(fromSpeed: number): void {
    this.s = 0;
    this.speed = Math.max(1.8, fromSpeed);
  }

  /** How far down the chute (0..1), for tests. */
  get progress(): number {
    return this.s / this.length;
  }

  /** Lying back a little going down. */
  readonly tilt = -0.35;

  step(dt: number, input: InputFrame): RideStep {
    const u = Math.min(1, this.s / this.length);
    this.curve.getTangentAt(u, this.t);
    this.speed = Math.min(9, this.speed + (-this.t.y * MOVEMENT.gravity * 0.75 - 1.2) * dt);
    this.speed = Math.max(this.speed, 1.5);
    this.s += this.speed * dt;
    this.curve.getPointAt(Math.min(1, this.s / this.length), this.p);
    const facing = Math.atan2(this.t.x, this.t.z);
    if (input.jumpPressed) {
      this.onEnd?.();
      return { feet: this.p.clone(), facing, release: this.t.clone().multiplyScalar(this.speed).setY(Math.sqrt(2 * MOVEMENT.gravity * 1.1)), jumped: true };
    }
    if (this.s >= this.length) {
      this.onEnd?.();
      // Off the end with a little hop, forward at the speed she reached.
      return { feet: this.p.clone(), facing, release: v3(this.t.x * this.speed, 2.2, this.t.z * this.speed) };
    }
    return { feet: this.p.clone(), facing };
  }
}

/** Up the slide's ladder: to its foot, up the rungs, over onto the platform. */
export class LadderRide implements Ride {
  readonly pose = 'ladder' as const;
  private t = 0;
  private readonly from = new THREE.Vector3();
  private readonly foot = slideToWorld(-2.62, 0, PLATFORM.centreZ).add(v3(0, 0, 0.32));
  private readonly top = slideToWorld(-2.32, 1.3, PLATFORM.centreZ).add(v3(0, 0, 0.34));
  private readonly over = slideToWorld(-1.95, PLATFORM.top + 0.01, PLATFORM.centreZ);

  start(feet: THREE.Vector3): void {
    this.t = 0;
    this.from.copy(feet);
  }

  step(dt: number): RideStep {
    this.t += dt;
    const p = new THREE.Vector3();
    // 0.35 s to the ladder's foot, 1.4 s up, 0.45 s over the top.
    if (this.t < 0.35) p.lerpVectors(this.from, this.foot, this.t / 0.35);
    else if (this.t < 1.75) p.lerpVectors(this.foot, this.top, (this.t - 0.35) / 1.4);
    else p.lerpVectors(this.top, this.over, Math.min(1, (this.t - 1.75) / 0.45));
    const facing = 0; // facing north, up the ladder toward the chute
    if (this.t >= 2.2) return { feet: this.over.clone(), facing, release: v3(0, -1, 0.5) };
    return { feet: p, facing };
  }
}

/**
 * A swing: a pendulum Mara sits on. Push the stick the way the swing is going to pump it higher (it
 * creaks louder as it goes, and the Watch may hear); jump to leap off with the swing's speed, plus a
 * kick. The leap from high on a forward swing reaches the fallen section of the sea wall.
 */
export class SwingRide implements Ride {
  readonly pose = 'swing' as const;
  /** Angle from straight down (+ toward +z, the wall) and angular speed. */
  theta = 0;
  omega = 0;
  /** Highest angle reached on this sit (tests, hints). */
  peak = 0;
  readonly pivot: THREE.Vector3;
  readonly chain: number;
  private readonly g = 14;
  /** Called each time the swing goes through the bottom fast enough to creak: how hard (0..1). */
  onCreak: ((loudness: number) => void) | null = null;
  onLeave: (() => void) | null = null;
  private readonly seat = new THREE.Vector3();

  constructor(pivot: THREE.Vector3, chain: number) {
    this.pivot = pivot;
    this.chain = chain;
  }

  /** She sits down: the swing keeps whatever motion it had (no snap). */
  sit(): void {
    this.peak = Math.abs(this.theta);
  }

  /** Back to hanging still (respawn, restart). */
  rest(): void {
    this.theta = 0;
    this.omega = 0;
    this.peak = 0;
  }

  /** Nobody on it: it swings on by itself and settles (an empty swing loses height quickly). */
  idle(dt: number): void {
    this.omega += (-(this.g / this.chain) * Math.sin(this.theta) - 1.0 * this.omega) * dt;
    this.theta += this.omega * dt;
  }

  /** Low and slow enough to climb on. */
  get settled(): boolean {
    return Math.abs(this.theta) < 0.45 && Math.abs(this.omega) < 1.6;
  }

  /** The seat's top surface, in the world. */
  seatAt(out = this.seat): THREE.Vector3 {
    return out.set(this.pivot.x, this.pivot.y - Math.cos(this.theta) * this.chain, this.pivot.z + Math.sin(this.theta) * this.chain);
  }

  step(dt: number, input: InputFrame, cameraYaw: number): RideStep {
    // The stick in the world, then along the swing (+z).
    const fz = -Math.cos(cameraYaw) * input.moveY + -Math.sin(cameraYaw) * input.moveX;
    const push = THREE.MathUtils.clamp(fz, -1, 1);
    const dir = Math.abs(this.omega) < 0.25 ? Math.sign(push) : Math.sign(this.omega);
    let accel = -(this.g / this.chain) * Math.sin(this.theta) - 0.12 * this.omega;
    // Pumping: pushing with the swing adds energy (more near the bottom, where it counts).
    if (push * dir > 0.2) accel += 2.6 * dir * Math.abs(push) * (0.4 + 0.6 * Math.cos(this.theta));
    const prev = this.theta;
    this.omega += accel * dt;
    this.theta += this.omega * dt;
    // The chains go slack past about 70 degrees: no higher.
    if (Math.abs(this.theta) > 1.22) {
      this.theta = Math.sign(this.theta) * 1.22;
      this.omega *= -0.15;
    }
    this.peak = Math.max(this.peak, Math.abs(this.theta));
    if (Math.sign(prev) !== Math.sign(this.theta) && Math.abs(this.omega) > 0.9) this.onCreak?.(THREE.MathUtils.clamp((Math.abs(this.omega) - 0.9) / 1.6, 0.15, 1));
    const seat = this.seatAt();
    const feet = seat.clone().setY(seat.y - SEAT_PELVIS);
    const facing = 0;
    if (input.jumpPressed) {
      // The seat's velocity, a kick, and a lift: going forward high, it carries her to the wall.
      const v = v3(0, Math.sin(this.theta) * this.omega * this.chain, Math.cos(this.theta) * this.omega * this.chain).multiplyScalar(1.35);
      v.y += 5.0;
      if (this.omega > 0) v.z += 1.4;
      this.onLeave?.();
      return { feet, facing, release: v, jumped: true };
    }
    if (input.interactPressed) {
      this.onLeave?.();
      return { feet, facing, release: v3(0, Math.sin(this.theta) * this.omega * this.chain, Math.cos(this.theta) * this.omega * this.chain) };
    }
    return { feet, facing };
  }

  /** Lean for the avatar: back along the chains. */
  get tilt(): number {
    return -this.theta;
  }
}

export interface Playground {
  readonly slide: SlideRide;
  readonly ladder: LadderRide;
  readonly swing: SwingRide;
  /** The slide's top: where stepping onto the chute starts the ride. */
  readonly chuteTop: THREE.Vector3;
  /** Where to stand to climb the ladder, and to sit on the swing. */
  readonly ladderFoot: THREE.Vector3;
  readonly swingSpot: THREE.Vector3;
  /** Inside the concrete pipe (hidden from the Watch). */
  readonly tunnel: { x0: number; x1: number; z0: number; z1: number };
  update(dt: number, time: number): void;
}

/** The sunken playground's things: the slide (CC BY model), the swings, the pipe, the roundabout. */
export function buildPlayground(ctx: LevelContext, slideGltf: GLTF | null): Playground {
  const { scene, physics, materials: m } = ctx;
  const root = new THREE.Group();
  root.name = 'playground';
  scene.add(root);
  const batch = new Batcher();
  const rng = mulberry32(88);
  const tint = (b = 1) => new THREE.Color(b + (rng() - 0.5) * 0.08, b + (rng() - 0.5) * 0.08, b + (rng() - 0.5) * 0.08);
  const B = G.bowl;
  const floor = B.floorY;
  const paint = (c: string) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, metalness: 0.3, map: m.iron.map, vertexColors: true });
  const red = paint('#9a3a2a');
  const blue = paint('#3a5f7a');
  const yellow = paint('#b08a2a');

  // ------------------------------------------------------------ the slide
  if (slideGltf) {
    const model = slideGltf.scene;
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = mesh.receiveShadow = true;
        const mat = mesh.material as THREE.MeshStandardMaterial;
        mat.side = THREE.DoubleSide;
      }
    });
    const holder = new THREE.Group();
    holder.add(model);
    model.position.set(-PLATFORM.back, 0, -PLATFORM.centreZ);
    holder.scale.setScalar(G.slide.scale);
    holder.rotation.y = -Math.PI / 2;
    holder.position.set(0, floor, G.slide.backZ);
    root.add(holder);
  } else {
    // Without the model (it failed to load): a plain stand-in so the route still works.
    const curve = new THREE.CatmullRomCurve3(CHUTE_PROFILE.map(([x, y]) => slideToWorld(x, y, PLATFORM.centreZ)));
    batch.add(new THREE.TubeGeometry(curve, 24, 0.45, 6, false), red, undefined, { tint: tint() });
  }
  const S = G.slide.scale;
  const platBack = slideToWorld(PLATFORM.back, PLATFORM.top, PLATFORM.centreZ);
  const platFront = slideToWorld(PLATFORM.front, PLATFORM.top, PLATFORM.centreZ);
  const halfW = PLATFORM.halfWidth * S;
  // Platform, its side rails, a plank from the rim, the corner posts.
  physics.box(v3(0, platBack.y - 0.05, (platBack.z + platFront.z) / 2), v3(halfW, 0.05, (platFront.z - platBack.z) / 2));
  physics.setSurface(physics.box(v3(0, 0.02, (B.z0 - 0.7 + platBack.z) / 2), v3(0.45, 0.03, (platBack.z - (B.z0 - 0.7)) / 2)), 'wood');
  batch.add(worldBox(0.9, 0.06, platBack.z - (B.z0 - 0.7) + 0.1, 3), m.wood, trs(0, 0.02, (B.z0 - 0.7 + platBack.z) / 2), { tint: tint(0.8) });
  for (const s of [-1, 1]) {
    physics.box(v3(s * (halfW + 0.04), platBack.y + 0.5, (platBack.z + platFront.z) / 2), v3(0.04, 0.5, (platFront.z - platBack.z) / 2 + 0.05), undefined, { blocksCamera: false });
    for (const z of [platBack.z + 0.06, platFront.z - 0.06]) physics.cylinder(v3(s * (halfW - 0.05), floor + (platBack.y - floor) / 2, z), (platBack.y - floor) / 2, 0.05);
  }
  // The chute: thin slabs following the bed (walkable up, too steep to stand still on at the top).
  const slideRide = new SlideRide();
  {
    const n = 8;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      slideRide.curve.getPointAt(i / n, a);
      slideRide.curve.getPointAt((i + 1) / n, b);
      a.y -= 0.03;
      b.y -= 0.03;
      const c = a.clone().add(b).multiplyScalar(0.5);
      const len = a.distanceTo(b);
      const pitch = Math.atan2(b.y - a.y, b.z - a.z);
      const q = new THREE.Quaternion().setFromAxisAngle(v3(1, 0, 0), -pitch);
      physics.setSurface(physics.box(c.clone().setY(c.y - 0.04 * Math.cos(pitch)), v3(halfW, 0.04, len / 2 + 0.02), q), 'metal');
      // Chute walls.
      for (const s of [-1, 1]) physics.box(c.clone().add(v3(s * (halfW + 0.03), 0.25, 0)), v3(0.03, 0.3, len / 2), q, { blocksCamera: false });
    }
  }
  const chuteTop = slideRide.curve.getPointAt(0);
  const ladder = new LadderRide();
  const ladderFoot = slideToWorld(-2.62, 0, PLATFORM.centreZ).add(v3(0, 0, 0.3));

  // ------------------------------------------------------------ the swings
  const sw = G.swing;
  const pivot = v3(sw.x, sw.barY, sw.z);
  const swingRide = new SwingRide(pivot, sw.chain + 0.15);
  const frameHalf = 2.5;
  // A-frame legs, the crossbar, ground anchors.
  for (const s of [-1, 1]) {
    for (const k of [-1, 1]) {
      const top = v3(s * frameHalf, sw.barY, sw.z);
      const foot = v3(s * (frameHalf + 0.25), floor, sw.z + k * 1.15);
      const d = top.clone().sub(foot);
      const q = new THREE.Quaternion().setFromUnitVectors(v3(0, 1, 0), d.clone().normalize());
      batch.add(new THREE.CylinderGeometry(0.06, 0.07, d.length(), 10), blue, new THREE.Matrix4().compose(foot.clone().addScaledVector(d, 0.5), q, v3(1, 1, 1)), { tint: tint() });
      physics.cylinder(foot.clone().addScaledVector(d, 0.5), d.length() / 2, 0.08);
    }
  }
  batch.add(new THREE.CylinderGeometry(0.07, 0.07, frameHalf * 2 + 0.3, 12), blue, trs(sw.x, sw.barY, sw.z, 0, 0, Math.PI / 2), { tint: tint() });
  // The two broken swings: chains wrapped round the bar, seats hanging high.
  for (const s of [-1, 1]) {
    const x = sw.x + s * 1.45;
    for (let k = 0; k < 5; k++) batch.add(new THREE.TorusGeometry(0.11, 0.014, 4, 10), m.iron, trs(x - 0.18 + k * 0.09, sw.barY, sw.z, Math.PI / 2, 0, 0), { castShadow: false });
    batch.add(worldBox(0.5, 0.05, 0.22, 3), red, trs(x, sw.barY - 0.55, sw.z + 0.05, 0, 0.6, 0.2 * s), { tint: tint(0.8) });
    for (const dx of [-0.2, 0.2]) batch.add(new THREE.CylinderGeometry(0.01, 0.01, 0.5, 4), m.iron, trs(x + dx, sw.barY - 0.3, sw.z, 0, 0.3, 0), { castShadow: false });
  }
  // The working swing: chains and seat move with the pendulum.
  const swing = new THREE.Group();
  swing.position.copy(pivot);
  const chainLen = swingRide.chain;
  for (const dx of [-0.24, 0.24]) {
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, chainLen, 5), m.iron);
    chain.position.set(dx, -chainLen / 2, 0);
    swing.add(chain);
    for (let k = 0; k < 10; k++) {
      const link = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 4, 8), m.iron);
      link.position.set(dx, -0.1 - k * (chainLen - 0.2) / 10, 0);
      link.rotation.y = k % 2 ? Math.PI / 2 : 0;
      swing.add(link);
    }
  }
  const seat = new THREE.Mesh(worldBox(0.62, 0.06, 0.26, 3), red);
  seat.position.set(0, -chainLen - 0.03, 0);
  seat.castShadow = true;
  swing.add(seat);
  root.add(swing);
  const swingSpot = v3(sw.x, floor, sw.z);

  // ------------------------------------------------------------ the pipe, roundabout, seesaw, sandpit
  const tunnel = { x0: -7.6, x1: -4.6, z0: 30.2, z1: 31.8 };
  {
    // A concrete drain pipe on its side: walk through it, hide in it.
    const r = 0.95;
    const len = tunnel.x1 - tunnel.x0;
    const cx = (tunnel.x0 + tunnel.x1) / 2;
    const cz = (tunnel.z0 + tunnel.z1) / 2;
    const pipe = new THREE.CylinderGeometry(r, r, len, 28, 1, true);
    const inner = new THREE.CylinderGeometry(r - 0.12, r - 0.12, len, 28, 1, true);
    inner.scale(-1, 1, 1);
    for (const g of [pipe, inner]) batch.add(g, m.stoneDark, trs(cx, floor + r - 0.05, cz, 0, 0, Math.PI / 2), { tint: tint(1.05) });
    const ring = new THREE.RingGeometry(r - 0.12, r, 28);
    for (const s of [-1, 1]) batch.add(ring, m.stoneDark, trs(cx + s * len / 2, floor + r - 0.05, cz, s * Math.PI / 2), { tint: tint(0.9) });
    // Colliders: a ring of slabs round the inside (the floor of it is walkable).
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      if (Math.abs(Math.sin(a)) < 0.2 && Math.cos(a) < 0) continue;
      const y = floor + r - 0.05 - Math.cos(a) * (r - 0.06);
      const z = cz + Math.sin(a) * (r - 0.06);
      const q = new THREE.Quaternion().setFromAxisAngle(v3(1, 0, 0), a);
      physics.box(v3(cx, y, z), v3(len / 2, 0.06, r * 0.27), q);
    }
    // A chalk drawing inside: a lighthouse and a stick figure, "PAPA KEEPS THE LIGHT".
  }
  {
    // The roundabout: a disc with grab rails, turning slowly in the wind.
    const rx = 5.4;
    const rz = 31.5;
    batch.add(new THREE.CylinderGeometry(0.2, 0.25, 0.35, 10), m.iron, trs(rx, floor + 0.17, rz));
    physics.cylinder(v3(rx, floor + 0.2, rz), 0.2, 1.35);
  }
  const roundabout = new THREE.Group();
  {
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.35, 0.08, 32), yellow);
    disc.position.y = 0.38;
    roundabout.add(disc);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const rail = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.025, 6, 16, Math.PI), red);
      rail.position.set(Math.sin(a) * 0.75, 0.42, Math.cos(a) * 0.75);
      rail.rotation.y = a + Math.PI / 2;
      roundabout.add(rail);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.9, 10), red);
    hub.position.y = 0.8;
    roundabout.add(hub);
    roundabout.position.set(5.4, floor, 31.5);
    roundabout.traverse((o) => (o.castShadow = true));
    root.add(roundabout);
  }
  {
    // The seesaw: one end down in the gravel, the other in the air.
    const sx = -5.0;
    const sz = 25.8;
    batch.add(worldBox(0.3, 0.5, 0.4, 3), m.iron, trs(sx, floor + 0.25, sz), { tint: tint(0.8) });
    batch.add(worldBox(0.32, 0.08, 3.6, 3), m.wood, trs(sx, floor + 0.5, sz, 0, -0.26, 0), { tint: tint(0.85) });
    for (const s of [-1, 1]) batch.add(new THREE.TorusGeometry(0.12, 0.02, 6, 12, Math.PI), red, trs(sx, floor + 0.62 - s * 0.42, sz + s * 1.45, 0, -0.26, 0));
    physics.box(v3(sx, floor + 0.3, sz), v3(0.2, 0.3, 0.25));
  }
  {
    // The sandpit: a timber frame round damp sand, a forgotten bucket.
    const px = 5.2;
    const pz = 25.6;
    for (const [w, d, x, z] of [
      [3.2, 0.2, 0, -1.4],
      [3.2, 0.2, 0, 1.4],
      [0.2, 2.6, -1.5, 0],
      [0.2, 2.6, 1.5, 0],
    ]) {
      batch.add(worldBox(w, 0.25, d, 3), m.wood, trs(px + x, floor + 0.12, pz + z), { tint: tint(0.75) });
      physics.box(v3(px + x, floor + 0.12, pz + z), v3(w / 2, 0.125, d / 2));
    }
    batch.add(worldBox(2.8, 0.1, 2.6, 2), new THREE.MeshStandardMaterial({ color: '#c9b38a', roughness: 1, map: m.floor.map, vertexColors: true }), trs(px, floor + 0.08, pz), { tint: tint(1) });
    batch.add(new THREE.CylinderGeometry(0.12, 0.09, 0.2, 10), red, trs(px + 0.6, floor + 0.2, pz - 0.3, 0, 0.3, 1.2));
  }
  batch.build(root);
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.receiveShadow = true;
  });

  let roundT = 0;
  return {
    slide: slideRide,
    ladder,
    swing: swingRide,
    chuteTop,
    ladderFoot,
    swingSpot,
    tunnel,
    update(dt, time) {
      // The swing hangs (or swings with Mara); the roundabout turns a little in the wind.
      swing.rotation.x = -swingRide.theta;
      roundT += dt * (0.12 + 0.08 * Math.sin(time * 0.3));
      roundabout.rotation.y = roundT;
    },
  };
}
