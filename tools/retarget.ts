import * as THREE from 'three';

/**
 * Retarget an animation clip between two humanoid skeletons by world-space rotation deltas.
 *
 * For every mapped bone the clip's world rotation relative to the source's reference pose
 * (the library's own T-pose clip) is applied to the target bone's bind-pose world rotation:
 *
 *   targetWorld(t) = sourceWorld(t) * inverse(sourceWorldRef) * targetWorldBind
 *
 * so bone axis conventions, naming and units may differ, as long as both characters face the same
 * way in their reference poses. The hips also get a translation track, scaled by hip height.
 */
export interface RetargetSource {
  root: THREE.Object3D;
  /** Reference pose clip (e.g. "A_TPose"), sampled at t = 0. */
  reference: THREE.AnimationClip;
}

export interface RetargetTarget {
  root: THREE.Object3D;
  /** Target bones by name, all in bind pose when retargeting starts. */
  bones: Map<string, THREE.Bone>;
  hips: string;
}

const qa = new THREE.Quaternion();
const qb = new THREE.Quaternion();
const va = new THREE.Vector3();

function boneByName(root: THREE.Object3D): Map<string, THREE.Object3D> {
  const m = new Map<string, THREE.Object3D>();
  root.traverse((o) => {
    if ((o as THREE.Bone).isBone && !m.has(o.name)) m.set(o.name, o);
  });
  return m;
}

/** Bones of `root` in parent-before-child order. */
function hierarchy(bones: Map<string, THREE.Bone>): THREE.Bone[] {
  const out: THREE.Bone[] = [];
  const seen = new Set<THREE.Bone>();
  const visit = (b: THREE.Bone) => {
    if (seen.has(b)) return;
    if ((b.parent as THREE.Bone)?.isBone && bones.get(b.parent!.name) === b.parent) visit(b.parent as THREE.Bone);
    seen.add(b);
    out.push(b);
  };
  bones.forEach(visit);
  return out;
}

