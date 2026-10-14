import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { clamp, damp, dampAngle, lerp, wrapAngle } from '../core/math';
import { addRimLight, Palette } from '../world/materials';
import type { TextureLibrary } from '../world/textures';
import { paintedTextTexture } from '../world/textures';
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
  /** World point Wren glances at (nearby interactable), or null. */
  lookAt: THREE.Vector3 | null;
}

const SKIN = '#e2a888';
const SMOCK = '#8296a6';
const TROUSERS = '#3a4352';
const BOOTS = '#3b2a22';
const HAIR = '#2f1f1a';

function capsule(radius: number, length: number, mat: THREE.Material): THREE.Mesh {
  const g = new THREE.CapsuleGeometry(radius, length, 6, 12);
  g.translate(0, -length / 2 - radius * 0.5, 0);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  return m;
}

/**
 * Wren: a procedurally built and animated character. No skeletal assets yet; joints are groups
 * driven by code so the animation always matches the controller state exactly.
 */
export class PlayerAvatar {
  readonly root = new THREE.Group();
  readonly carryAnchor = new THREE.Object3D();
  private readonly visual = new THREE.Group();
  private readonly hips = new THREE.Group();
  private readonly spine = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly legs: Array<{ thigh: THREE.Group; knee: THREE.Group; foot: THREE.Group }> = [];
  private readonly arms: Array<{ shoulder: THREE.Group; elbow: THREE.Group }> = [];
  private readonly ponytail = new THREE.Group();
  private readonly materials: THREE.MeshStandardMaterial[] = [];
  private readonly scarf: Scarf;
  private readonly neckAnchor = new THREE.Object3D();

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
  private tailSwing = 0;
  private tailVel = 0;
  private opacity = 1;

  /** Called when a foot plants; used for footstep audio. */
  onFootstep: ((speed: number) => void) | null = null;

