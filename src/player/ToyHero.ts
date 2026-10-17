import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { TextureLibrary } from '../world/textures';

/**
 * Mara as a toy: an original stylised character, between a cartoon minion and a jointed doll.
 * A big round head with large eyes that blink and look around, brows and a mouth that change with
 * her mood, space buns and brass goggles pushed up on her forehead; a round ochre work jacket, short
 * jointed limbs, mitten gloves and chunky boots.
 *
 * She is built on the same CC0 skeleton and animation clips as before (public/assets/mara/mara.glb):
 * the bones are re-proportioned (short legs and arms, a stubby torso, no neck), the hip track of
 * every clip is remapped so standing, sitting and lying still meet the ground, and the body is
 * made of smooth parts skinned rigidly to the bones, merged into one draw per material. The face
 * parts that move are separate meshes on the head bone, driven by `ToyFace`.
 */

/** Bone offset scales (each bone's offset from its parent): the toy's proportions. */
const BONE_SCALE: Array<[RegExp, number]> = [
  [/^spine_0[123]$/, 0.72],
  [/^neck_01$/, 0.22],
  [/^Head$/, 0.35],
  [/^clavicle_[lr]$/, 0.9],
  [/^upperarm_[lr]$/, 1.12],
  [/^lowerarm_[lr]$/, 0.5],
  [/^hand_[lr]$/, 0.5],
  [/^(index|middle|ring|pinky|thumb)_0[1-4](_leaf)?_[lr]$/, 0.55],
  [/^calf_[lr]$/, 0.5],
  [/^foot_[lr]$/, 0.5],
  [/^ball(_leaf)?_[lr]$/, 0.8],
];

export const TOY_COLORS = {
  skin: '#b47a55',
  jacket: '#c98a3a',
  jacketDark: '#9a6427',
  trousers: '#34505d',
  leather: '#5a3826',
  sole: '#2a1d17',
  hair: '#5a2a1c',
  brass: '#c9a14e',
  lens: '#4f9fa3',
  accent: '#c8553a',
  mouth: '#4a1f1e',
};

/** Where things sit on the toy (metres above her feet, in her own frame), for the avatar. */
export interface ToyFit {
  height: number;
  /** Pivot for the flip and the dive (about her middle). */
  pivotY: number;
  chestY: number;
  eyeY: number;
  /** Her back's distance behind the spine (the canister hangs there). */
  backZ: number;
  /** The scarf: wrap radius scale against the original figure, and the tails' anchor depth. */
  scarfScale: number;
  scarfFront: number;
  /** How much lower her raised hands reach than the original figure's (hanging from ledges). */
  hangLift: number;
}

export interface ToyHero {
  model: THREE.Object3D;
  materials: THREE.Material[];
  face: ToyFace;
  fit: ToyFit;
}

type MatKey = keyof typeof TOY_COLORS | 'eye' | 'white';

/**
 * Re-proportion the skeleton and remap the hip track of every clip. Call before an
 * AnimationMixer binds the clips.
 */
export function reproportion(model: THREE.Object3D, clips: THREE.AnimationClip[]): { drop: number } {
  const bones = boneMap(model);
  const pelvis = bones.get('pelvis')!;
  const foot = bones.get('foot_l')!;
  model.updateMatrixWorld(true);
  const footBefore = foot.getWorldPosition(new THREE.Vector3()).y;
  for (const [name, b] of bones) {
    for (const [re, k] of BONE_SCALE) {
      if (re.test(name)) {
        b.position.multiplyScalar(k);
        break;
      }
    }
  }
  model.updateMatrixWorld(true);
  // The legs got shorter, so the feet rose: the standing hip height drops by the same amount.
  const drop = foot.getWorldPosition(new THREE.Vector3()).y - footBefore;
  // The pelvis track is in the root's Z-up frame: z is height. Standing poses lose the leg length;
  // lying poses gain a little (the toy's back is rounder), and everything in between follows a
  // straight line, so sitting and crouching still meet the seat and the floor.
  const zStand = pelvis.position.z;
  const wake = clips.find((c) => c.name === 'wake');
  const wakeTrack = wake?.tracks.find((t) => t.name === 'pelvis.position');
  const zLie = wakeTrack ? wakeTrack.values[2] : 0.12;
  const zStandNew = zStand - drop;
  const zLieNew = zLie + 0.09;
  const a = (zStandNew - zLieNew) / (zStand - zLie);
  const b = zStandNew - a * zStand;
  const remap = (v: Float32Array | number[], i: number) => {
    v[i] *= 0.65;
    v[i + 1] *= 0.65;
    v[i + 2] = a * v[i + 2] + b;
  };
  const rest = [pelvis.position.x, pelvis.position.y, pelvis.position.z];
  remap(rest, 0);
  pelvis.position.set(rest[0], rest[1], rest[2]);
  for (const clip of clips) {
    for (const t of clip.tracks) {
      if (t.name !== 'pelvis.position') continue;
      for (let i = 0; i < t.values.length; i += 3) remap(t.values as Float32Array, i);
    }
  }
  model.updateMatrixWorld(true);
  return { drop };
}