export function retargetClip(
  source: RetargetSource,
  clip: THREE.AnimationClip,
  target: RetargetTarget,
  /** target bone name -> source bone name */
  map: Record<string, string>,
  opts: { fps?: number; name?: string; keepRootMotion?: boolean } = {},
): THREE.AnimationClip {
  const fps = opts.fps ?? 30;
  const srcBones = boneByName(source.root);
  const order = hierarchy(target.bones);
  const mixer = new THREE.AnimationMixer(source.root);

  // Source reference pose (world rotations, hips position).
  const ref = mixer.clipAction(source.reference);
  ref.play();
  mixer.setTime(0);
  source.root.updateMatrixWorld(true);
  const srcRef = new Map<string, THREE.Quaternion>();
  // GLTFLoader sanitises node names (dots and other reserved characters are removed).
  const clean = (n: string) => THREE.PropertyBinding.sanitizeNodeName(n);
  for (const [tName, sName] of Object.entries(map)) {
    const s = srcBones.get(clean(sName));
    if (s) srcRef.set(tName, s.getWorldQuaternion(new THREE.Quaternion()));
  }
  const srcHips = srcBones.get(clean(map[target.hips]))!;
  const srcHipsRef = srcHips.getWorldPosition(new THREE.Vector3());
  ref.stop();

  // Target bind pose (world rotations), rest local rotations for unmapped bones.
  target.root.updateMatrixWorld(true);
  const tgtBind = new Map<string, THREE.Quaternion>();
  const tgtRestLocal = new Map<string, THREE.Quaternion>();
  for (const b of order) {
    tgtBind.set(b.name, b.getWorldQuaternion(new THREE.Quaternion()));
    tgtRestLocal.set(b.name, b.quaternion.clone());
  }
  const tgtHips = target.bones.get(target.hips)!;
  const tgtHipsRestWorld = tgtHips.getWorldPosition(new THREE.Vector3());
  const tgtHipsParentInv = new THREE.Matrix4().copy(tgtHips.parent!.matrixWorld).invert();
  const rootWorld = new THREE.Quaternion();
  tgtHips.parent!.getWorldQuaternion(rootWorld);
  // Hip height above the feet: the scale between the two characters' translations.
  const scale = tgtHipsRestWorld.y / Math.max(1e-4, srcHipsRef.y);

  const action = mixer.clipAction(clip);
  action.play();
  const frames = Math.max(2, Math.round(clip.duration * fps) + 1);
  const times = new Float32Array(frames);
  const rot = new Map<string, Float32Array>();
  for (const b of order) rot.set(b.name, new Float32Array(frames * 4));
  const hipsPos = new Float32Array(frames * 3);
  const world = new Map<string, THREE.Quaternion>();

  for (let f = 0; f < frames; f++) {
    const t = Math.min(clip.duration, f / fps);
    times[f] = t;
    mixer.setTime(t);
    source.root.updateMatrixWorld(true);
    world.clear();
    for (const b of order) {
      const parentName = (b.parent as THREE.Bone)?.isBone ? b.parent!.name : null;
      const parentWorld = parentName && world.get(parentName) ? world.get(parentName)! : b.parent ? b.parent.getWorldQuaternion(qa).clone() : new THREE.Quaternion();
      const sName = map[b.name];
      const s = sName ? srcBones.get(clean(sName)) : undefined;
      let w: THREE.Quaternion;
      if (s && srcRef.has(b.name)) {
        // targetWorld = sourceWorld * inv(sourceRef) * targetBind
        w = s.getWorldQuaternion(new THREE.Quaternion()).multiply(qb.copy(srcRef.get(b.name)!).invert()).multiply(tgtBind.get(b.name)!);
      } else {
        w = parentWorld.clone().multiply(tgtRestLocal.get(b.name)!);
      }
      world.set(b.name, w);
      const local = qa.copy(parentWorld).invert().multiply(w).normalize();
      local.toArray(rot.get(b.name)!, f * 4);
    }
    // Hips: world offset from the reference, scaled, applied in the hips' parent space.
    srcHips.getWorldPosition(va).sub(srcHipsRef).multiplyScalar(scale);
    if (!opts.keepRootMotion) {
      va.x = 0;
      va.z = 0;
    }
    va.add(tgtHipsRestWorld).applyMatrix4(tgtHipsParentInv);
    va.toArray(hipsPos, f * 3);
  }
  action.stop();
  mixer.uncacheRoot(source.root);

  const tracks: THREE.KeyframeTrack[] = [];
  for (const b of order) tracks.push(new THREE.QuaternionKeyframeTrack(`${b.name}.quaternion`, times, rot.get(b.name)!));
  tracks.push(new THREE.VectorKeyframeTrack(`${target.hips}.position`, times, hipsPos));
  void rootWorld;
  return new THREE.AnimationClip(opts.name ?? clip.name, clip.duration, tracks);
}

/** Rigify (Quaternius UAL1 Godot export) to UE-style names (Quaternius base characters / UAL2). */
export function rigifyToUE(): Record<string, string> {
  const m: Record<string, string> = {
    pelvis: 'DEF-hips',
    spine_01: 'DEF-spine.001',
    spine_02: 'DEF-spine.002',
    spine_03: 'DEF-spine.003',
    neck_01: 'DEF-neck',
    Head: 'DEF-head',
  };
  for (const [s, S] of [
    ['l', 'L'],
    ['r', 'R'],
  ]) {
    Object.assign(m, {
      [`clavicle_${s}`]: `DEF-shoulder.${S}`,
      [`upperarm_${s}`]: `DEF-upper_arm.${S}`,
      [`lowerarm_${s}`]: `DEF-forearm.${S}`,
      [`hand_${s}`]: `DEF-hand.${S}`,
      [`thigh_${s}`]: `DEF-thigh.${S}`,
      [`calf_${s}`]: `DEF-shin.${S}`,
      [`foot_${s}`]: `DEF-foot.${S}`,
      [`ball_${s}`]: `DEF-toe.${S}`,
    });
    for (const finger of ['index', 'middle', 'pinky', 'ring']) for (const i of [1, 2, 3]) m[`${finger}_0${i}_${s}`] = `DEF-f_${finger}.0${i}.${S}`;
    for (const i of [1, 2, 3]) m[`thumb_0${i}_${s}`] = `DEF-thumb.0${i}.${S}`;
  }
  return m;
}

/** Identity map for skeletons that already share UE-style names (UAL2). */
export function sameNames(names: Iterable<string>): Record<string, string> {
  const m: Record<string, string> = {};
  for (const n of names) m[n] = n;
  return m;
}
