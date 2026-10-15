import * as THREE from 'three';
import type { MaraRig } from '../character/MaraModel';
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
  /** Traversal mode from the controller, and its progress (seconds for hang, 0..1 otherwise). */
  mode?: 'move' | 'hang' | 'climb' | 'vault';
  modeT?: number;
}

// Brighter than the knit wrap's base colour because the wool texture darkens it.
const SCARF_COLOR = '#f07a5c';

interface Limb {
  upper: THREE.Bone;
  lower: THREE.Bone;
  end: THREE.Bone;
}

/**
 * Mara on screen: the sculpted, skinned model from character/MaraModel driven procedurally, so
 * animation always matches the controller state exactly. Arm rotations use the convention of a
 * figure whose arms hang straight down (the bones carry the modelling A-pose as rest rotation).
 *
 * The rig is built in workers while the level loads and attached with `attach()`; until then only
 * the scarf tails and anchors exist.
 */
export class PlayerAvatar {
  readonly root = new THREE.Group();
  readonly carryAnchor = new THREE.Object3D();
  private readonly visual = new THREE.Group();
  private rig: MaraRig | null = null;
  private hipsRestY = 0.93;
  private hips!: THREE.Bone;
  private spine!: THREE.Bone;
  private chest!: THREE.Bone;
  private neck!: THREE.Bone;
  private head!: THREE.Bone;
  private bun!: THREE.Bone;
  private readonly legs: Limb[] = [];
  private readonly arms: Limb[] = [];
  private readonly materials: THREE.Material[] = [];
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
  private hangBlend = 0;
  private vaultBlend = 0;
  private nextBlink = 2;
  private blinkT = -1;
  private gazeYaw = 0;
  private gazePitch = 0;
  private nextSaccade = 1;
  private saccadeYaw = 0;

  /** Called when a foot plants; used for footstep audio. */
  onFootstep: ((speed: number) => void) | null = null;

  constructor(scene: THREE.Scene, tex: TextureLibrary) {
    this.root.add(this.visual);
    const scarfMat = new THREE.MeshStandardMaterial({ color: SCARF_COLOR, map: tex.wool.map, normalMap: tex.wool.normalMap, roughness: 1 });
    this.materials.push(scarfMat);
    // Two loose tails hanging from the knot on her left.
    for (const [x, y, z, len, width] of [
      [0.036, 0.078, 0.1, 4, 0.07],
      [0.06, 0.082, 0.094, 3, 0.06],
    ]) {
      const anchor = new THREE.Object3D();
      anchor.position.set(x, y, z);
      this.visual.add(anchor);
      this.scarfAnchors.push(anchor);
      const scarf = new Scarf(scarfMat, len, width);
      this.scarves.push(scarf);
      scene.add(scarf.mesh);
    }
    this.carryAnchor.position.set(0, -0.106, 0.316);
    this.visual.add(this.carryAnchor);
    scene.add(this.root);
  }

  /** Attach the built character. Anchors move onto her chest bone. */
  attach(rig: MaraRig): void {
    this.rig = rig;
    this.visual.add(rig.root);
    const bone = (n: string) => rig.bones.get(n)!;
    this.hips = bone('hips');
    this.spine = bone('spine');
    this.chest = bone('chest');
    this.neck = bone('neck');
    this.head = bone('head');
    this.bun = bone('bun');
    this.hipsRestY = this.hips.position.y;
    for (const n of ['R', 'L']) {
      this.legs.push({ upper: bone(`thigh${n}`), lower: bone(`shin${n}`), end: bone(`foot${n}`) });
      this.arms.push({ upper: bone(`upperArm${n}`), lower: bone(`forearm${n}`), end: bone(`hand${n}`) });
    }
    for (const a of [...this.scarfAnchors, this.carryAnchor]) this.chest.add(a);
    for (const m of Object.values(rig.materials)) {
      // A faint moonlit rim keeps her readable against dark stone without an outline glow.
      if (m !== rig.materials.eye && m !== rig.materials.brass && m !== rig.materials.steel) addRimLight(m, Palette.moon, 0.1, 3);
      this.materials.push(m);
    }
  }

  get ready(): boolean {
    return this.rig !== null;
  }

  onJump(): void {
    this.stretchVel += 2.0;
  }