function boneMap(model: THREE.Object3D): Map<string, THREE.Bone> {
  const bones = new Map<string, THREE.Bone>();
  model.traverse((o) => {
    if ((o as THREE.Bone).isBone) bones.set(o.name, o as THREE.Bone);
  });
  return bones;
}

/**
 * Build the toy from the loaded character: re-proportions it, replaces the human meshes with the
 * toy's, and returns the model (feet on y = 0, facing +Z) with its face controller.
 */
export function createToyHero(gltf: GLTF, tex: TextureLibrary): ToyHero {
  const model = gltf.scene;
  model.position.set(0, 0, 0);
  model.scale.setScalar(1);
  model.updateMatrixWorld(true);
  const skinned: THREE.SkinnedMesh[] = [];
  model.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned.push(o as THREE.SkinnedMesh);
  });
  const skeleton = skinned[0].skeleton;
  // The original figure's raised-hand reach, before the proportions change (for ledges).
  const bones = boneMap(model);
  const soleBefore = bones.get('foot_l')!.getWorldPosition(new THREE.Vector3()).y - 0.075;
  const reachBefore = armReach(bones) - soleBefore;
  reproportion(model, gltf.animations);
  for (const m of skinned) m.removeFromParent();
  model.updateMatrixWorld(true);
  skeleton.calculateInverses();

  const mats = toyMaterials(tex);
  const parts = new Map<MatKey, THREE.BufferGeometry[]>();
  const boneIndex = new Map(skeleton.bones.map((b, i) => [b, i] as const));
  const put = (key: MatKey, bone: THREE.Bone, geo: THREE.BufferGeometry, matrix?: THREE.Matrix4) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (matrix) g.applyMatrix4(matrix);
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
    const n = g.getAttribute('position').count;
    const index = new Uint16Array(n * 4);
    const weight = new Float32Array(n * 4);
    const bi = boneIndex.get(bone) ?? 0;
    for (let i = 0; i < n; i++) {
      index[i * 4] = bi;
      weight[i * 4] = 1;
    }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(index, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weight, 4));
    const list = parts.get(key) ?? [];
    list.push(g);
    parts.set(key, list);
  };
  const B = (name: string) => bones.get(name)!;
  const W = (name: string) => B(name).getWorldPosition(new THREE.Vector3());

  // ---------------------------------------------------------------- torso and hips
  const pelvisP = W('pelvis');
  const neckP = W('neck_01');
  const headP = W('Head');
  const torsoBase = pelvisP.y - 0.085;
  const torsoTop = neckP.y + 0.04;
  const torsoH = torsoTop - torsoBase;
  const R = 0.2;
  // Profile (radius fraction, height fraction): a soft pear, widest just above the belt.
  const profile: Array<[number, number]> = [
    [0.001, 0],
    [0.55, 0.015],
    [0.86, 0.09],
    [0.98, 0.24],
    [1.0, 0.36],
    [0.96, 0.52],
    [0.86, 0.68],
    [0.7, 0.82],
    [0.5, 0.94],
    [0.42, 1.0],
  ];
  const torsoR = (t: number) => {
    for (let i = 1; i < profile.length; i++) {
      const [r0, t0] = profile[i - 1];
      const [r1, t1] = profile[i];
      if (t <= t1) return R * (r0 + ((r1 - r0) * (t - t0)) / (t1 - t0));
    }
    return R * profile[profile.length - 1][0];
  };
  const torso = new THREE.LatheGeometry(
    profile.map(([r, t]) => new THREE.Vector2(r * R, t * torsoH)),
    40,
  );
  const torsoM = new THREE.Matrix4().compose(new THREE.Vector3(pelvisP.x, torsoBase, pelvisP.z - 0.01), new THREE.Quaternion(), new THREE.Vector3(1, 1, 0.88));
  put('jacket', B('spine_02'), torso, torsoM);
  const at = (t: number) => torsoBase + t * torsoH;
  const front = (t: number, x = 0) => Math.sqrt(Math.max(0, torsoR(t) ** 2 - x * x)) * 0.88 + pelvisP.z - 0.01;
  // Collar, belt and buckle, chest pockets, buttons, and the harness straps over the shoulders.
  put('jacketDark', B('spine_03'), new THREE.TorusGeometry(torsoR(0.97) + 0.01, 0.032, 10, 32), new THREE.Matrix4().compose(new THREE.Vector3(pelvisP.x, at(0.95), pelvisP.z - 0.01), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)), new THREE.Vector3(1, 0.88, 1)));
  put('leather', B('spine_02'), new THREE.TorusGeometry(torsoR(0.2) + 0.006, 0.026, 8, 40), new THREE.Matrix4().compose(new THREE.Vector3(pelvisP.x, at(0.2), pelvisP.z - 0.01), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)), new THREE.Vector3(1, 0.88, 1)));
  put('brass', B('spine_02'), new RoundedBoxGeometry(0.07, 0.05, 0.025, 2, 0.008), new THREE.Matrix4().makeTranslation(pelvisP.x, at(0.2), front(0.2) + 0.02));
  put('leather', B('spine_02'), new RoundedBoxGeometry(0.075, 0.08, 0.05, 2, 0.015), new THREE.Matrix4().compose(new THREE.Vector3(pelvisP.x + 0.15, at(0.16), pelvisP.z + 0.06), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.9, 0)), new THREE.Vector3(1, 1, 1)));
  for (const s of [-1, 1]) {
    const t = 0.6;
    put('jacketDark', B('spine_02'), new RoundedBoxGeometry(0.065, 0.06, 0.02, 2, 0.008), new THREE.Matrix4().compose(new THREE.Vector3(pelvisP.x + s * 0.075, at(t), front(t, 0.075) - 0.002), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.15, s * 0.35, 0)), new THREE.Vector3(1, 1, 1)));
  }
  for (const t of [0.42, 0.55, 0.68]) put('brass', B('spine_02'), new THREE.SphereGeometry(0.012, 10, 8), new THREE.Matrix4().makeTranslation(pelvisP.x, at(t), front(t) + 0.004));
  // Hips: trousers, under the jacket's hem.
  put('trousers', B('pelvis'), new THREE.SphereGeometry(1, 28, 18), new THREE.Matrix4().compose(new THREE.Vector3(pelvisP.x, pelvisP.y + 0.01, pelvisP.z - 0.01), new THREE.Quaternion(), new THREE.Vector3(0.16, 0.085, 0.14)));

  // ---------------------------------------------------------------- arms
  for (const side of ['l', 'r'] as const) {
    const shoulder = W(`upperarm_${side}`);
    const elbow = W(`lowerarm_${side}`);
    const wrist = W(`hand_${side}`);
    put('jacket', B(`upperarm_${side}`), new THREE.SphereGeometry(0.068, 20, 14), new THREE.Matrix4().makeTranslation(shoulder.x, shoulder.y, shoulder.z));
    put('jacket', B(`upperarm_${side}`), capsule(shoulder, elbow, 0.058, 0.05));
    put('jacketDark', B(`lowerarm_${side}`), new THREE.SphereGeometry(0.05, 16, 12), new THREE.Matrix4().makeTranslation(elbow.x, elbow.y, elbow.z));
    put('jacket', B(`lowerarm_${side}`), capsule(elbow, wrist, 0.05, 0.044));
    const cuffAt = wrist.clone().lerp(elbow, 0.12);
    put('jacketDark', B(`lowerarm_${side}`), new THREE.TorusGeometry(0.047, 0.014, 8, 20), alignMatrix(cuffAt, wrist.clone().sub(elbow), new THREE.Vector3(0, 0, 1)));
    // Mitten: along the hand toward the middle finger, wide across the knuckles.
    const mid = W(`middle_01_${side}`);
    const index = W(`index_01_${side}`);
    const pinky = W(`pinky_01_${side}`);
    const along = mid.clone().sub(wrist).normalize();
    const across = index.clone().sub(pinky).normalize();
    const palmNormal = new THREE.Vector3().crossVectors(along, across).normalize();
    across.crossVectors(palmNormal, along).normalize();
    const mitten = new THREE.Matrix4().makeBasis(across, along, palmNormal);
    mitten.scale(new THREE.Vector3(0.05, 0.064, 0.034));
    mitten.setPosition(wrist.clone().addScaledVector(along, 0.05));
    put('leather', B(`hand_${side}`), new THREE.SphereGeometry(1, 20, 14), mitten);
    const thumb0 = W(`thumb_01_${side}`);
    const thumb2 = W(`thumb_03_${side}`);
    const tdir = thumb2.clone().sub(thumb0).normalize();
    put('leather', B(`hand_${side}`), capsule(thumb0.clone().addScaledVector(tdir, 0.005), thumb0.clone().addScaledVector(tdir, 0.05), 0.02, 0.018));
  }

  // ---------------------------------------------------------------- legs and boots
  let soleY = Infinity;
  for (const side of ['l', 'r'] as const) {
    const hip = W(`thigh_${side}`);
    const knee = W(`calf_${side}`);
    const ankle = W(`foot_${side}`);
    const ball = W(`ball_${side}`);
    put('trousers', B(`thigh_${side}`), capsule(hip, knee, 0.072, 0.064));
    put('trousers', B(`calf_${side}`), new THREE.SphereGeometry(0.062, 16, 12), new THREE.Matrix4().makeTranslation(knee.x, knee.y, knee.z));
    put('trousers', B(`calf_${side}`), capsule(knee, ankle, 0.06, 0.055));
    // Boot: a cuffed shaft round the ankle and a round-toed foot, on a darker sole.
    const fwd = ball.clone().sub(ankle).setY(0).normalize();
    const sole = ankle.y - 0.075;
    soleY = Math.min(soleY, sole);
    const shaft = new THREE.CylinderGeometry(0.066, 0.07, 0.11, 18);
    put('leather', B(`foot_${side}`), shaft, new THREE.Matrix4().makeTranslation(ankle.x, sole + 0.07, ankle.z));
    put('leather', B(`foot_${side}`), new THREE.TorusGeometry(0.068, 0.014, 8, 20), new THREE.Matrix4().compose(new THREE.Vector3(ankle.x, sole + 0.125, ankle.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)), new THREE.Vector3(1, 1, 1)));
    const toeCenter = ankle.clone().addScaledVector(fwd, 0.05).setY(sole + 0.042);
    const boot = new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), fwd).normalize(), new THREE.Vector3(0, 1, 0), fwd);
    boot.setPosition(toeCenter);
    put('leather', B(`foot_${side}`), new RoundedBoxGeometry(0.125, 0.085, 0.21, 3, 0.04), boot);
    const soleM = boot.clone().multiply(new THREE.Matrix4().makeTranslation(0, -0.04, 0));
    put('sole', B(`foot_${side}`), new RoundedBoxGeometry(0.135, 0.022, 0.22, 2, 0.01), soleM);
  }

  // ---------------------------------------------------------------- head (static parts)
  const head = B('Head');
  const C = headP.clone().add(new THREE.Vector3(0, 0.2, 0.02));
  const HR = new THREE.Vector3(0.25, 0.255, 0.235);
  put('skin', head, new THREE.SphereGeometry(1, 48, 36), new THREE.Matrix4().compose(C, new THREE.Quaternion(), HR));
  // Nose, a little forward of the face.
  put('skin', head, new THREE.SphereGeometry(0.03, 14, 10), new THREE.Matrix4().compose(C.clone().add(new THREE.Vector3(0, -0.035, 0.232)), new THREE.Quaternion(), new THREE.Vector3(1, 0.85, 0.9)));
  // Hair: a cap over the top and back, a swept fringe, and two buns with coral ties.
  const onHead = (geo: THREE.BufferGeometry, scale: number, tiltX: number) => {
    geo.rotateX(tiltX);
    return new THREE.Matrix4().compose(C, new THREE.Quaternion(), HR.clone().multiplyScalar(scale));
  };
  const cap = new THREE.SphereGeometry(1, 48, 28, 0, Math.PI * 2, 0, Math.PI * 0.6);
  put('hair', head, cap, onHead(cap, 1.045, -1.02));
  // A soft fringe swept to one side, and a lock in front of each ear.
  const fringe = new THREE.SphereGeometry(1, 24, 16);
  put('hair', head, fringe, new THREE.Matrix4().compose(C.clone().add(new THREE.Vector3(-0.045, 0.165, 0.175)), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.75, 0.25, -0.42)), new THREE.Vector3(0.12, 0.05, 0.06)));
  for (const s of [-1, 1]) {
    put('hair', head, capsule(C.clone().add(new THREE.Vector3(s * 0.225, 0.07, 0.06)), C.clone().add(new THREE.Vector3(s * 0.205, -0.06, 0.095)), 0.03, 0.018));
  }
  for (const s of [-1, 1]) {
    const bun = C.clone().add(new THREE.Vector3(s * 0.155, 0.205, -0.05));
    put('hair', head, new THREE.SphereGeometry(0.098, 24, 18), new THREE.Matrix4().makeTranslation(bun.x, bun.y, bun.z));
    put('accent', head, new THREE.TorusGeometry(0.06, 0.018, 8, 20), alignMatrix(bun.clone().lerp(C, 0.32), bun.clone().sub(C), new THREE.Vector3(0, 0, 1)));
  }
  // Brass goggles pushed up on the forehead: a leather strap following the head, two cups.
  const strapTilt = -0.62;
  const strap = new THREE.SphereGeometry(1, 56, 3, 0, Math.PI * 2, Math.PI / 2 - 0.075, 0.15);
  put('leather', head, strap, onHead(strap, 1.075, strapTilt));
  const onStrap = (phi: number) => {
    const p = new THREE.Vector3(Math.sin(phi), 0, Math.cos(phi)).applyAxisAngle(new THREE.Vector3(1, 0, 0), strapTilt);
    return { at: p.clone().multiply(HR).multiplyScalar(1.08).add(C), normal: p.clone().divide(HR).normalize() };
  };
  for (const s of [-1, 1]) {
    const { at: cupAt, normal } = onStrap(s * 0.36);
    put('brass', head, new THREE.CylinderGeometry(0.056, 0.064, 0.05, 28), alignMatrix(cupAt.clone().addScaledVector(normal, 0.018), normal));
    put('sole', head, new THREE.CylinderGeometry(0.05, 0.05, 0.006, 28), alignMatrix(cupAt.clone().addScaledVector(normal, 0.044), normal));
    put('lens', head, new THREE.CylinderGeometry(0.044, 0.044, 0.008, 28), alignMatrix(cupAt.clone().addScaledVector(normal, 0.046), normal));
  }
  {
    const a = onStrap(-0.12).at;
    const b = onStrap(0.12).at;
    put('brass', head, capsule(a, b, 0.012, 0.012));
  }

  // ---------------------------------------------------------------- merge into skinned meshes
  const out = new THREE.Group();
  out.name = 'toy-hero';
  model.add(out);
  const materials: THREE.Material[] = [];
  for (const [key, geos] of parts) {
    const geometry = mergeGeometries(geos, false);
    if (!geometry) continue;
    const mesh = new THREE.SkinnedMesh(geometry, mats[key]);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    out.add(mesh);
    mesh.bind(skeleton, new THREE.Matrix4());
    materials.push(mats[key]);
  }
  const face = new ToyFace(head, C, HR, mats);
  materials.push(mats.eye, mats.white, mats.mouth, mats.skin, mats.hair);

  const reachAfter = armReach(bones) - soleY;
  // Feet on the ground.
  model.position.y = -soleY;
  model.updateMatrixWorld(true);
  const fit: ToyFit = {
    height: C.y + HR.y * 1.1 - soleY + 0.1,
    pivotY: (pelvisP.y + C.y) / 2 - soleY,
    chestY: at(0.6) - soleY,
    eyeY: C.y - soleY + 0.03,
    backZ: -(torsoR(0.62) * 0.88) - 0.07,
    scarfScale: (torsoR(0.97) + 0.03) / 0.1,
    scarfFront: torsoR(0.85) * 0.88 + 0.02,
    hangLift: Math.max(0, reachBefore - reachAfter),
  };
  return { model, materials: [...new Set(materials)], face, fit };
}

