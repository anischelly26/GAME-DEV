import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { retargetClip, rigifyToUE, sameNames } from './retarget';

/**
 * Assembles Mara from Quaternius CC0 packs (see docs/ASSETS.md) cached in import-cache/quaternius:
 * the Superhero Female's head, face, eyes and brows; the Female Ranger outfit without hood or
 * pauldrons, recoloured from green to Mara's ochre; the Buns hairstyle in auburn. Clips from the
 * Universal Animation Libraries 1 and 2 are retargeted onto her skeleton and renamed for the game.
 */
export const Q = '/import-cache/quaternius/';

/** Game clip name -> [library, source clip, options]. */
export const CLIPS: Record<string, [1 | 2, string, { inPlace?: boolean }?]> = {
  idle: [1, 'Idle_Loop'],
  walk: [1, 'Walk_Loop'],
  jog: [1, 'Jog_Fwd_Loop'],
  sprint: [1, 'Sprint_Loop'],
  jumpStart: [1, 'Jump_Start'],
  jumpLoop: [1, 'Jump_Loop'],
  land: [1, 'Jump_Land'],
  interact: [1, 'Interact'],
  roll: [1, 'Roll', { inPlace: true }],
  push: [1, 'Push_Loop'],
  climb: [2, 'ClimbUp_1m_RM', { inPlace: true }],
  vault: [2, 'NinjaJump_Start', { inPlace: true }],
  airVault: [2, 'NinjaJump_Idle_Loop'],
  knockback: [2, 'Hit_Knockback'],
  railIdle: [2, 'Idle_Rail_Loop'],
};

export function bonesOf(root: THREE.Object3D): Map<string, THREE.Bone> {
  const m = new Map<string, THREE.Bone>();
  root.traverse((o) => ((o as THREE.Bone).isBone && !m.has(o.name) ? m.set(o.name, o as THREE.Bone) : null));
  return m;
}

export interface Assembled {
  root: THREE.Object3D;
  clips: THREE.AnimationClip[];
}

export async function assembleMara(): Promise<Assembled> {
  const gltf = new GLTFLoader();
  const load = (url: string) => gltf.loadAsync(encodeURI(url));
  const [base, outfit, hair, ual1, ual2] = await Promise.all([
    load(`${Q}Base Characters/Godot - UE/Superhero_Female_FullBody.gltf`),
    load(`${Q}Exports/glTF (Godot-Unreal)/Outfits/Female_Ranger.gltf`),
    load(`${Q}Hairstyles/Rigged to Head Bone/glTF (Godot -Unreal)/Hair_Buns.gltf`),
    load(`${Q}UAL1_Standard.glb`),
    load(`${Q}UAL2_Standard.glb`),
  ]);
  dressAsMara(base.scene, outfit.scene, hair.scene);

  // One skeleton: move every skinned mesh onto the base character's bones (same names, same bind).
  const root = base.scene;
  root.name = 'Mara';
  const bones = bonesOf(root);
  for (const src of [outfit.scene, hair.scene]) {
    const meshes: THREE.SkinnedMesh[] = [];
    src.traverse((o) => ((o as THREE.SkinnedMesh).isSkinnedMesh && o.visible ? meshes.push(o as THREE.SkinnedMesh) : null));
    for (const m of meshes) {
      const skeleton = new THREE.Skeleton(
        m.skeleton.bones.map((b) => bones.get(b.name)!),
        m.skeleton.boneInverses.map((x) => x.clone()),
      );
      root.add(m);
      m.bind(skeleton, m.bindMatrix);
    }
  }

  const target = { root, bones, hips: 'pelvis' };
  const sources = {
    1: { root: ual1.scene, reference: ual1.animations.find((a) => a.name === 'A_TPose')!, map: rigifyToUE(), clips: ual1.animations },
    2: { root: ual2.scene, reference: ual2.animations.find((a) => a.name === 'A_TPose')!, map: sameNames(bones.keys()), clips: ual2.animations },
  };
  const clips: THREE.AnimationClip[] = [];
  for (const [name, [lib, srcName, opts]] of Object.entries(CLIPS)) {
    const s = sources[lib];
    const clip = s.clips.find((a) => a.name === srcName);
    if (!clip) throw new Error(`Missing clip ${srcName}`);
    const out = retargetClip(s, clip, target, s.map, { name });
    if (opts?.inPlace) {
      // Hold the hips at their rest position: the game's controller moves Mara.
      const hips = out.tracks.find((t) => t.name === 'pelvis.position')!;
      const rest = bones.get('pelvis')!.position;
      for (let i = 0; i < hips.values.length; i += 3) {
        hips.values[i] = rest.x;
        hips.values[i + 2] = rest.z;
      }
    }
    clips.push(out);
  }
  return { root, clips };
}

