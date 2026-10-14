import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { clamp, damp, dampAngle, lerp, wrapAngle } from '../core/math';
import { addRimLight, Palette } from '../world/materials';
import type { TextureLibrary } from '../world/textures';
import { MOVEMENT } from './PlayerController';
import { Scarf } from './Scarf';

export interface AvatarState {
  feet: THREE.Vector3;
  facing: number;
  speed: number;
  verticalSpeed: number;
  grounded: boolean;
  carrying: boolean;
  /** 0..1 while an interaction reach animation plays. */
  reach: number;
  /** World point Mara glances at (nearby interactable), or null. */
  lookAt: THREE.Vector3 | null;
}

/** Mara Venn's palette: warm ochre jacket and coral scarf against the cold blue fortress. */
const COLORS = {
  skin: '#d39a78',
  shirt: '#c8c2b3',
  jacket: '#9a7444',
  trousers: '#2d3440',
  boots: '#43301f',
  sole: '#1c1612',
  hair: '#5a3424',
  leather: '#5b3d26',
};

/** Overall figure scale: built at natural proportions, scaled to ~1.68 m. */
const FIGURE_SCALE = 0.93;
const HIP_Y = 0.94;

function capsule(radius: number, length: number, mat: THREE.Material): THREE.Mesh {
  const g = new THREE.CapsuleGeometry(radius, length, 6, 12);
  g.translate(0, -length / 2 - radius * 0.5, 0);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  return m;
}

/**
 * Mara: a procedurally built and animated character (no skeletal assets yet). Joints are groups
 * driven by code, so animation always matches the controller state exactly. This is a stylised
 * proxy model, not final character art.
 */
export class PlayerAvatar {
  readonly root = new THREE.Group();
  readonly carryAnchor = new THREE.Object3D();
  private readonly visual = new THREE.Group();
  private readonly figure = new THREE.Group();
  private readonly hips = new THREE.Group();
  private readonly spine = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly legs: Array<{ thigh: THREE.Group; knee: THREE.Group; foot: THREE.Group }> = [];
  private readonly arms: Array<{ shoulder: THREE.Group; elbow: THREE.Group }> = [];
  private readonly bun = new THREE.Group();
  private readonly materials: THREE.MeshStandardMaterial[] = [];
  private readonly scarves: Scarf[] = [];
  private readonly scarfAnchors: THREE.Object3D[] = [];

  private phase = 0;
  private runBlend = 0;
  private airBlend = 0;
  private carryBlend = 0;
  private lastFacing = 0;
  private turnRate = 0;
  private stretch = 0;
  private stretchVel = 0;
  private headYaw = 0;
  private headPitch = 0;
  private time = 0;
  private bunSwing = 0;
  private bunVel = 0;
  private opacity = 1;

  /** Called when a foot plants; used for footstep audio. */
  onFootstep: ((speed: number) => void) | null = null;

