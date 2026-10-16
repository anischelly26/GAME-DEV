import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clamp, damp, dampAngle, wrapAngle } from '../core/math';
import type { TextureLibrary } from '../world/textures';
import { MOVEMENT } from './movement';
import { TRAVERSAL } from './Traversal';
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
  /** Increments each time the controller applies a knockback. */
  knockbacks?: number;
}

/** Mara's standing height in metres (to the top of her hair). */
const HEIGHT = 1.7;
const SCARF_COLOR = '#c8553a';
const LOCOMOTION = ['walk', 'jog', 'sprint'] as const;
type Loco = (typeof LOCOMOTION)[number];

const UP = new THREE.Vector3(0, 1, 0);
const qa = new THREE.Quaternion();
const qb = new THREE.Quaternion();

/**
 * Mara on screen: the CC0 character assembled by scripts/import-mara.mjs (public/assets/mara/
 * mara.glb), animated with hand-made clips from Quaternius's Universal Animation Libraries.
 * Locomotion blends idle, walk, jog and sprint by speed, phase-locked and time-scaled to the
 * controller's ground speed so the feet don't slide; jumps, landings, climbs, vaults, knockback and
 * interactions are one-shot clips layered over it; the head turns toward points of interest.
 */
export class PlayerAvatar {
  readonly root = new THREE.Group();
  readonly carryAnchor = new THREE.Object3D();
  private readonly visual = new THREE.Group();
  private model: THREE.Object3D | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private readonly naturalSpeed: Record<Loco, number> = { walk: 1.5, jog: 3.9, sprint: 6 };
  private readonly bones = new Map<string, THREE.Bone>();
  private readonly materials: THREE.Material[] = [];
  private readonly scarves: Scarf[] = [];
  private readonly scarfAnchors: THREE.Object3D[] = [];
  private readonly scene: THREE.Scene;
  private readonly tex: TextureLibrary;

  private phase = 0;
  private airBlend = 0;
  private airTime = 0;
  private landT = -1;
  private landWeight = 0;
  private landDur = 0.35;
  private oneShot: { name: string; weight: number; target: number } | null = null;
  private lastKnockbacks = 0;
  private lastMode: AvatarState['mode'] = 'move';
  private lastReach = 0;
  private lastFacing = 0;
  private turnRate = 0;
  private lean = 0;
  private headYaw = 0;
  private headPitch = 0;
  private opacity = 1;
  private time = 0;

  /** Called when a foot plants; used for footstep audio. */
  onFootstep: ((speed: number) => void) | null = null;

  constructor(scene: THREE.Scene, tex: TextureLibrary) {
    this.scene = scene;
    this.tex = tex;
    this.root.add(this.visual);
    this.carryAnchor.position.set(0, 1.1, 0.32);
    this.visual.add(this.carryAnchor);
    scene.add(this.root);
  }

  get ready(): boolean {
    return this.model !== null;
  }

  /** Kept for the quality switch; the character has a single level of detail. */
  setDetail(_level: 'high' | 'low'): void {}