  constructor(scene: THREE.Scene, tex: TextureLibrary) {
    const mat = (color: string, params: THREE.MeshStandardMaterialParameters = {}) => {
      const m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...params });
      addRimLight(m, Palette.moon, 0.35, 3);
      this.materials.push(m);
      return m;
    };
    const skin = mat(SKIN, { roughness: 0.7 });
    const smock = mat(SMOCK, { map: tex.smock.map, normalMap: tex.smock.normalMap });
    const trousers = mat(TROUSERS, { map: tex.smock.map });
    const boots = mat(BOOTS, { roughness: 0.6 });
    const hair = mat(HAIR, { roughness: 0.65 });
    const scarfMat = mat(Palette.scarf.getStyle(), { map: tex.wool.map, normalMap: tex.wool.normalMap, roughness: 1 });
    const dark = mat('#1a1414', { roughness: 0.3 });
    const leather = mat('#4a3324', { roughness: 0.55 });

    this.root.add(this.visual);
    this.visual.add(this.hips);
    this.hips.position.y = 0.82;

    // Torso: a smock built as a lathe so it flares at the hem.
    const profile = [
      [0.205, -0.16],
      [0.215, -0.06],
      [0.19, 0.06],
      [0.2, 0.2],
      [0.215, 0.3],
      [0.19, 0.38],
      [0.1, 0.44],
      [0.0, 0.45],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const torsoGeo = new THREE.LatheGeometry(profile, 20);
    torsoGeo.scale(1, 1, 0.78);
    const torso = new THREE.Mesh(torsoGeo, smock);
    torso.castShadow = true;
    this.hips.add(this.spine);
    this.spine.position.y = 0.04;
    this.spine.add(torso);
    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.196, 0.022, 6, 24), leather);
    belt.rotation.x = Math.PI / 2;
    belt.scale.set(1, 0.78, 1);
    belt.position.y = 0.04;
    this.spine.add(belt);
    // Prisoner number on the back.
    const numberMat = new THREE.MeshStandardMaterial({ map: paintedTextTexture('09', { w: 128, h: 96, color: 'rgba(30,34,40,0.9)', seed: 9 }), transparent: true, roughness: 1 });
    this.materials.push(numberMat);
    const number = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.13), numberMat);
    number.position.set(0, 0.24, -0.163);
    number.rotation.y = Math.PI;
    this.spine.add(number);

    // Legs.
    for (const side of [-1, 1]) {
      const thigh = new THREE.Group();
      thigh.position.set(side * 0.1, -0.02, 0);
      this.hips.add(thigh);
      thigh.add(capsule(0.085, 0.24, trousers));
      const knee = new THREE.Group();
      knee.position.y = -0.37;
      thigh.add(knee);
      knee.add(capsule(0.07, 0.24, trousers));
      const foot = new THREE.Group();
      foot.position.y = -0.36;
      knee.add(foot);
      const boot = new THREE.Mesh(new RoundedBoxGeometry(0.13, 0.11, 0.24, 2, 0.04), boots);
      boot.position.set(0, -0.025, 0.035);
      boot.castShadow = true;
      foot.add(boot);
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.078, 0.08, 0.07, 12), boots);
      cuff.position.y = 0.04;
      foot.add(cuff);
      this.legs.push({ thigh, knee, foot });
    }

    // Arms.
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.235, 0.36, 0);
      this.spine.add(shoulder);
      shoulder.add(capsule(0.068, 0.17, smock));
      const elbow = new THREE.Group();
      elbow.position.y = -0.27;
      shoulder.add(elbow);
      const cuffRing = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.022, 6, 14), smock);
      cuffRing.rotation.x = Math.PI / 2;
      cuffRing.position.y = -0.02;
      elbow.add(cuffRing);
      elbow.add(capsule(0.052, 0.15, skin));
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), skin);
      hand.scale.set(0.85, 1.1, 0.9);
      hand.position.y = -0.26;
      hand.castShadow = true;
      elbow.add(hand);
      this.arms.push({ shoulder, elbow });
    }

    // Head.
    this.spine.add(this.head);
    this.head.position.y = 0.55;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.12, 10), skin);
    neck.position.y = -0.09;
    this.head.add(neck);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.175, 24, 18), skin);
    skull.scale.set(1, 1.08, 1.02);
    skull.position.y = 0.06;
    skull.castShadow = true;
    this.head.add(skull);
    const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.19, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.56), hair);
    hairCap.position.set(0, 0.075, -0.012);
    hairCap.rotation.x = -0.32;
    hairCap.castShadow = true;
    this.head.add(hairCap);
    for (let i = 0; i < 5; i++) {
      const lock = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), hair);
      const a = (i - 2) * 0.32;
      lock.position.set(Math.sin(a) * 0.15, 0.15 - Math.abs(i - 2) * 0.012, Math.cos(a) * 0.13);
      lock.scale.set(1.1, 0.55, 0.7);
      lock.rotation.z = -a * 0.6;
      this.head.add(lock);
    }
    // Side locks framing the face.
    for (const side of [-1, 1]) {
      const lock = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.12, 4, 8), hair);
      lock.position.set(side * 0.165, 0.0, 0.05);
      lock.rotation.z = side * 0.12;
      this.head.add(lock);
    }
    this.ponytail.position.set(0, 0.16, -0.16);
    this.head.add(this.ponytail);
    const tie = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), scarfMat);
    this.ponytail.add(tie);
    const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.16, 4, 8), hair);
    tail.geometry.translate(0, -0.1, 0);
    tail.rotation.x = 0.35;
    tail.castShadow = true;
    this.ponytail.add(tail);
    // Face.
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.024, 10, 8), dark);
      eye.scale.set(0.8, 1.2, 0.5);
      eye.position.set(side * 0.062, 0.055, 0.166);
      this.head.add(eye);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.012, 0.012), hair);
      brow.position.set(side * 0.064, 0.105, 0.165);
      brow.rotation.z = side * -0.12;
      this.head.add(brow);
    }
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), skin);
    nose.position.set(0, 0.02, 0.18);
    this.head.add(nose);

    // Knitted cowl and the scarf tails (simulated).
    const cowl = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.06, 8, 18), scarfMat);
    cowl.rotation.x = Math.PI / 2 + 0.15;
    cowl.position.y = 0.43;
    cowl.castShadow = true;
    this.spine.add(cowl);
    this.neckAnchor.position.set(0.06, 0.42, -0.13);
    this.spine.add(this.neckAnchor);
    this.scarf = new Scarf(scarfMat);
    scene.add(this.scarf.mesh);

    this.carryAnchor.position.set(0, 0.2, 0.36);
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
    this.scarf.mesh.visible = o > 0.02;
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
    if (s.grounded) this.phase += (dt * s.speed * Math.PI) / 1.25;
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
    // --- legs: air pose (rising tuck vs falling dangle)
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
      let sz = side * (0.07 + run * 0.12 + breath * 0.01);
      let ex = -(0.18 + run * 0.95);
      // Air: arms rise and spread.
      sx = lerp(sx, lerp(-0.25, -0.9, Math.max(0, rising)), this.airBlend);
      sz = lerp(sz, side * lerp(1.05, 0.45, Math.max(0, rising)), this.airBlend);
      ex = lerp(ex, -0.35, this.airBlend);
      // Carry: both hands in front of the chest.
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
    this.hips.position.y = 0.82 + bob * (1 - this.airBlend) - run * 0.02;
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
        targetPitch = clamp(-Math.atan2(s.lookAt.y - (s.feet.y + 1.45), Math.hypot(dx, dz)), -0.5, 0.5);
      }
    }
    this.headYaw = dampAngle(this.headYaw, targetYaw, 6, dt);
    this.headPitch = damp(this.headPitch, targetPitch, 6, dt);
    this.head.rotation.set(this.headPitch, this.headYaw - this.spine.rotation.y, 0);

    // Ponytail spring reacts to vertical motion and turning.
    const tailTarget = clamp(-s.verticalSpeed * 0.06, -0.5, 0.6) + run * 0.35;
    this.tailVel += ((tailTarget - this.tailSwing) * 90 - this.tailVel * 9) * dt;
    this.tailSwing += this.tailVel * dt;
    this.ponytail.rotation.x = this.tailSwing;
    this.ponytail.rotation.z = clamp(this.turnRate * 0.03, -0.4, 0.4);

    this.root.updateMatrixWorld(true);
    this.scarf.update(dt, this.neckAnchor, this.root, s.speed);
  }
}