  onLand(impact: number): void {
    this.stretchVel -= clamp(impact * 0.18, 0.5, 3.0);
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
    this.root.position.set(s.feet.x, s.feet.y - 0.005, s.feet.z);
    this.root.rotation.y = s.facing;
    if (!this.rig) {
      this.root.updateMatrixWorld(true);
      return;
    }

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
    const A = lerp(0.12, 0.85, run);
    const sp = Math.sin(this.phase);
    const cp = Math.cos(this.phase);

    // --- legs: ground pose
    const ground = [
      { thigh: -sp * A, knee: 0.06 + Math.max(0, cp) * A * 1.35 },
      { thigh: sp * A, knee: 0.06 + Math.max(0, -cp) * A * 1.35 },
    ];
    // --- legs: air pose (rising tuck vs falling reach for the ground)
    const rising = clamp(s.verticalSpeed / 6, -1, 1);
    const air = [
      { thigh: lerp(-0.35, -1.0, Math.max(0, rising)), knee: lerp(0.5, 1.4, Math.max(0, rising)) },
      { thigh: lerp(0.15, 0.3, Math.max(0, rising)), knee: lerp(0.3, 0.55, Math.max(0, rising)) },
    ];
    const legX: number[] = [];
    const kneeX: number[] = [];
    for (let i = 0; i < 2; i++) {
      legX[i] = lerp(ground[i].thigh, air[i].thigh, this.airBlend);
      kneeX[i] = lerp(ground[i].knee, air[i].knee, this.airBlend);
    }

    // --- arms
    const breath = Math.sin(this.time * 2.1);
    const armX: number[] = [];
    const armZ: number[] = [];
    const elbowX: number[] = [];
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const swing = (i === 0 ? sp : -sp) * A * 0.8;
      let sx = swing;
      let sz = side * (0.1 + run * 0.1 + breath * 0.008);
      let ex = -(0.18 + run * 0.95);
      // Air: arms rise and spread for balance.
      sx = lerp(sx, lerp(-0.25, -0.85, Math.max(0, rising)), this.airBlend);
      sz = lerp(sz, side * lerp(0.95, 0.45, Math.max(0, rising)), this.airBlend);
      ex = lerp(ex, -0.35, this.airBlend);
      sx = lerp(sx, -1.05, this.carryBlend);
      sz = lerp(sz, side * -0.18, this.carryBlend);
      ex = lerp(ex, -0.75, this.carryBlend);
      // Reach (left arm) for interactions.
      if (i === 1 && s.reach > 0) {
        const r = Math.sin(s.reach * Math.PI);
        sx = lerp(sx, -1.35, r);
        ex = lerp(ex, -0.15, r);
      }
      armX[i] = sx;
      armZ[i] = sz;
      elbowX[i] = ex;
    }

    // --- traversal poses: hanging, pulling up, vaulting
    const mode = s.mode ?? 'move';
    const mt = s.modeT ?? 0;
    this.hangBlend = damp(this.hangBlend, mode === 'hang' || mode === 'climb' ? 1 : 0, 18, dt);
    this.vaultBlend = damp(this.vaultBlend, mode === 'vault' ? 1 : 0, 24, dt);
    if (this.hangBlend > 0.01) {
      const pull = mode === 'climb' ? Math.min(1, mt * 1.6) : 0;
      const sway = mode === 'hang' ? Math.sin(this.time * 2.4) * 0.05 : 0;
      for (let i = 0; i < 2; i++) {
        const side = i === 0 ? -1 : 1;
        armX[i] = lerp(armX[i], lerp(-2.85, -0.7, pull), this.hangBlend);
        armZ[i] = lerp(armZ[i], side * lerp(0.2, 0.35, pull), this.hangBlend);
        elbowX[i] = lerp(elbowX[i], lerp(-0.2, -1.5, pull), this.hangBlend);
        const kick = mode === 'climb' ? Math.sin(Math.min(1, mt) * Math.PI) : 0;
        legX[i] = lerp(legX[i], 0.08 + sway - kick * (i === 0 ? 1.3 : 0.4), this.hangBlend);
        kneeX[i] = lerp(kneeX[i], 0.25 + kick * (i === 0 ? 1.4 : 0.6), this.hangBlend);
      }
    }
    if (this.vaultBlend > 0.01) {
      const tuck = Math.sin(Math.min(1, mt) * Math.PI);
      for (let i = 0; i < 2; i++) {
        const side = i === 0 ? -1 : 1;
        // Right hand plants on the rail; left arm swings out for balance.
        armX[i] = lerp(armX[i], i === 0 ? -0.5 : -1.1, this.vaultBlend);
        armZ[i] = lerp(armZ[i], side * (i === 0 ? 0.5 : 1.0), this.vaultBlend);
        elbowX[i] = lerp(elbowX[i], -0.2, this.vaultBlend);
        legX[i] = lerp(legX[i], -1.0 * tuck - 0.2, this.vaultBlend);
        kneeX[i] = lerp(kneeX[i], 1.4 * tuck + 0.2, this.vaultBlend);
      }
    }