/** Height of the hands held straight up above the shoulders (raised-arm reach). */
function armReach(bones: Map<string, THREE.Bone>): number {
  const shoulder = bones.get('upperarm_l')!.getWorldPosition(new THREE.Vector3());
  const len =
    bones.get('lowerarm_l')!.position.length() + bones.get('hand_l')!.position.length() + bones.get('middle_01_l')!.position.length() * 1.6;
  return shoulder.y + len;
}

function toyMaterials(tex: TextureLibrary): Record<MatKey, THREE.MeshStandardMaterial> {
  const cloth = (color: string, roughness = 0.92) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness, normalMap: tex.smock.normalMap });
    m.normalScale.set(0.35, 0.35);
    return m;
  };
  return {
    skin: new THREE.MeshStandardMaterial({ color: TOY_COLORS.skin, roughness: 0.58 }),
    jacket: cloth(TOY_COLORS.jacket),
    jacketDark: cloth(TOY_COLORS.jacketDark),
    trousers: cloth(TOY_COLORS.trousers, 0.88),
    leather: new THREE.MeshStandardMaterial({ color: TOY_COLORS.leather, roughness: 0.55 }),
    sole: new THREE.MeshStandardMaterial({ color: TOY_COLORS.sole, roughness: 0.8 }),
    hair: new THREE.MeshStandardMaterial({ color: TOY_COLORS.hair, roughness: 0.42 }),
    brass: new THREE.MeshStandardMaterial({ color: TOY_COLORS.brass, roughness: 0.32, metalness: 0.85 }),
    lens: new THREE.MeshStandardMaterial({ color: TOY_COLORS.lens, roughness: 0.06, metalness: 0.3 }),
    accent: new THREE.MeshStandardMaterial({ color: TOY_COLORS.accent, roughness: 0.9 }),
    mouth: new THREE.MeshStandardMaterial({ color: TOY_COLORS.mouth, roughness: 0.6 }),
    eye: new THREE.MeshStandardMaterial({ map: eyeTexture(), roughness: 0.12 }),
    white: new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 1.2, roughness: 1 }),
  };
}