/** Head only from the base body, no hood or pauldrons, hair tint, ochre in place of ranger green. */
export function dressAsMara(base: THREE.Object3D, outfit: THREE.Object3D, hair: THREE.Object3D) {
  base.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (m.isSkinnedMesh && m.name === 'Superhero_Female') keepHead(m);
  });
  outfit.traverse((o) => {
    if (/Hood|Pauldron/.test(o.name)) o.visible = false;
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      const mat = m.material as THREE.MeshStandardMaterial;
      if (mat.name === 'MI_Ranger' && mat.map && !mat.userData.recoloured) {
        mat.map = recolour(mat.map);
        mat.userData.recoloured = true;
      }
    }
  });
  const tint = (root: THREE.Object3D, color: string) =>
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) (m.material as THREE.MeshStandardMaterial).color.set(color);
    });
  tint(hair, '#6b3a26');
  base.traverse((o) => (o.name === 'Eyebrows' ? tint(o, '#4a2a1d') : null));
}

/** Drop every triangle whose vertices are not mostly weighted to the head and neck. */
export function keepHead(mesh: THREE.SkinnedMesh) {
  const g = mesh.geometry;
  const idx = g.getIndex()!;
  const si = g.getAttribute('skinIndex');
  const sw = g.getAttribute('skinWeight');
  const names = mesh.skeleton.bones.map((b) => b.name);
  const headish = new Set(names.map((n, i) => (/^(Head|neck_01)$/.test(n) ? i : -1)).filter((i) => i >= 0));
  const isHead = (v: number) => {
    let w = 0;
    for (let k = 0; k < 4; k++) if (headish.has(si.getComponent(v, k))) w += sw.getComponent(v, k);
    return w > 0.5;
  };
  const kept: number[] = [];
  for (let i = 0; i < idx.count; i += 3) {
    const a = idx.getX(i);
    const b = idx.getX(i + 1);
    const c = idx.getX(i + 2);
    if (isHead(a) && isHead(b) && isHead(c)) kept.push(a, b, c);
  }
  g.setIndex(kept);
}

/** Shift the ranger's greens toward Mara's ochre; leather browns and metals are left alone. */
export function recolour(tex: THREE.Texture): THREE.Texture {
  const img = tex.image as CanvasImageSource;
  const size = 2048;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.drawImage(img, 0, 0, size, size);
  const d = g.getImageData(0, 0, size, size);
  const p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    const r = p[i] / 255;
    const gg = p[i + 1] / 255;
    const b = p[i + 2] / 255;
    const max = Math.max(r, gg, b);
    const min = Math.min(r, gg, b);
    const l = (max + min) / 2;
    const sat = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
    let h = 0;
    if (max !== min) {
      if (max === r) h = ((gg - b) / (max - min)) % 6;
      else if (max === gg) h = (b - r) / (max - min) + 2;
      else h = (r - gg) / (max - min) + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    if (h > 65 && h < 170 && sat > 0.12) {
      const nh = 34;
      const ns = Math.min(1, sat * 1.05);
      const nl = Math.min(1, l * 1.25 + 0.04);
      const C = (1 - Math.abs(2 * nl - 1)) * ns;
      const X = C * (1 - Math.abs(((nh / 60) % 2) - 1));
      const m = nl - C / 2;
      p[i] = (C + m) * 255;
      p[i + 1] = (X + m) * 255;
      p[i + 2] = m * 255;
    }
  }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = tex.flipY;
  t.wrapS = tex.wrapS;
  t.wrapT = tex.wrapT;
  return t;
}