  constructor(scene: THREE.Scene, tex: TextureLibrary) {
    const mat = (color: string, params: THREE.MeshStandardMaterialParameters = {}, rim = 0.35) => {
      const m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...params });
      addRimLight(m, Palette.moon, rim, 3);
      this.materials.push(m);
      return m;
    };
    const skin = mat(COLORS.skin, { roughness: 0.65 });
    const shirt = mat(COLORS.shirt, { map: tex.smock.map });
    const jacket = mat(COLORS.jacket, { map: tex.smock.map, normalMap: tex.smock.normalMap, side: THREE.DoubleSide });
    const trousers = mat(COLORS.trousers, { map: tex.smock.map });
    const boots = mat(COLORS.boots, { roughness: 0.55 });
    const sole = mat(COLORS.sole, { roughness: 0.9 });
    const hair = mat(COLORS.hair, { roughness: 0.55 }, 0.2);
    const scarfMat = mat(Palette.scarf.getStyle(), { map: tex.wool.map, normalMap: tex.wool.normalMap, roughness: 1, emissive: Palette.scarf, emissiveIntensity: 0.12 }, 0.5);
    const dark = mat('#161212', { roughness: 0.3 });
    const leather = mat(COLORS.leather, { roughness: 0.55 });
    const brass = mat('#b8924f', { roughness: 0.35, metalness: 0.85 });
    const steel = mat('#9aa3a8', { roughness: 0.3, metalness: 0.9 });

    this.root.add(this.visual);
    this.visual.add(this.figure);
    this.figure.scale.setScalar(FIGURE_SCALE);
    this.figure.add(this.hips);
    this.hips.position.y = HIP_Y;

    // ---- torso: shirt, cropped open jacket, collar, tool belt
    const lathe = (points: Array<[number, number]>, m: THREE.Material, phiStart = 0, phiLength = Math.PI * 2, depth = 0.74) => {
      const g = new THREE.LatheGeometry(
        points.map(([r, y]) => new THREE.Vector2(r, y)),
        22,
        phiStart,
        phiLength,
      );
      g.scale(1, 1, depth);
      const mesh = new THREE.Mesh(g, m);
      mesh.castShadow = true;
      return mesh;
    };
    this.hips.add(this.spine);
    this.spine.position.y = 0.04;
    const torsoPts: Array<[number, number]> = [
      [0.165, -0.13],
      [0.172, -0.03],
      [0.158, 0.1],
      [0.172, 0.24],
      [0.19, 0.36],
      [0.17, 0.44],
      [0.085, 0.5],
      [0.0, 0.51],
    ];
    this.spine.add(lathe(torsoPts, shirt));
    // The jacket opens at the front (phi = 0 faces +Z) and stops at the waist: "cropped".
    const jacketPts: Array<[number, number]> = [
      [0.183, 0.04],
      [0.178, 0.12],
      [0.19, 0.24],
      [0.207, 0.36],
      [0.188, 0.445],
      [0.11, 0.49],
    ];
    this.spine.add(lathe(jacketPts, jacket, 0.42, Math.PI * 2 - 0.84, 0.78));
    for (const side of [-1, 1]) {
      const collar = new THREE.Mesh(new RoundedBoxGeometry(0.1, 0.09, 0.03, 1, 0.012), jacket);
      collar.position.set(side * 0.07, 0.49, 0.1);
      collar.rotation.set(-0.5, side * 0.35, side * -0.25);
      this.spine.add(collar);
    }
    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.168, 0.026, 6, 24), leather);
    belt.rotation.x = Math.PI / 2;
    belt.scale.set(1, 0.76, 1);
    belt.position.y = 0.0;
    const buckle = new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.05, 0.02, 1, 0.006), brass);
    buckle.position.set(0, 0.0, 0.13);
    this.spine.add(belt, buckle);
    // Pouches and a wrench on the tool belt.
    for (const [x, z, ry] of [
      [0.15, 0.04, 0.5],
      [-0.14, -0.06, -0.7],
      [0.05, -0.13, Math.PI],
    ]) {
      const pouch = new THREE.Mesh(new RoundedBoxGeometry(0.08, 0.1, 0.05, 2, 0.015), leather);
      pouch.position.set(x, -0.045, z);
      pouch.rotation.y = ry;
      pouch.castShadow = true;
      this.spine.add(pouch);
    }
    const wrench = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.16, 0.01), steel);
    shaft.position.y = -0.08;
    const jaw = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.009, 4, 10, Math.PI * 1.5), steel);
    jaw.position.y = -0.17;
    wrench.add(shaft, jaw);
    wrench.position.set(-0.17, -0.01, 0.07);
    wrench.rotation.set(0.1, 0.6, 0.12);
    this.spine.add(wrench);

    // ---- legs
    for (const side of [-1, 1]) {
      const thigh = new THREE.Group();
      thigh.position.set(side * 0.095, -0.03, 0);
      this.hips.add(thigh);
      thigh.add(capsule(0.085, 0.29, trousers));
      const knee = new THREE.Group();
      knee.position.y = -0.42;
      thigh.add(knee);
      knee.add(capsule(0.07, 0.3, trousers));
      const foot = new THREE.Group();
      foot.position.y = -0.41;
      knee.add(foot);
      const boot = new THREE.Mesh(new RoundedBoxGeometry(0.125, 0.12, 0.26, 2, 0.045), boots);
      boot.position.set(0, -0.03, 0.04);
      boot.castShadow = true;
      const soleMesh = new THREE.Mesh(new RoundedBoxGeometry(0.13, 0.03, 0.27, 1, 0.01), sole);
      soleMesh.position.set(0, -0.085, 0.04);
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.082, 0.09, 12), boots);
      cuff.position.y = 0.04;
      foot.add(boot, soleMesh, cuff);
      this.legs.push({ thigh, knee, foot });
    }

    // ---- arms: jacket sleeves pushed up, bare forearms
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.205, 0.42, 0);
      this.spine.add(shoulder);
      const pad = new THREE.Mesh(new THREE.SphereGeometry(0.072, 12, 10), jacket);
      pad.scale.set(1, 0.85, 1);
      shoulder.add(pad, capsule(0.062, 0.19, jacket));
      const elbow = new THREE.Group();
      elbow.position.y = -0.28;
      shoulder.add(elbow);
      const cuffRing = new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.026, 6, 14), jacket);
      cuffRing.rotation.x = Math.PI / 2;
      cuffRing.position.y = 0.0;
      elbow.add(cuffRing);
      elbow.add(capsule(0.048, 0.16, skin));
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), skin);
      hand.scale.set(0.85, 1.15, 0.95);
      hand.position.y = -0.25;
      hand.castShadow = true;
      elbow.add(hand);
      this.arms.push({ shoulder, elbow });
    }

    // ---- head
    this.spine.add(this.head);
    this.head.position.y = 0.6;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.062, 0.12, 10), skin);
    neck.position.y = -0.08;
    this.head.add(neck);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.135, 24, 18), skin);
    skull.scale.set(0.94, 1.08, 1.0);
    skull.position.y = 0.07;
    skull.castShadow = true;
    const jaw2 = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 10), skin);
    jaw2.scale.set(0.95, 0.75, 0.95);
    jaw2.position.set(0, 0.0, 0.02);
    this.head.add(skull, jaw2);
    // Hair: a close cap, swept fringe, and a bun at the back.
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.145, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);
    cap.scale.set(0.98, 1.05, 1.04);
    cap.position.set(0, 0.085, -0.012);
    cap.rotation.x = -0.38;
    cap.castShadow = true;
    this.head.add(cap);
    const fringe = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), hair);
    fringe.scale.set(1.5, 0.5, 0.7);
    fringe.position.set(0.04, 0.16, 0.085);
    fringe.rotation.set(0.2, 0, -0.35);
    const fringe2 = fringe.clone();
    fringe2.scale.set(1.0, 0.45, 0.6);
    fringe2.position.set(-0.07, 0.15, 0.09);
    fringe2.rotation.set(0.25, 0, 0.3);
    this.head.add(fringe, fringe2);
    for (const side of [-1, 1]) {
      const lock = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.07, 4, 8), hair);
      lock.position.set(side * 0.122, 0.06, 0.025);
      lock.rotation.z = side * 0.12;
      this.head.add(lock);
    }
    this.bun.position.set(0, 0.13, -0.125);
    this.head.add(this.bun);
    const bunBall = new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 10), hair);
    bunBall.scale.set(1.15, 0.85, 0.8);
    bunBall.position.set(0, 0.02, -0.03);
    bunBall.castShadow = true;
    const tie = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.012, 6, 12), scarfMat);
    tie.rotation.x = Math.PI / 2.4;
    this.bun.add(bunBall, tie);
    // Face.
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), dark);
      eye.scale.set(0.85, 1.25, 0.5);
      eye.position.set(side * 0.047, 0.065, 0.122);
      this.head.add(eye);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.011, 0.012), hair);
      brow.position.set(side * 0.049, 0.103, 0.124);
      brow.rotation.z = side * -0.1;
      this.head.add(brow);
    }
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), skin);
    nose.scale.set(0.9, 1.1, 1.1);
    nose.position.set(0, 0.03, 0.134);
    this.head.add(nose);

    // ---- coral scarf: a thick wrap with a knot, and two simulated tails
    const cowl = new THREE.Mesh(new THREE.TorusGeometry(0.098, 0.05, 8, 18), scarfMat);
    cowl.rotation.x = Math.PI / 2 + 0.18;
    cowl.position.set(0, 0.5, 0.01);
    cowl.castShadow = true;
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.048, 10, 8), scarfMat);
    knot.position.set(-0.07, 0.455, 0.09);
    this.spine.add(cowl, knot);
    for (const [x, z, len, width] of [
      [-0.075, 0.1, 7, 0.085],
      [-0.035, 0.115, 5, 0.07],
    ]) {
      const anchor = new THREE.Object3D();
      anchor.position.set(x, 0.44, z);
      this.spine.add(anchor);
      this.scarfAnchors.push(anchor);
      const scarf = new Scarf(scarfMat, len, width);
      this.scarves.push(scarf);
      scene.add(scarf.mesh);
    }

    this.carryAnchor.position.set(0, 0.24, 0.34);
    this.spine.add(this.carryAnchor);
    scene.add(this.root);
  }

  onJump(): void {
    this.stretchVel += 2.4;
  }

  onLand(impact: number): void {
    this.stretchVel -= clamp(impact * 0.22, 0.6, 3.6);
  }

  /** Fade the avatar when the camera gets very close so it never blocks the view. */
  setOpacity(o: number): void {
    if (Math.abs(o - this.opacity) < 0.01) return;
    this.opacity = o;
    for (const m of this.materials) {
      m.transparent = o < 0.999;
      m.opacity = o;
      m.depthWrite = o > 0.5;
    }
    this.root.visible = o > 0.02;
    for (const s of this.scarves) s.mesh.visible = o > 0.02;
  }

  update(dt: number, s: AvatarState): void {
    this.time += dt;
    this.root.position.set(s.feet.x, s.feet.y - 0.02, s.feet.z);
    this.root.rotation.y = s.facing;

    const speedN = clamp(s.speed / MOVEMENT.maxSpeed, 0, 1);
    this.runBlend = damp(this.runBlend, s.grounded ? speedN : this.runBlend * 0.6, 12, dt);
    this.airBlend = damp(this.airBlend, s.grounded ? 0 : 1, s.grounded ? 18 : 9, dt);
    this.carryBlend = damp(this.carryBlend, s.carrying ? 1 : 0, 10, dt);
    this.turnRate = damp(this.turnRate, wrapAngle(s.facing - this.lastFacing) / Math.max(dt, 1e-4), 8, dt);
    this.lastFacing = s.facing;

    // Stride phase advances with distance travelled, so feet don't slide.
    const prevPhase = this.phase;
    if (s.grounded) this.phase += (dt * s.speed * Math.PI) / 1.3;
    if (s.grounded && s.speed > 1 && Math.floor(prevPhase / Math.PI) !== Math.floor(this.phase / Math.PI)) {
      this.onFootstep?.(s.speed);
    }

    const run = this.runBlend;
    const A = lerp(0.12, 0.95, run);
    const sp = Math.sin(this.phase);
    const cp = Math.cos(this.phase);

    // --- legs: ground pose
    const ground = [
      { thigh: -sp * A, knee: 0.08 + Math.max(0, cp) * A * 1.35 },
      { thigh: sp * A, knee: 0.08 + Math.max(0, -cp) * A * 1.35 },
    ];
    // --- legs: air pose (rising tuck vs falling reach for the ground)
    const rising = clamp(s.verticalSpeed / 6, -1, 1);
    const air = [
      { thigh: lerp(-0.35, -1.05, Math.max(0, rising)), knee: lerp(0.5, 1.5, Math.max(0, rising)) },
      { thigh: lerp(0.15, 0.35, Math.max(0, rising)), knee: lerp(0.3, 0.55, Math.max(0, rising)) },
    ];
    for (let i = 0; i < 2; i++) {
      const leg = this.legs[i];
      leg.thigh.rotation.x = lerp(ground[i].thigh, air[i].thigh, this.airBlend);
      leg.knee.rotation.x = lerp(ground[i].knee, air[i].knee, this.airBlend);
      leg.foot.rotation.x = -(leg.thigh.rotation.x + leg.knee.rotation.x) * 0.7;
    }

    // --- arms
    const breath = Math.sin(this.time * 2.1);
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const arm = this.arms[i];
      const swing = (i === 0 ? sp : -sp) * A * 0.85;
      let sx = swing;
      let sz = side * (0.09 + run * 0.12 + breath * 0.01);
      let ex = -(0.2 + run * 0.95);
      // Air: arms rise and spread for balance.
      sx = lerp(sx, lerp(-0.25, -0.9, Math.max(0, rising)), this.airBlend);
      sz = lerp(sz, side * lerp(1.05, 0.45, Math.max(0, rising)), this.airBlend);
      ex = lerp(ex, -0.35, this.airBlend);
      sx = lerp(sx, -1.05, this.carryBlend);
      sz = lerp(sz, side * -0.18, this.carryBlend);
      ex = lerp(ex, -0.75, this.carryBlend);
      // Reach (right arm) for interactions.
      if (i === 1 && s.reach > 0) {
        const r = Math.sin(s.reach * Math.PI);
        sx = lerp(sx, -1.35, r);
        ex = lerp(ex, -0.15, r);
      }
      arm.shoulder.rotation.x = sx;
      arm.shoulder.rotation.z = sz;
      arm.elbow.rotation.x = ex;
    }

    // --- body
    const bob = (Math.abs(sp) * 0.055 - 0.02) * run;
    this.hips.position.y = HIP_Y + bob * (1 - this.airBlend) - run * 0.02;
    this.hips.rotation.y = -sp * 0.12 * run;
    this.spine.rotation.y = sp * 0.22 * run;
    this.spine.scale.y = 1 + breath * 0.012 * (1 - run);
    const lean = run * 0.14 + this.carryBlend * -0.05;
    this.visual.rotation.x = damp(this.visual.rotation.x, lean, 8, dt);
    this.visual.rotation.z = damp(this.visual.rotation.z, clamp(-this.turnRate * 0.035, -0.22, 0.22) * run, 8, dt);

    // Squash and stretch (critically damped spring around 0).
    const k = 160;
    const c = 2 * Math.sqrt(k) * 0.55;
    this.stretchVel += (-k * this.stretch - c * this.stretchVel) * dt;
    this.stretch = clamp(this.stretch + this.stretchVel * dt, -0.22, 0.18);
    this.visual.scale.set(1 - this.stretch * 0.5, 1 + this.stretch, 1 - this.stretch * 0.5);

    // --- head: glance at points of interest, otherwise idle look-around
    let targetYaw = Math.sin(this.time * 0.37) * 0.25 * (1 - run);
    let targetPitch = -0.05;
    if (s.lookAt) {
      const dx = s.lookAt.x - s.feet.x;
      const dz = s.lookAt.z - s.feet.z;
      const yaw = wrapAngle(Math.atan2(dx, dz) - s.facing);
      if (Math.abs(yaw) < 1.6) {
        targetYaw = clamp(yaw, -0.9, 0.9);
        targetPitch = clamp(-Math.atan2(s.lookAt.y - (s.feet.y + 1.5), Math.hypot(dx, dz)), -0.5, 0.5);
      }
    }
    this.headYaw = dampAngle(this.headYaw, targetYaw, 6, dt);
    this.headPitch = damp(this.headPitch, targetPitch, 6, dt);
    this.head.rotation.set(this.headPitch, this.headYaw - this.spine.rotation.y, 0);

    // Hair bun bobs on a spring with vertical motion and turns.
    const bunTarget = clamp(-s.verticalSpeed * 0.03, -0.25, 0.3) + run * 0.12;
    this.bunVel += ((bunTarget - this.bunSwing) * 120 - this.bunVel * 10) * dt;
    this.bunSwing += this.bunVel * dt;
    this.bun.rotation.x = this.bunSwing;
    this.bun.rotation.z = clamp(this.turnRate * 0.02, -0.25, 0.25);

    this.root.updateMatrixWorld(true);
    this.scarves.forEach((scarf, i) => scarf.update(dt, this.scarfAnchors[i], this.root, s.speed));
  }
}
