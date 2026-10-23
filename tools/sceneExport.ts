import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Dev-only: export a loaded chapter (its static world) or the toy hero (skinned, with every
 * clip) as binary glTF for other tools, Unreal Engine in particular. Loaded into the running game
 * page by scripts/export-unreal.mjs.
 *
 * The level export flattens the scene into world-space meshes (shared geometry stays shared, so
 * repeated props become one mesh asset placed many times), merges each instanced mesh (the
 * foliage) into one mesh, replaces the water shaders (the sea, the hall's pool, the lagoon) with a
 * plain translucent material, and keeps point, spot and directional lights. It leaves out what only
 * exists at run time or only reads in this renderer: Mara, the sky dome, glow sprites, particles,
 * additive light shafts and searchlight cones, and invisible helpers. Physics colliders are not
 * meshes and do not come along.
 */

export interface ExportResult {
  base64: string;
  stats: Record<string, unknown>;
}

const EXPORTABLE = new Set(['MeshStandardMaterial', 'MeshPhysicalMaterial', 'MeshBasicMaterial', 'MeshLambertMaterial', 'MeshPhongMaterial']);

const shown = (o: THREE.Object3D) => {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
  return true;
};

/** A readable name from the object and its named ancestors ("Village/Cottage/Door"). */
function nameOf(o: THREE.Object3D, fallback: string): string {
  const parts: string[] = [];
  for (let p: THREE.Object3D | null = o; p && parts.length < 3; p = p.parent) if (p.name && !(p as THREE.Scene).isScene) parts.unshift(p.name);
  return (parts.join('_') || fallback).replace(/[^A-Za-z0-9_-]+/g, '_');
}

const triangles = (g: THREE.BufferGeometry) => (g.index ? g.index.count : g.getAttribute('position').count) / 3;

/** Opaque colour maps go out as JPEG (small); anything with alpha stays PNG. */
function preferJpeg(mat: THREE.Material): void {
  const m = mat as THREE.MeshStandardMaterial;
  const alpha = m.transparent || m.alphaTest > 0 || !!m.alphaMap;
  for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'] as const) {
    const t = m[key];
    if (t && !(key === 'map' && alpha)) t.userData.mimeType = 'image/jpeg';
  }
}

/** One mesh from every instance of an instanced mesh (instance colours baked into vertex colours). */
function mergeInstances(im: THREE.InstancedMesh): THREE.BufferGeometry | null {
  const parts: THREE.BufferGeometry[] = [];
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  for (let i = 0; i < im.count; i++) {
    im.getMatrixAt(i, m);
    const g = im.geometry.clone().applyMatrix4(m);
    if (im.instanceColor) {
      im.getColorAt(i, c);
      const n = g.getAttribute('position').count;
      const base = g.getAttribute('color') as THREE.BufferAttribute | undefined;
      const col = new Float32Array(n * 3);
      for (let k = 0; k < n; k++) {
        col[k * 3] = c.r * (base ? base.getX(k) : 1);
        col[k * 3 + 1] = c.g * (base ? base.getY(k) : 1);
        col[k * 3 + 2] = c.b * (base ? base.getZ(k) : 1);
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }
    parts.push(g);
  }
  return parts.length ? mergeGeometries(parts, false) : null;
}

async function toBase64(root: THREE.Object3D, options: Record<string, unknown>): Promise<{ base64: string; bytes: number }> {
  const glb = (await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: true, maxTextureSize: 2048, ...options })) as ArrayBuffer;
  const bytes = new Uint8Array(glb);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { base64: btoa(bin), bytes: bytes.length };
}