  /** Attach the loaded character (public/assets/mara/mara.glb). */
  attach(gltf: GLTF): void {
    const model = gltf.scene;
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const s = HEIGHT / Math.max(0.5, box.max.y - box.min.y);
    model.scale.setScalar(s);
    model.position.y = -box.min.y * s;
    this.visual.add(model);
    this.model = model;
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if ((o as THREE.Bone).isBone) this.bones.set(o.name, o as THREE.Bone);
      if (!m.isMesh) return;
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) this.addFadeable(mat);
    });
    this.mixer = new THREE.AnimationMixer(model);
    for (const clip of gltf.animations) {
      const a = this.mixer.clipAction(clip);
      a.enabled = true;
      a.setEffectiveWeight(0);
      this.actions.set(clip.name, a);
    }
    this.root.updateMatrixWorld(true);
    this.measureLocomotion(gltf.animations);
    for (const n of ['idle', ...LOCOMOTION, 'jumpLoop', 'land']) this.actions.get(n)?.play();
    this.actions.get('idle')?.setEffectiveWeight(1);
    this.mixer.update(0);
    this.root.updateMatrixWorld(true);
    this.addScarf();
  }

  /** Ground speed of each locomotion clip, from how far a planted foot travels per cycle. */
  private measureLocomotion(clips: THREE.AnimationClip[]): void {
    const model = this.model!;
    const foot = this.bones.get('foot_l');
    const hips = this.bones.get('pelvis');
    if (!foot || !hips) return;
    const probe = new THREE.AnimationMixer(model);
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    for (const name of LOCOMOTION) {
      const clip = clips.find((c) => c.name === name);
      if (!clip) continue;
      const act = probe.clipAction(clip);
      act.play();
      let min = Infinity;
      let max = -Infinity;
      for (let i = 0; i <= 40; i++) {
        probe.setTime((clip.duration * i) / 40);
        model.updateMatrixWorld(true);
        foot.getWorldPosition(a);
        hips.getWorldPosition(b);
        const z = a.z - b.z;
        min = Math.min(min, z);
        max = Math.max(max, z);
      }
      act.stop();
      // A planted foot sweeps the stride backwards during roughly half the cycle.
      const v = (2 * (max - min)) / clip.duration;
      if (v > 0.3 && v < 12) this.naturalSpeed[name] = v;
    }
    probe.stopAllAction();
    probe.uncacheRoot(model);
  }

  /** Measured ground speed of each locomotion clip (m/s), for tests and tuning. */
  get locomotionSpeeds(): Record<string, number> {
    return { ...this.naturalSpeed };
  }

  /** A coral knit wrap at her neck, with two loose tails. */
  private addScarf(): void {
    const neck = this.bones.get('neck_01');
    const chest = this.bones.get('spine_03');
    if (!neck || !chest) return;
    const knit = new THREE.MeshStandardMaterial({ color: SCARF_COLOR, roughness: 1, normalMap: this.tex.wool.normalMap });
    this.addFadeable(knit);
    const neckPos = neck.getWorldPosition(new THREE.Vector3());
    const facing = this.root.getWorldQuaternion(new THREE.Quaternion());
    const wrap = new THREE.Group();
    for (const [y, r, t, tilt] of [
      [-0.01, 0.1, 0.036, 0.22],
      [0.035, 0.088, 0.03, 0.08],
    ]) {
      const torus = new THREE.Mesh(new THREE.TorusGeometry(r, t, 10, 28), knit);
      torus.rotation.x = Math.PI / 2 + tilt;
      torus.position.set(0, y, 0.008);
      torus.castShadow = true;
      wrap.add(torus);
    }
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.036, 14, 10), knit);
    knot.scale.set(1.1, 0.9, 0.8);
    knot.position.set(0.045, -0.04, 0.1);
    wrap.add(knot);
    wrap.quaternion.copy(facing);
    wrap.position.copy(neckPos).add(new THREE.Vector3(0, -0.025, 0));
    this.scene.add(wrap);
    neck.attach(wrap);
    const tailMat = new THREE.MeshStandardMaterial({ color: SCARF_COLOR, roughness: 1 });
    this.addFadeable(tailMat);
    for (const [x, len, width] of [
      [0.03, 3, 0.05],
      [0.055, 2, 0.044],
    ]) {
      const anchor = new THREE.Object3D();
      anchor.position.copy(neckPos).add(new THREE.Vector3(x, -0.09, 0.09).applyQuaternion(facing));
      this.scene.add(anchor);
      chest.attach(anchor);
      this.scarfAnchors.push(anchor);
      const scarf = new Scarf(tailMat, len, width);
      this.scarves.push(scarf);
      this.scene.add(scarf.mesh);
    }
  }

  onJump(): void {
    this.airTime = 0;
    this.play('jumpStart', 1.6, 0.25);
  }

  onLand(impact: number): void {
    if (impact < 3) return;
    this.landT = 0;
    // A big drop lands heavier and takes a beat longer to straighten up (animation only: control
    // is never held back).
    const big = clamp((impact - 7) / 9, 0, 1);
    this.landWeight = clamp(impact / 10, 0.35, 0.85) + big * 0.15;
    this.landDur = 0.35 + big * 0.3;
    const land = this.actions.get('land');
    if (land) {
      land.reset();
      land.time = 0.2;
      land.setLoop(THREE.LoopOnce, 1);
      land.clampWhenFinished = true;
      land.timeScale = 1.4;
      land.play();
    }
  }

  /** Story beats: play a clip on the whole body (timeScale 0 holds a pose, e.g. lying asleep). */
  cinematic(name: string, timeScale = 1, startAt = 0): void {
    this.play(name, timeScale, startAt);
    if (this.oneShot && timeScale === 0) this.oneShot.weight = 1;
  }

  /** End any story clip at once and return to the normal locomotion pose. */
  endCinematic(): void {
    if (!this.oneShot) return;
    const a = this.actions.get(this.oneShot.name);
    a?.stop();
    a?.setEffectiveWeight(0);
    this.oneShot = null;
  }

  /** Start a full-body one-shot: fades in, holds until it ends (or the mode ends), fades out. */
  private play(name: string, timeScale = 1, startAt = 0): void {
    const a = this.actions.get(name);
    if (!a) return;
    if (this.oneShot && this.oneShot.name !== name) {
      this.actions.get(this.oneShot.name)?.stop();
      this.actions.get(this.oneShot.name)?.setEffectiveWeight(0);
    }
    a.reset();
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    a.timeScale = timeScale;
    a.time = startAt;
    a.play();
    this.oneShot = { name, weight: this.oneShot?.name === name ? this.oneShot.weight : 0, target: 1 };
  }

  /**
   * Materials that fade near the camera use a dithered alpha hash that is always on, so changing
   * the opacity only changes a uniform. Switching `transparent` instead changes the shader: on
   * integrated GPUs (ANGLE/D3D11) recompiling Mara's eight programs froze the game for 4-6 s the
   * first time the camera came close (review 492bce4 R2).
   */
  private addFadeable(m: THREE.Material): void {
    if (!m.transparent) m.alphaHash = true;
    this.materials.push(m);
  }

  /** Fade the avatar when the camera gets very close so it never blocks the view. */
  setOpacity(o: number): void {
    if (Math.abs(o - this.opacity) < 0.01) return;
    this.opacity = o;
    for (const m of this.materials) {
      m.opacity = o;
      m.depthWrite = o > 0.5;
    }
    this.root.visible = o > 0.02;
    for (const s of this.scarves) s.mesh.visible = o > 0.02;
  }

  update(dt: number, s: AvatarState): void {
    this.time += dt;
    this.root.position.set(s.feet.x, s.feet.y - 0.01, s.feet.z);
    this.root.rotation.y = s.facing;
    if (!this.mixer || !this.model) {
      this.root.updateMatrixWorld(true);
      return;
    }
    const mode = s.mode ?? 'move';
    this.turnRate = damp(this.turnRate, wrapAngle(s.facing - this.lastFacing) / Math.max(dt, 1e-4), 8, dt);
    this.lastFacing = s.facing;

    // --- traversal and event one-shots
    if (mode !== this.lastMode) {
      if (mode === 'hang') this.play('climb', 0, 0.02);
      else if (mode === 'climb') this.play('climb', this.clipDuration('climb') / TRAVERSAL.pullUpTime, 0.02);
      else if (mode === 'vault') this.play('vault', this.clipDuration('vault') / (TRAVERSAL.vaultTime * 1.6), 0.1);
      else if (this.oneShot && /climb|vault/.test(this.oneShot.name)) this.oneShot.target = 0;
      this.lastMode = mode;
    }
    if ((s.knockbacks ?? 0) > this.lastKnockbacks) {
      this.lastKnockbacks = s.knockbacks ?? 0;
      this.play('knockback', 1.3);
    }
    if (s.reach > 0 && this.lastReach <= 0 && mode === 'move' && s.grounded) this.play('interact', 1.7, 0.15);
    this.lastReach = s.reach;

    // --- one-shot weight: fade in quickly, out when finished or released
    if (this.oneShot) {
      const a = this.actions.get(this.oneShot.name)!;
      const finished = a.time >= a.getClip().duration - 1e-3 && a.timeScale !== 0;
      if (finished && mode === 'move') this.oneShot.target = 0;
      if (this.oneShot.name === 'jumpStart' && this.airTime > 0.12 && (s.verticalSpeed < 0 || s.grounded)) this.oneShot.target = 0;
      this.oneShot.weight = damp(this.oneShot.weight, this.oneShot.target, this.oneShot.target > 0 ? 20 : 9, dt);
      if (this.oneShot.target === 0 && this.oneShot.weight < 0.02) {
        a.stop();
        a.setEffectiveWeight(0);
        this.oneShot = null;
      } else a.setEffectiveWeight(this.oneShot.weight);
    }
    const shot = this.oneShot?.weight ?? 0;

    // --- air
    this.airTime = s.grounded ? 0 : this.airTime + dt;
    const airborne = !s.grounded && mode === 'move' && (this.airTime > 0.1 || s.verticalSpeed > 1);
    this.airBlend = damp(this.airBlend, airborne ? 1 : 0, airborne ? 12 : 18, dt);

    // --- landing overlay
    let land = 0;
    if (this.landT >= 0) {
      this.landT += dt;
      land = this.landWeight * Math.max(0, 1 - this.landT / this.landDur);
      if (this.landT > 0.35) this.landT = -1;
    }

    // --- locomotion: phase-locked blend of walk, jog and sprint by ground speed
    const v = s.grounded ? s.speed : 0;
    const ns = this.naturalSpeed;
    const w: Record<string, number> = { idle: 0, walk: 0, jog: 0, sprint: 0 };
    if (v < 0.15) w.idle = 1;
    else if (v < ns.walk) {
      const t = (v - 0.15) / (ns.walk - 0.15);
      w.idle = 1 - t;
      w.walk = t;
    } else if (v < ns.jog) {
      const t = (v - ns.walk) / (ns.jog - ns.walk);
      w.walk = 1 - t;
      w.jog = t;
    } else {
      const t = clamp((v - ns.jog) / Math.max(0.1, ns.sprint - ns.jog), 0, 1);
      w.jog = 1 - t;
      w.sprint = t;
    }
    let rate = 0;
    for (const n of LOCOMOTION) rate += (w[n] * clamp(v / ns[n], 0.6, 1.4)) / this.clipDuration(n);
    const moving = w.walk + w.jog + w.sprint;
    if (moving > 0) rate /= moving;
    const prev = this.phase;
    this.phase = (this.phase + dt * rate) % 1;
    if (s.grounded && v > 1 && Math.floor(prev * 2) !== Math.floor(this.phase * 2)) this.onFootstep?.(v);
    const groundShare = (1 - this.airBlend) * (1 - shot) * (1 - land);
    for (const n of ['idle', ...LOCOMOTION]) {
      const a = this.actions.get(n);
      if (!a) continue;
      a.setEffectiveWeight(w[n] * groundShare);
      if (n !== 'idle') {
        a.timeScale = 0;
        a.time = this.phase * this.clipDuration(n);
      }
    }
    this.actions.get('jumpLoop')?.setEffectiveWeight(this.airBlend * (1 - shot));
    this.actions.get('land')?.setEffectiveWeight(land * (1 - shot));

    this.mixer.update(dt);

    // --- body lean with speed and into turns (subtle on a realistic figure)
    this.lean = damp(this.lean, clamp(v / MOVEMENT.maxSpeed, 0, 1) * 0.06 * (1 - shot), 6, dt);
    this.visual.rotation.x = this.lean;
    this.visual.rotation.z = damp(this.visual.rotation.z, clamp(-this.turnRate * 0.02, -0.12, 0.12) * clamp(v / 4, 0, 1), 8, dt);

    // --- head: glance at points of interest, otherwise a slow idle look-around
    let targetYaw = Math.sin(this.time * 0.37) * 0.18 * (v < 0.5 ? 1 : 0);
    let targetPitch = 0;
    if (s.lookAt && mode === 'move') {
      const dx = s.lookAt.x - s.feet.x;
      const dz = s.lookAt.z - s.feet.z;
      const yaw = wrapAngle(Math.atan2(dx, dz) - s.facing);
      if (Math.abs(yaw) < 1.6) {
        targetYaw = clamp(yaw, -0.8, 0.8);
        targetPitch = clamp(Math.atan2(s.lookAt.y - (s.feet.y + 1.55), Math.hypot(dx, dz)), -0.45, 0.45);
      }
    }
    // Full-body clips (climbing, lying down, getting up) own the head.
    this.headYaw = dampAngle(this.headYaw, targetYaw * (1 - shot), 6, dt);
    this.headPitch = damp(this.headPitch, targetPitch * (1 - shot), 6, dt);
    this.root.updateMatrixWorld(true);
    this.turnBone('neck_01', this.headYaw * 0.4, this.headPitch * 0.4);
    this.turnBone('Head', this.headYaw * 0.6, this.headPitch * 0.6);

    this.root.updateMatrixWorld(true);
    this.scarves.forEach((scarf, i) => scarf.update(dt, this.scarfAnchors[i], this.root, s.speed));
  }

  private clipDuration(name: string): number {
    return this.actions.get(name)?.getClip().duration ?? 1;
  }

  /** Turn a bone by yaw (about world up) and pitch (about the character's right axis), in world space. */
  private turnBone(name: string, yaw: number, pitch: number): void {
    const b = this.bones.get(name);
    if (!b || !b.parent || (yaw === 0 && pitch === 0)) return;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.root.getWorldQuaternion(qa));
    const delta = qb.setFromAxisAngle(UP, yaw).multiply(new THREE.Quaternion().setFromAxisAngle(right, -pitch));
    const world = b.getWorldQuaternion(new THREE.Quaternion());
    const parentInv = b.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
    b.quaternion.copy(parentInv.multiply(delta.multiply(world)));
    b.updateMatrixWorld(true);
  }
}
