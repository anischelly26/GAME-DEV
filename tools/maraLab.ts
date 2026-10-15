import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { retargetClip, rigifyToUE, sameNames } from './retarget';

/**
 * Dev-only lab for the CC0 character assets in import-cache/quaternius (git-ignored). Loads the
 * base female, an outfit, a hairstyle and the animation libraries, retargets clips, plays them,
 * and exposes window.__LAB for scripted inspection. Open /tools/mara-lab.html on the dev server.
 */
const Q = '/import-cache/quaternius/';
const app = document.getElementById('app')!;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(app.clientWidth, app.clientHeight);
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
app.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#2a3036');
const camera = new THREE.PerspectiveCamera(30, app.clientWidth / app.clientHeight, 0.05, 100);
scene.add(new THREE.HemisphereLight('#c9d6e2', '#3b3328', 1.0));
const key = new THREE.DirectionalLight('#ffe2c4', 2.5);
key.position.set(1.6, 3, 2.2);
key.castShadow = true;
scene.add(key);
const floor = new THREE.Mesh(new THREE.CircleGeometry(4, 48), new THREE.MeshStandardMaterial({ color: '#4a4f52' }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const gltf = new GLTFLoader();
const load = (url: string) => gltf.loadAsync(encodeURI(url));
const lab: Record<string, unknown> = { ready: false };
(window as unknown as { __LAB: typeof lab }).__LAB = lab;

function bonesOf(root: THREE.Object3D): Map<string, THREE.Bone> {
  const m = new Map<string, THREE.Bone>();
  root.traverse((o) => ((o as THREE.Bone).isBone && !m.has(o.name) ? m.set(o.name, o as THREE.Bone) : null));
  return m;
}

async function main() {
  const base = await load(`${Q}Base Characters/Godot - UE/Superhero_Female_FullBody.gltf`);
  const outfit = await load(`${Q}Exports/glTF (Godot-Unreal)/Outfits/Female_Ranger.gltf`);
  const hair = await load(`${Q}Hairstyles/Rigged to Head Bone/glTF (Godot -Unreal)/Hair_Buns.gltf`);
  const ual1 = await load(`${Q}UAL1_Standard.glb`);
  const ual2 = await load(`${Q}UAL2_Standard.glb`);

  dressAsMara(base.scene, outfit.scene, hair.scene);
  const target = { root: base.scene, bones: bonesOf(base.scene), hips: 'pelvis' };
  const src1 = { root: ual1.scene, reference: ual1.animations.find((a) => a.name === 'A_TPose')! };
  const src2 = { root: ual2.scene, reference: ual2.animations.find((a) => a.name === 'A_TPose')! };
  const map1 = rigifyToUE();
  const map2 = sameNames(target.bones.keys());
  const clips = new Map<string, THREE.AnimationClip>();
  const t0 = performance.now();
  for (const name of ['Idle_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Jump_Start', 'Jump_Loop', 'Jump_Land', 'Interact', 'Roll']) {
    const c = ual1.animations.find((a) => a.name === name);
    if (c) clips.set(name, retargetClip(src1, c, target, map1));
  }
  for (const name of ['ClimbUp_1m_RM', 'Hit_Knockback', 'NinjaJump_Start', 'NinjaJump_Idle_Loop', 'NinjaJump_Land', 'Idle_Rail_Loop']) {
    const c = ual2.animations.find((a) => a.name === name);
    if (c) clips.set(name, retargetClip(src2, c, target, map2));
  }
  lab.retargetMs = Math.round(performance.now() - t0);
  lab.clipNames = [...clips.keys()];

  // Line-up: one dressed character per clip being reviewed.
  const mixers: THREE.AnimationMixer[] = [];
  const show = (clipName: string, x: number) => {
    const group = new THREE.Group();
    group.position.x = x;
    // Separate copies of the dressed character (head from the base, outfit, hair) for each clip.
    for (const src of [base, outfit, hair]) {
      const copy = src.scene.clone(true);
      // SkinnedMesh clones keep their skeleton bound to the cloned bones via SkeletonUtils-like rebind.
      rebindClone(src.scene, copy);
      group.add(copy);
      const m = new THREE.AnimationMixer(copy);
      m.clipAction(clips.get(clipName)!).play();
      mixers.push(m);
    }
    scene.add(group);
  };
  const lineup = ['Idle_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Jump_Loop', 'ClimbUp_1m_RM'];
  lineup.forEach((n, i) => show(n, (i - 2) * 1.3));
  scene.traverse((o) => ((o as THREE.Mesh).isMesh ? ((o.castShadow = true), (o.frustumCulled = false)) : null));

  const clock = new THREE.Clock();
  lab.view = (a: number, d: number, y: number, ly: number, x = 0) => {
    camera.position.set(x + Math.sin(a) * d, y, Math.cos(a) * d);
    camera.lookAt(x, ly, 0);
  };
  (lab.view as (a: number, d: number, y: number, ly: number) => void)(0.2, 9, 1.6, 0.9);
  lab.seek = (t: number) => mixers.forEach((m) => m.setTime(t));
  renderer.setAnimationLoop(() => {
    const dt = clock.getDelta();
    mixers.forEach((m) => m.update(dt));
    renderer.render(scene, camera);
  });
  lab.ready = true;
}

/** Head only from the base body, no hood or pauldrons, hair tint, ochre in place of ranger green. */
function dressAsMara(base: THREE.Object3D, outfit: THREE.Object3D, hair: THREE.Object3D) {
  base.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isSkinnedMesh || m.name !== 'Superhero_Female') return;
    keepHead(m);
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
function keepHead(mesh: THREE.SkinnedMesh) {
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
function recolour(tex: THREE.Texture): THREE.Texture {
  const img = tex.image as HTMLImageElement | ImageBitmap;
  const size = 2048;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.drawImage(img as CanvasImageSource, 0, 0, size, size);
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
      // Green -> ochre (hue ~34), a little lighter and warmer.
      const nh = 34;
      const ns = Math.min(1, sat * 1.05);
      const nl = Math.min(1, l * 1.25 + 0.04);
      const C = (1 - Math.abs(2 * nl - 1)) * ns;
      const X = C * (1 - Math.abs(((nh / 60) % 2) - 1));
      const m = nl - C / 2;
      const [rr, g2, bb] = nh < 60 ? [C, X, 0] : [X, C, 0];
      p[i] = (rr + m) * 255;
      p[i + 1] = (g2 + m) * 255;
      p[i + 2] = (bb + m) * 255;
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

/** Rebind a cloned skinned hierarchy to its own cloned bones (Object3D.clone shares skeletons). */
function rebindClone(source: THREE.Object3D, clone: THREE.Object3D) {
  const bones = bonesOf(clone);
  const srcMeshes: THREE.SkinnedMesh[] = [];
  const dstMeshes: THREE.SkinnedMesh[] = [];
  source.traverse((o) => ((o as THREE.SkinnedMesh).isSkinnedMesh ? srcMeshes.push(o as THREE.SkinnedMesh) : null));
  clone.traverse((o) => ((o as THREE.SkinnedMesh).isSkinnedMesh ? dstMeshes.push(o as THREE.SkinnedMesh) : null));
  srcMeshes.forEach((s, i) => {
    const d = dstMeshes[i];
    const skel = new THREE.Skeleton(
      s.skeleton.bones.map((b) => bones.get(b.name)!),
      s.skeleton.boneInverses.map((m) => m.clone()),
    );
    d.bind(skel, d.bindMatrix);
  });
}

main().catch((e) => {
  lab.error = String(e?.stack ?? e);
  console.error(e);
});