/** A capsule from `a` to `b` whose radius tapers from `ra` to `rb`, in world (model) space. */
function capsule(a: THREE.Vector3, b: THREE.Vector3, ra: number, rb: number): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = -Math.PI / 2 + (i / 8) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.max(1e-4, ra * Math.cos(t)), ra * Math.sin(t)));
  }
  for (let i = 1; i <= 8; i++) {
    const t = (i / 8) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.max(1e-4, rb * Math.cos(t)), len + rb * Math.sin(t)));
  }
  const g = new THREE.LatheGeometry(pts, 20);
  const dir = b.clone().sub(a).normalize();
  g.applyMatrix4(new THREE.Matrix4().compose(a, new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir), new THREE.Vector3(1, 1, 1)));
  return g;
}

/** A matrix placing a geometry's `local` axis along `dir` at `at`. */
function alignMatrix(at: THREE.Vector3, dir: THREE.Vector3, local = new THREE.Vector3(0, 1, 0)): THREE.Matrix4 {
  return new THREE.Matrix4().compose(at, new THREE.Quaternion().setFromUnitVectors(local, dir.clone().normalize()), new THREE.Vector3(1, 1, 1));
}

/**
 * The eyeball's texture: white, with the iris and pupil painted round the top of the sphere's UV
 * map (the sphere is turned so that pole looks forward). Teal iris, darker rim, flecks.
 */
function eyeTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f7f3ea';
  g.fillRect(0, 0, 256, 256);
  // Rows from the top: pupil, iris, rim. The sphere's pole sits at v = 1 (the canvas top).
  const iris = 0.26;
  const pupil = 0.12;
  for (let y = 0; y < 256 * iris; y++) {
    const v = y / 256;
    if (v < pupil) {
      g.fillStyle = '#0b0d0e';
    } else {
      const k = (v - pupil) / (iris - pupil);
      const r = Math.round(30 + k * 20);
      const gg = Math.round(120 + (1 - k) * 40);
      const b = Math.round(118 + (1 - k) * 20);
      g.fillStyle = k > 0.86 ? '#163a3a' : `rgb(${r}, ${gg}, ${b})`;
    }
    g.fillRect(0, y, 256, 1);
  }
  // Radial flecks in the iris (vertical streaks in UV).
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * 256;
    g.fillStyle = `rgba(${200 + Math.random() * 55}, ${180 + Math.random() * 60}, 120, 0.35)`;
    g.fillRect(x, 256 * pupil, 1.5, 256 * (iris - pupil) * (0.5 + Math.random() * 0.4));
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export type ToyMood = 'neutral' | 'happy' | 'surprised' | 'determined' | 'worried';

/**
 * The toy's living face, on the head bone: eyes that look and blink, lids that close as she
 * falls asleep, brows and a mouth for each mood.
 */