/** The chapter's static world as one glTF scene. `skip`: subtrees to leave out (Mara, her scarf). */
export async function exportLevel(scene: THREE.Scene, name: string, skip: THREE.Object3D[] = []): Promise<ExportResult> {
  scene.updateMatrixWorld(true);
  const skipped = new Set<THREE.Object3D>();
  for (const s of skip) s.traverse((o) => skipped.add(o));
  const root = new THREE.Group();
  root.name = name;
  const water = new THREE.MeshStandardMaterial({ name: 'Sea', color: '#2c6878', roughness: 0.06, metalness: 0, transparent: true, opacity: 0.8 });
  const left: Record<string, number> = {};
  const leaveOut = (why: string) => (left[why] = (left[why] ?? 0) + 1);
  let meshes = 0;
  let merged = 0;
  let lights = 0;
  let tris = 0;
  const place = (src: THREE.Object3D, dst: THREE.Object3D, world = src.matrixWorld) => {
    world.decompose(dst.position, dst.quaternion, dst.scale);
    root.add(dst);
  };

  scene.traverse((o) => {
    if (skipped.has(o)) return;
    if (!shown(o)) return;
    const light = o as THREE.Light;
    if (light.isLight) {
      if ((light as THREE.HemisphereLight).isHemisphereLight) return leaveOut('hemisphere light (use a Sky Light)');
      const l = light.clone(false) as THREE.Light;
      l.name = nameOf(o, light.type);
      const t = (light as THREE.DirectionalLight | THREE.SpotLight).target;
      if (t) {
        // glTF lights shine down their local -Z; three's lookAt on a light turns its -Z to the
        // point, so aim the copy at the original's target.
        o.matrixWorld.decompose(l.position, l.quaternion, l.scale);
        t.updateMatrixWorld(true);
        l.lookAt(new THREE.Vector3().setFromMatrixPosition(t.matrixWorld));
        const nt = new THREE.Object3D();
        nt.position.set(0, 0, -1);
        (l as THREE.DirectionalLight).target = nt;
        l.add(nt);
        root.add(l);
      } else place(o, l);
      lights++;
      return;
    }
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) {
      if ((o as THREE.Points).isPoints) leaveOut('particles');
      else if ((o as THREE.Sprite).isSprite) leaveOut('glow sprite');
      else if ((o as THREE.Line).isLine) leaveOut('line');
      return;
    }
    if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) return leaveOut('skinned mesh');
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    let material: THREE.Material | THREE.Material[] = mesh.material;
    if (mats.some((m) => !EXPORTABLE.has(m.type))) {
      const sm = mats[0] as THREE.ShaderMaterial;
      // The sea and the hall's water (the ocean shader: `deep`; the lagoon: `level`).
      if (mats.length === 1 && sm.uniforms && ('level' in sm.uniforms || 'deep' in sm.uniforms)) material = water;
      else return leaveOut(`shader (${nameOf(o, mats[0].type)})`);
    }
    for (const m of Array.isArray(material) ? material : [material]) preferJpeg(m);
    if ((mesh as THREE.InstancedMesh).isInstancedMesh) {
      const im = mesh as THREE.InstancedMesh;
      const g = mergeInstances(im);
      if (!g) return;
      const one = Array.isArray(material) ? material : (material as THREE.Material);
      const withColour = im.instanceColor && !Array.isArray(one) ? Object.assign((one as THREE.MeshStandardMaterial).clone(), { vertexColors: true }) : one;
      const out = new THREE.Mesh(g, withColour);
      out.name = nameOf(o, 'Instances');
      place(o, out);
      merged += im.count;
      tris += triangles(g);
      meshes++;
      return;
    }
    const out = new THREE.Mesh(mesh.geometry, material);
    out.name = nameOf(o, 'Mesh');
    place(o, out);
    tris += triangles(mesh.geometry);
    meshes++;
  });

  const { base64, bytes } = await toBase64(root, {});
  return { base64, stats: { name, bytes, meshes, mergedInstances: merged, lights, triangles: Math.round(tris), leftOut: left } };
}

/** The toy hero as a skinned glTF with every clip (her face, goggles, canister and scarf wrap ride on bones). */
export async function exportCharacter(model: THREE.Object3D, clips: THREE.AnimationClip[]): Promise<ExportResult> {
  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) for (const mat of Array.isArray(m.material) ? m.material : [m.material]) preferJpeg(mat);
  });
  const { base64, bytes } = await toBase64(model, { animations: clips });
  return { base64, stats: { name: 'Mara', bytes, clips: clips.map((c) => c.name) } };
}
