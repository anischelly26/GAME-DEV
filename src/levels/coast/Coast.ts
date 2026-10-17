import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { LevelContext } from '../Level';
import { RAPIER as R } from '../../physics/Physics';
import { Batcher, boxProjectUVs, worldBox, trs } from '../../world/geometry';
import { Water } from '../../world/Atmosphere';
import { Palette } from '../../world/materials';
import { mulberry32 } from '../../core/math';
import { Hangar } from '../../world/props/Hangar';
import { bushGeometry } from '../../world/props/Foliage';
import { glowSprite } from '../../world/props/Lanterns';
import { C, seabed } from './layout';

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** The lighthouse scan's frame: its centre (model x, z) and how far it sits down into the sea. */
const LH = { cx: 0.4, cz: 0.5, sink: -3.6 };
/** Lighthouse model point to the world. */
export function lighthouseToWorld(x: number, y: number, z: number): THREE.Vector3 {
  return v3(C.light.x + (x - LH.cx), y + LH.sink, C.light.z + (z - LH.cz));
}

export interface Coast {
  readonly root: THREE.Group;
  /** Sea level now (low water plus the surge). */
  level: number;
  /** Where Mara stands at the foot of the lighthouse stairs (out of the boat), and the gallery's door. */
  readonly stairFoot: THREE.Vector3;
  readonly door: THREE.Vector3;
  /** Climbable things (rock shelves, the slipway's edge). */
  readonly climbables: RAPIER.Collider[];
  /** Rocks big enough to hide behind (for the Watch's line of sight they are solid anyway). */
  update(dt: number, time: number, level: number, cameraPos: THREE.Vector3): void;
}

/**
 * The water between the hangar spur and Knoll Rock: the sea bed (a mesh and a matching collider),
 * water that shows its depth (sand-coloured over the bars, foam at the edges, dark in the deep), the
 * slipway, rocks and the lagoon's rock arms, channel buoys, the lighthouse on its piles with stairs
 * and a gallery Mara can climb, and the hangar behind.
 */