export class ToyFace {
  mood: ToyMood = 'neutral';
  /** 0 awake, 1 eyes closed (asleep). */
  sleep = 0;
  /** Where the eyes look (radians, relative to the face): yaw right-positive, pitch up-positive. */
  readonly look = new THREE.Vector2();
  private readonly eyes: THREE.Object3D[] = [];
  private readonly glints: THREE.Object3D[] = [];
  private readonly lids: THREE.Object3D[] = [];
  private readonly brows: Array<{ obj: THREE.Object3D; base: THREE.Vector3; side: number }> = [];
  private readonly mouths = new Map<string, THREE.Object3D>();
  private blink = 0;
  private nextBlink = 2.5;
  private lid = 0;
  private browLift = 0;
  private browTilt = 0;
  private wander = new THREE.Vector2();
  private nextWander = 1.5;
  private readonly eyeLook = new THREE.Vector2();
  private time = 0;

  constructor(head: THREE.Bone, C: THREE.Vector3, HR: THREE.Vector3, mats: Record<MatKey, THREE.Material>) {
    const er = 0.068;
    const surfaceZ = (x: number, y: number) => HR.z * Math.sqrt(Math.max(0, 1 - (x / HR.x) ** 2 - (y / HR.y) ** 2));
    const eyeball = new THREE.SphereGeometry(er, 32, 24);
    eyeball.rotateX(Math.PI / 2);
    const lidGeo = new THREE.SphereGeometry(er * 1.07, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    const lash = new THREE.TorusGeometry(er * 1.07, 0.006, 6, 24, Math.PI);
    lash.rotateX(Math.PI / 2);
    for (const s of [-1, 1]) {
      const x = s * 0.088;
      const y = 0.035;
      const center = C.clone().add(new THREE.Vector3(x, y, surfaceZ(x, y) - er * 0.55));
      const pivot = new THREE.Group();
      pivot.position.copy(center);
      const eye = new THREE.Mesh(eyeball, mats.eye);
      pivot.add(eye);
      // A catch-light that stays put while the eye turns.
      const glint = new THREE.Mesh(new THREE.SphereGeometry(0.008, 10, 8), mats.white);
      glint.position.set(-0.016, 0.02, er * 0.97);
      pivot.add(glint);
      this.glints.push(glint);
      const lidPivot = new THREE.Group();
      const lid = new THREE.Mesh(lidGeo, mats.skin);
      const lashLine = new THREE.Mesh(lash, mats.mouth);
      lidPivot.add(lid, lashLine);
      pivot.add(lidPivot);
      this.attach(head, pivot);
      this.eyes.push(eye);
      this.lids.push(lidPivot);
      // Brow: a short, thick arc above the eye.
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-0.04, -0.004, 0), new THREE.Vector3(0, 0.012, 0.006), new THREE.Vector3(0.04, -0.004, 0));
      const brow = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.012, 8, false), mats.hair);
      const by = 0.125;
      const bx = s * 0.09;
      brow.position.copy(C).add(new THREE.Vector3(bx, by, surfaceZ(bx, by) + 0.004));
      brow.rotation.set(-0.35, s * 0.25, 0);
      this.attach(head, brow);
      this.brows.push({ obj: brow, base: brow.position.clone(), side: s });
    }
    // Mouths: a small smile, a wide grin, an "o", and a flat line. One shows at a time.
    const my = -0.105;
    const mouthAt = C.clone().add(new THREE.Vector3(0, my, surfaceZ(0, my) + 0.002));
    const tilt = new THREE.Euler(0.42, 0, 0);
    const smile = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(-0.042, 0.01, -0.006), new THREE.Vector3(0, -0.02, 0.006), new THREE.Vector3(0.042, 0.01, -0.006)), 14, 0.008, 6, false), mats.mouth);
    const grinShape = new THREE.Shape();
    grinShape.moveTo(-0.05, 0.008);
    grinShape.quadraticCurveTo(0, -0.07, 0.05, 0.008);
    grinShape.quadraticCurveTo(0, -0.006, -0.05, 0.008);
    const grin = new THREE.Mesh(new THREE.ShapeGeometry(grinShape, 12), mats.mouth);
    const teeth = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.012, 0.002), mats.white);
    teeth.position.set(0, -0.004, 0.001);
    grin.add(teeth);
    const o = new THREE.Mesh(new THREE.CircleGeometry(0.022, 20), mats.mouth);
    o.scale.set(0.85, 1.1, 1);
    const flat = new THREE.Mesh(new THREE.TubeGeometry(new THREE.LineCurve3(new THREE.Vector3(-0.032, 0, 0), new THREE.Vector3(0.032, 0, 0)), 4, 0.007, 6, false), mats.mouth);
    for (const [name, m] of [
      ['smile', smile],
      ['grin', grin],
      ['o', o],
      ['flat', flat],
    ] as Array<[string, THREE.Mesh]>) {
      m.position.copy(mouthAt);
      m.rotation.copy(tilt);
      m.visible = name === 'smile';
      this.attach(head, m);
      this.mouths.set(name, m);
    }
  }

  private attach(head: THREE.Bone, o: THREE.Object3D): void {
    head.parent!.updateMatrixWorld(true);
    head.attach(o);
    o.traverse((c) => {
      if ((c as THREE.Mesh).isMesh) {
        c.castShadow = false;
        c.receiveShadow = true;
      }
    });
  }

  update(dt: number): void {
    this.time += dt;
    // Blinks every few seconds (a quick close and open).
    this.nextBlink -= dt;
    if (this.nextBlink <= 0) {
      this.blink = 1;
      this.nextBlink = 2.2 + Math.random() * 3.5;
    }
    this.blink = Math.max(0, this.blink - dt * 7);
    const blinkClose = this.blink > 0 ? Math.sin(this.blink * Math.PI) : 0;
    // Little glances when nothing holds her attention.
    this.nextWander -= dt;
    if (this.nextWander <= 0) {
      this.wander.set((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.25);
      this.nextWander = 0.8 + Math.random() * 2.2;
    }
    const target = this.look.lengthSq() > 1e-4 ? this.look : this.wander;
    const k = 1 - Math.exp(-dt * 18);
    this.eyeLook.x += (THREE.MathUtils.clamp(target.x, -0.5, 0.5) - this.eyeLook.x) * k;
    this.eyeLook.y += (THREE.MathUtils.clamp(target.y, -0.3, 0.3) - this.eyeLook.y) * k;
    for (const e of this.eyes) e.rotation.set(-this.eyeLook.y, this.eyeLook.x, 0);
    // Lids: open, a little wider when surprised, lower when happy or determined, shut asleep.
    const openAngle = this.mood === 'surprised' ? -1.2 : this.mood === 'happy' ? -0.62 : this.mood === 'determined' ? -0.55 : -0.92;
    const closed = Math.max(this.sleep, blinkClose);
    const lidTarget = THREE.MathUtils.lerp(openAngle, 1.3, closed);
    this.lid += (lidTarget - this.lid) * (1 - Math.exp(-dt * (blinkClose > 0 ? 40 : 14)));
    for (const l of this.lids) l.rotation.x = this.lid - this.eyeLook.y * 0.3;
    // The catch-lights sit in front of the eyes: they go when the lids close over them.
    for (const g of this.glints) g.visible = this.lid < 0.25;
    // Brows and mouth.
    const lift = this.mood === 'surprised' ? 0.022 : this.mood === 'happy' ? 0.008 : this.mood === 'worried' ? 0.01 : this.mood === 'determined' ? -0.008 : 0;
    const tilt = this.mood === 'determined' ? -0.32 : this.mood === 'worried' ? 0.35 : 0;
    const bk = 1 - Math.exp(-dt * 12);
    this.browLift += (lift - this.sleep * 0.01 - this.browLift) * bk;
    this.browTilt += (tilt - this.browTilt) * bk;
    for (const b of this.brows) {
      b.obj.position.copy(b.base);
      b.obj.position.y += this.browLift;
      b.obj.rotation.z = b.side * this.browTilt;
    }
    const mouth = this.sleep > 0.6 ? 'flat' : this.mood === 'happy' ? 'grin' : this.mood === 'surprised' ? 'o' : this.mood === 'determined' || this.mood === 'worried' ? 'flat' : 'smile';
    for (const [name, m] of this.mouths) m.visible = name === mouth;
  }
}