    for (let i = 0; i < 2; i++) {
      const leg = this.legs[i];
      leg.upper.rotation.set(legX[i], 0, 0);
      leg.lower.rotation.set(kneeX[i], 0, 0);
      leg.end.rotation.set(-(legX[i] + kneeX[i]) * 0.7, 0, 0);
      const arm = this.arms[i];
      arm.upper.rotation.set(armX[i], 0, armZ[i]);
      arm.lower.rotation.set(elbowX[i], 0, 0);
      // Wrists: relaxed curl on the ground, palms toward the ledge when hanging.
      arm.end.rotation.set(lerp(-0.12, 0.35, this.hangBlend), 0, 0);
    }

    // --- body
    const bob = (Math.abs(sp) * 0.05 - 0.02) * run;
    this.hips.position.y = this.hipsRestY + bob * (1 - this.airBlend) - run * 0.02;
    this.hips.rotation.y = -sp * 0.12 * run;
    this.spine.rotation.set(run * 0.06, sp * 0.2 * run, 0);
    this.chest.rotation.x = -breath * 0.012 * (1 - run);
    const lean = run * 0.12 * (1 - this.hangBlend) + this.carryBlend * -0.05 + this.vaultBlend * 0.25;
    this.visual.rotation.x = damp(this.visual.rotation.x, lean, 8, dt);
    const roll = clamp(-this.turnRate * 0.035, -0.22, 0.22) * run * (1 - this.vaultBlend) - this.vaultBlend * 0.35;
    this.visual.rotation.z = damp(this.visual.rotation.z, roll, 10, dt);

    // Squash and stretch (critically damped spring around 0), kept subtle on a realistic figure.
    const k = 160;
    const c = 2 * Math.sqrt(k) * 0.55;
    this.stretchVel += (-k * this.stretch - c * this.stretchVel) * dt;
    this.stretch = clamp(this.stretch + this.stretchVel * dt, -0.12, 0.1);
    this.visual.scale.set(1 - this.stretch * 0.4, 1 + this.stretch, 1 - this.stretch * 0.4);

    // --- head and eyes: glance at points of interest, otherwise idle look-around
    let targetYaw = Math.sin(this.time * 0.37) * 0.22 * (1 - run);
    let targetPitch = -0.05;
    let looking = false;
    if (s.lookAt) {
      const dx = s.lookAt.x - s.feet.x;
      const dz = s.lookAt.z - s.feet.z;
      const yaw = wrapAngle(Math.atan2(dx, dz) - s.facing);
      if (Math.abs(yaw) < 1.6) {
        targetYaw = clamp(yaw, -0.9, 0.9);
        targetPitch = clamp(-Math.atan2(s.lookAt.y - (s.feet.y + 1.5), Math.hypot(dx, dz)), -0.5, 0.5);
        looking = true;
      }
    }
    this.headYaw = dampAngle(this.headYaw, targetYaw, 6, dt);
    this.headPitch = damp(this.headPitch, targetPitch, 6, dt);
    const twist = this.headYaw - this.spine.rotation.y;
    this.neck.rotation.set(this.headPitch * 0.35, twist * 0.35, 0);
    this.head.rotation.set(this.headPitch * 0.65, twist * 0.65, 0);

    // Eyes lead the head toward targets, with small saccades while idle.
    this.nextSaccade -= dt;
    if (this.nextSaccade <= 0) {
      this.nextSaccade = 0.6 + Math.random() * 1.8;
      this.saccadeYaw = (Math.random() - 0.5) * 0.3;
    }
    const eyeYaw = looking ? clamp(targetYaw - this.headYaw, -0.35, 0.35) : this.saccadeYaw * (1 - run);
    const eyePitch = looking ? clamp(targetPitch - this.headPitch, -0.25, 0.25) : 0;
    this.gazeYaw = damp(this.gazeYaw, eyeYaw, 25, dt);
    this.gazePitch = damp(this.gazePitch, eyePitch, 25, dt);
    this.rig.setGaze(this.gazeYaw, this.gazePitch);
    // Blink every few seconds (and on landing hard).
    this.nextBlink -= dt;
    if (this.nextBlink <= 0 && this.blinkT < 0) {
      this.blinkT = 0;
      this.nextBlink = 2 + Math.random() * 3.5;
    }
    let blink = 0;
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      blink = Math.sin(Math.min(1, this.blinkT / 0.14) * Math.PI);
      if (this.blinkT >= 0.14) this.blinkT = -1;
    }
    this.rig.setBlink(blink);

    // Hair bun bobs on a spring with vertical motion and turns.
    const bunTarget = clamp(-s.verticalSpeed * 0.03, -0.25, 0.3) + run * 0.1;
    this.bunVel += ((bunTarget - this.bunSwing) * 120 - this.bunVel * 10) * dt;
    this.bunSwing += this.bunVel * dt;
    this.bun.rotation.set(this.bunSwing, 0, clamp(this.turnRate * 0.02, -0.25, 0.25));

    this.root.updateMatrixWorld(true);
    this.scarves.forEach((scarf, i) => scarf.update(dt, this.scarfAnchors[i], this.root, s.speed));
  }
}