export function buildCoast(ctx: LevelContext, lighthouse: GLTF | null): Coast {
  const { scene, physics, materials: m } = ctx;
  const root = new THREE.Group();
  root.name = 'low-tide';
  scene.add(root);
  const batch = new Batcher();
  const rng = mulberry32(303);
  const tint = (b = 1, s = 0.08) => new THREE.Color(b + (rng() - 0.5) * s, b + (rng() - 0.5) * s, b + (rng() - 0.5) * s);
  const A = C.area;

  // ------------------------------------------------------------ the sea bed: mesh and collider
  const step = 2;
  const nx = Math.round((A.x1 - A.x0) / step);
  const nz = Math.round((A.z1 - A.z0) / step);
  const pos = new Float32Array((nx + 1) * (nz + 1) * 3);
  const uv = new Float32Array((nx + 1) * (nz + 1) * 2);
  const bedAttr = new Float32Array((nx + 1) * (nz + 1));
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const k = j * (nx + 1) + i;
      const x = A.x0 + i * step;
      const z = A.z0 + j * step;
      const y = seabed(x, z);
      pos.set([x, y, z], k * 3);
      uv.set([x / 3, z / 3], k * 2);
      bedAttr[k] = y;
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i;
      const b = a + 1;
      const c = a + nx + 1;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const bedGeo = new THREE.BufferGeometry();
  bedGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  bedGeo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  bedGeo.setIndex(idx);
  bedGeo.computeVertexNormals();
  const bed = new THREE.Mesh(bedGeo, m.sand);
  bed.receiveShadow = true;
  root.add(bed);
  physics.setSurface(physics.fixed(R.ColliderDesc.trimesh(pos, new Uint32Array(idx))), 'sand');

  // ------------------------------------------------------------ water that shows its depth
  const waterGeo = new THREE.BufferGeometry();
  const wpos = new Float32Array((nx + 1) * (nz + 1) * 3);
  for (let k = 0; k < bedAttr.length; k++) wpos.set([pos[k * 3], 0, pos[k * 3 + 2]], k * 3);
  waterGeo.setAttribute('position', new THREE.BufferAttribute(wpos, 3));
  waterGeo.setAttribute('bed', new THREE.BufferAttribute(bedAttr, 1));
  waterGeo.setIndex(idx);
  const waterMat = coastWaterMaterial(ctx.moonDir);
  const water = new THREE.Mesh(waterGeo, waterMat);
  water.frustumCulled = false;
  root.add(water);
  // The open sea beyond the play area (and under its edges).
  const sea = new Water({ radius: 900, y: -0.12, deep: new THREE.Color('#1f4a58'), moonDir: ctx.moonDir, fogDensity: 0, fogColor: Palette.fog, scale: 6, horizonFade: 750, skyMix: 0.7 });
  root.add(sea.mesh);

  // ------------------------------------------------------------ the slipway and the spur
  const S = C.slipway;
  const climbables: RAPIER.Collider[] = [];
  {
    // A concrete apron, then the ramp down into the water.
    const apron = physics.box(v3(0, S.top - 1, (S.z0 + S.z1 - 4) / 2), v3((S.x1 - S.x0) / 2, 1, (S.z1 - 4 - S.z0) / 2));
    batch.add(worldBox(S.x1 - S.x0, 2, S.z1 - 4 - S.z0, 3), m.stoneDark, trs(0, S.top - 1, (S.z0 + S.z1 - 4) / 2), { tint: tint(0.9) });
    climbables.push(apron);
    const rampLen = Math.hypot(8, S.top + 1.6);
    const ang = Math.atan2(S.top + 1.6, 8);
    const q = new THREE.Quaternion().setFromAxisAngle(v3(1, 0, 0), ang);
    const c = v3(0, (S.top - 1.6) / 2 - 0.3 * Math.cos(ang), S.z1 - 4 + 4);
    batch.add(worldBox(S.x1 - S.x0, 0.6, rampLen, 3), m.stoneDark, new THREE.Matrix4().compose(c, q, v3(1, 1, 1)), { tint: tint(0.8) });
    physics.box(c, v3((S.x1 - S.x0) / 2, 0.3, rampLen / 2), q);
    // Bollards and a winch post.
    for (const x of [-4.3, 4.3]) {
      batch.add(new THREE.CylinderGeometry(0.22, 0.28, 0.7, 10), m.ironDark, trs(x, S.top + 0.35, S.z1 - 5));
      physics.cylinder(v3(x, S.top + 0.35, S.z1 - 5), 0.35, 0.28);
    }
    // The spur: rocks either side of the slipway, rising behind it.
    for (let i = 0; i < 26; i++) {
      const side = i % 2 ? 1 : -1;
      const x = side * (7 + rng() * 16);
      const z = -22 + rng() * 22;
      const s = 2 + rng() * 3.5;
      rock(x, z, s, s * (0.7 + rng() * 0.5), 1000 + i, -1.5 + rng() * 1.5);
    }
  }

  // ------------------------------------------------------------ rocks and the lagoon's arms
  function rock(x: number, z: number, r: number, h: number, seed: number, base = seabed(x, z) - 0.3): RAPIER.Collider | null {
    const geo = bushGeometry(seed, 2, false);
    geo.scale(r, h, r);
    geo.rotateY(rng() * 6);
    geo.translate(x, base + h * 0.55, z);
    batch.add(boxProjectUVs(geo, 2.5), m.rock, undefined, { tint: tint(0.95, 0.18) });
    const p = geo.getAttribute('position');
    const pts: number[] = [];
    for (let i = 0; i < p.count; i += 3) pts.push(p.getX(i), p.getY(i), p.getZ(i));
    return physics.convex(pts);
  }
  // Open-water rocks: obstacles and cover on the way.
  for (const [x, z, r, h] of [
    [-10, 34, 2.6, 3.2],
    [16, 36, 2.0, 2.8],
    [22, 30, 1.4, 2.4],
    [-4, 58, 2.4, 3.4],
    [42, 58, 3.0, 3.6],
    [-30, 60, 3.2, 3.4],
    [52, 36, 2.5, 3.0],
  ]) {
    rock(x, z, r, h, Math.round(x * 13 + z));
  }
  // The arms: a broken ring of big rocks round Knoll Rock, open at the mouth (south).
  {
    const L = C.light;
    const n = 30;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const x = L.x + Math.sin(a) * C.lagoonR;
      const z = L.z + Math.cos(a) * C.lagoonR;
      if (x > C.mouth.x0 && x < C.mouth.x1 && z < L.z) continue;
      const r = 3.2 + rng() * 1.4;
      rock(x, z, r, 3.6 + rng() * 2.2, 2000 + i);
    }
    // Inside the lagoon: a few rocks to hide behind from the patrol.
    for (const [a, d, r] of [
      [2.6, 12.5, 1.6],
      [3.6, 13, 1.8],
      [0.9, 12.5, 1.5],
      [5.0, 12.8, 1.7],
    ]) {
      rock(L.x + Math.sin(a) * d, L.z + Math.cos(a) * d, r, 2.4 + r * 0.6, 3000 + Math.round(a * 10));
    }
  }
  // Channel buoys: red and green, marking the way to the bar.
  const buoys: THREE.Group[] = [];
  for (const [x, z, red] of [
    [12, 50, 1],
    [27, 52, 0],
    [16, 62, 1],
    [31, 62, 0],
  ] as Array<[number, number, number]>) {
    const g = new THREE.Group();
    const col = new THREE.MeshStandardMaterial({ color: red ? '#a8352a' : '#2f6b43', roughness: 0.6, metalness: 0.2 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 1.2, 14), col);
    body.position.y = 0.4;
    const top = new THREE.Mesh(red ? new THREE.ConeGeometry(0.35, 0.6, 14) : new THREE.CylinderGeometry(0.3, 0.3, 0.5, 14), col);
    top.position.y = 1.3;
    const lamp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite(), color: red ? '#ff6a4a' : '#7dff9a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.6 }));
    lamp.position.y = 1.75;
    lamp.scale.setScalar(0.9);
    g.add(body, top, lamp);
    g.position.set(x, 0, z);
    g.traverse((o) => (o.castShadow = true));
    root.add(g);
    buoys.push(g);
    physics.cylinder(v3(x, 0, z), 1, 0.5);
  }

  // ------------------------------------------------------------ the lighthouse
  const holder = new THREE.Group();
  holder.position.set(C.light.x - LH.cx, LH.sink, C.light.z - LH.cz);
  root.add(holder);
  if (lighthouse) {
    const model = lighthouse.scene;
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.castShadow = mesh.receiveShadow = true;
    });
    holder.add(model);
  }
  const lw = lighthouseToWorld;
  // Stairs and landings (the scan's flights, measured): from the water up to the gallery.
  const ramp = (x0: number, x1: number, zLow: number, yLow: number, zHigh: number, yHigh: number, rails: Array<'west' | 'east'> = ['west', 'east']) => {
    const a = lw((x0 + x1) / 2, yLow, zLow);
    const b = lw((x0 + x1) / 2, yHigh, zHigh);
    const c = a.clone().add(b).multiplyScalar(0.5);
    const len = a.distanceTo(b);
    const pitch = Math.atan2(b.y - a.y, Math.abs(b.z - a.z));
    // Rises toward +z (pitch about -x) or toward -z.
    const q = new THREE.Quaternion().setFromAxisAngle(v3(1, 0, 0), b.z > a.z ? -pitch : pitch);
    const col = physics.box(c.clone().setY(c.y - 0.1 * Math.cos(pitch)), v3((x1 - x0) / 2, 0.1, len / 2), q);
    physics.setSurface(col, 'metal');
    // Handrails (invisible) on the open sides (flights side by side share no rail).
    for (const side of rails) {
      const sx = side === 'west' ? x0 - 0.05 : x1 + 0.05;
      physics.box(c.clone().setX(lw(sx, 0, 0).x).setY(c.y + 0.7), v3(0.04, 0.6, len / 2), q, { blocksCamera: false });
    }
  };
  // Each flight runs a little into its landings (no edge to catch on): its top end stands a
  // few centimetres proud of the landing, its bottom end is buried in it.
  ramp(0.0, 0.8, -11.6, 1.2, -7.1, 4.24, ['east']);
  // The lower landing (under the gallery).
  const l2 = lw(0, 4.2, -6.95);
  physics.setSurface(physics.box(l2.clone().setY(l2.y - 0.1), v3(0.85, 0.1, 0.5)), 'metal');
  // Flight 2: lower landing to the half landing (x -0.8..0), rising toward -z.
  ramp(-0.8, 0.0, -7.0, 3.97, -10.45, 6.24, ['west']);
  const l1 = lw(0, 6.2, -10.85);
  physics.setSurface(physics.box(l1.clone().setY(l1.y - 0.1), v3(0.85, 0.1, 0.55)), 'metal');
  // Flight 1: half landing up to the gallery (x 0..0.8), rising toward +z.
  ramp(0.0, 0.8, -10.7, 5.97, -6.8, 8.24, ['east']);
  // The gallery deck (an annulus of slabs) and its railing (open where the stairs arrive).
  {
    const c = lw(LH.cx, 8.2, LH.cz);
    const n = 28;
    const rIn = 6.05;
    const rOut = 7.45;
    for (let i = 0; i < n; i++) {
      const a = ((i + 0.5) / n) * Math.PI * 2;
      const half = ((rOut + 0.1) * Math.tan(Math.PI / n)) + 0.02;
      const mid = (rIn + rOut) / 2;
      physics.setSurface(physics.box(v3(c.x + Math.sin(a) * mid, c.y - 0.1, c.z + Math.cos(a) * mid), v3(half, 0.1, (rOut - rIn) / 2), a), 'wood');
      const nearStairs = Math.abs(Math.atan2(Math.sin(a - Math.PI), Math.cos(a - Math.PI))) < 0.12;
      if (!nearStairs) physics.box(v3(c.x + Math.sin(a) * (rOut + 0.08), c.y + 0.6, c.z + Math.cos(a) * (rOut + 0.08)), v3(half, 0.6, 0.04), a, { blocksCamera: false });
    }
    // The house: a drum from the gallery to the roof.
    physics.cylinder(v3(c.x, c.y + 2.1, c.z), 2.1, rIn - 0.05);
    // The piles (solid to the boat and to Mara swimming).
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      physics.cylinder(v3(c.x + Math.sin(a) * 6.2, -1.5, c.z + Math.cos(a) * 6.2), 2.5, 0.35);
    }
    physics.cylinder(v3(c.x, -1.5, c.z), 2.5, 0.45);
  }
  // Cover the scan's sign (a real organisation's, hung on the gallery railing by the stairs; found by
  // raycasting through it from the gallery) with a weathered board of our own, a lifebuoy beside it.
  {
    const normal = v3(-0.39, 0, -0.92).normalize();
    const out = Math.atan2(normal.x, normal.z);
    const at = lw(-2.8, 8.9, -6.69).addScaledVector(normal, 0.06);
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.62, 0.05), new THREE.MeshStandardMaterial({ color: '#3a5157', roughness: 0.85, map: m.wood.map }));
    board.position.copy(at);
    board.rotation.y = out;
    board.castShadow = true;
    root.add(board);
    const side = v3(Math.cos(out), 0, -Math.sin(out));
    const ring = new THREE.Group();
    ring.add(new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.08, 10, 24), new THREE.MeshStandardMaterial({ color: '#e2ddd0', roughness: 0.6 })));
    for (let i = 0; i < 4; i++) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.085, 10, 5, Math.PI / 4), new THREE.MeshStandardMaterial({ color: '#b5352a', roughness: 0.6 }));
      band.rotation.z = (i / 4) * Math.PI * 2;
      ring.add(band);
    }
    ring.position.copy(at).addScaledVector(side, -0.85).addScaledVector(normal, 0.03);
    ring.rotation.y = out;
    root.add(ring);
  }
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite(), color: '#ffe0b0', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.position.copy(lw(LH.cx, 15.2, LH.cz));
  glow.scale.setScalar(6);
  root.add(glow);

  // ------------------------------------------------------------ the hangar behind, Breakwater far
  const hangar = new Hangar(v3(0, 0.2, -44), 0);
  scene.add(hangar.group);
  hangar.setLit(true, true);
  {
    const far = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: '#6c7782', roughness: 1, fog: false, emissive: '#3a4650', emissiveIntensity: 0.45, flatShading: true });
    const block = (x: number, y: number, z: number, w: number, h: number, d: number) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      b.position.set(x, y, z);
      far.add(b);
    };
    block(0, 10, 0, 90, 26, 60);
    block(-30, 24, -10, 20, 18, 20);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(8, 9, 50, 16), mat);
    col.position.set(4, 30, 0);
    far.add(col);
    far.position.set(-180, -8, -250);
    far.rotation.y = 0.4;
    root.add(far);
  }

  batch.build(root);
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && o !== water) o.receiveShadow = true;
  });
  for (const c of climbables) ctx.traversal.markClimbable(c);

  const coast: Coast = {
    root,
    level: 0,
    // Where flight 3 comes out of the water (model y 3.6 is sea level).
    stairFoot: lw(0.4, 3.85, -7.95),
    door: lw(LH.cx, 8.2, LH.cz - 6.6),
    climbables,
    update(_dt, time, level, cameraPos) {
      coast.level = level;
      water.position.y = level;
      waterMat.uniforms.time.value = time;
      waterMat.uniforms.level.value = level;
      sea.update(time);
      sea.mesh.position.set(cameraPos.x, level - 0.12, cameraPos.z);
      for (const [i, b] of buoys.entries()) {
        b.position.y = level + Math.sin(time * 1.3 + i) * 0.08;
        b.rotation.z = Math.sin(time * 0.9 + i * 2) * 0.08;
      }
      hangar.update(_dt);
      (glow.material as THREE.SpriteMaterial).opacity = 0.6 + 0.4 * Math.pow(Math.max(0, Math.sin(time * 0.9)), 6);
    },
  };
  return coast;
}

/**
 * Water over a known sea bed: each vertex carries the bed's height, so the shader knows the depth.
 * Sand shows through the shallows, foam rims the bars and rocks, the deep is dark green-blue; the
 * sky and the sun are reflected as on the open sea.
 */
function coastWaterMaterial(sunDir: THREE.Vector3): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    fog: false,
    uniforms: {
      time: { value: 0 },
      level: { value: 0 },
      deep: { value: new THREE.Color('#1c4652') },
      shallow: { value: new THREE.Color('#5d9a94') },
      sand: { value: new THREE.Color('#c2b28c') },
      sky: { value: Palette.skyHorizon },
      skyTop: { value: Palette.skyTop },
      sunDir: { value: sunDir.clone().normalize() },
      sunColor: { value: Palette.moon },
      fogColor: { value: Palette.fog },
      fogDensity: { value: 0.006 },
    },
    vertexShader: /* glsl */ `
      attribute float bed;
      uniform float level;
      varying vec3 vWorld;
      varying float vDepth;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        vDepth = level - bed;
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float time, fogDensity;
      uniform vec3 deep, shallow, sand, sky, skyTop, sunDir, sunColor, fogColor;
      varying vec3 vWorld;
      varying float vDepth;
      float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
      float vnoise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
      }
      float waves(vec2 p) {
        p /= 3.0;
        return sin(p.x * 1.7 + time * 1.1) * 0.5 + sin(p.y * 2.3 - time * 0.9) * 0.4 + sin((p.x + p.y) * 3.1 + time * 1.7) * 0.25 + (vnoise(p * 3.0 + time * 0.35) - 0.5) * 0.9;
      }
      void main() {
        if (vDepth < -0.02) discard;
        vec2 p = vWorld.xz;
        float e = 0.15;
        float hx = waves(p + vec2(e, 0.0)) - waves(p - vec2(e, 0.0));
        float hz = waves(p + vec2(0.0, e)) - waves(p - vec2(0.0, e));
        vec3 n = normalize(vec3(-hx * 0.25, 1.0, -hz * 0.25));
        vec3 toCam = cameraPosition - vWorld;
        float dist = length(toCam);
        vec3 V = toCam / dist;
        float fres = 0.03 + 0.97 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
        vec3 R = reflect(-V, n);
        vec3 refl = mix(sky, mix(sky, skyTop, 0.7), clamp(R.y * 1.5, 0.0, 1.0));
        // The body of the water: sand under the shallows, green over the middle depths, then deep.
        float d = max(vDepth, 0.0);
        vec3 body = mix(sand, shallow, smoothstep(0.0, 0.7, d));
        body = mix(body, deep, smoothstep(0.6, 2.6, d));
        vec3 col = mix(body, refl, fres * smoothstep(0.0, 0.6, d) * 0.85 + 0.08);
        float spec = pow(max(dot(R, sunDir), 0.0), 180.0) * 1.2;
        col += sunColor * spec;
        // Foam where it is shallow, moving with the waves.
        float foam = (1.0 - smoothstep(0.0, 0.35, d)) * smoothstep(0.35, 0.75, vnoise(p * 2.2 + vec2(time * 0.4, -time * 0.25)) + 0.25);
        col = mix(col, vec3(0.92, 0.95, 0.94), foam * 0.75);
        float f = 1.0 - exp(-fogDensity * fogDensity * dist * dist);
        col = mix(col, fogColor, clamp(f, 0.0, 1.0));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}
