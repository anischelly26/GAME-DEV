import * as THREE from 'three';
import { Palette } from './materials';
import { mulberry32 } from '../core/math';
import { radialTexture } from './textures';

const NOISE_GLSL = /* glsl */ `
  float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float vnoise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm2(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; } return s; }
`;

// ---------------------------------------------------------------- sky

export class Sky {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;

  constructor(moonDir: THREE.Vector3) {
    this.material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: Palette.skyTop },
        horizon: { value: Palette.skyHorizon },
        moonDir: { value: moonDir.clone().normalize() },
        moonColor: { value: Palette.moon },
        time: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 top, horizon, moonDir, moonColor;
        uniform float time;
        varying vec3 vDir;
        ${NOISE_GLSL}
        void main() {
          vec3 d = normalize(vDir);
          float h = max(d.y, 0.0);
          vec3 col = mix(horizon, top, pow(h, 0.45));
          col = mix(col, horizon * 0.55, smoothstep(0.0, -0.25, d.y));
          // Stars.
          vec3 cell = floor(d * 260.0);
          float s = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
          float twinkle = 0.6 + 0.4 * sin(time * 2.0 + s * 60.0);
          col += vec3(0.8, 0.88, 1.0) * step(0.9965, s) * twinkle * smoothstep(0.05, 0.4, h) * 1.4;
          // Clouds lit by the moon.
          vec2 cp = d.xz / (d.y + 0.25) * 1.6 + vec2(time * 0.006, time * 0.002);
          float c = smoothstep(0.48, 0.85, fbm2(cp));
          float md = max(dot(d, moonDir), 0.0);
          col = mix(col, horizon * 1.25 + moonColor * 0.12 * pow(md, 6.0), c * 0.65 * smoothstep(0.0, 0.2, h));
          // Moon disc and halo.
          float disc = smoothstep(0.99955, 0.9997, md);
          col += moonColor * (disc * 4.0 + pow(md, 400.0) * 0.6 + pow(md, 18.0) * 0.12);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
  }

  update(time: number, cameraPos: THREE.Vector3): void {
    this.material.uniforms.time.value = time;
    this.mesh.position.copy(cameraPos);
  }
}

// ---------------------------------------------------------------- water

export interface WaterOptions {
  radius: number;
  y: number;
  deep: THREE.Color;
  moonDir: THREE.Vector3;
  /** Exponential fog density applied in-shader (matches scene fog), or 0 for distance fade to horizon. */
  fogDensity: number;
  fogColor: THREE.Color;
  /** Wave scale; the sea uses longer waves than the Well. */
  scale: number;
  /** Foam ring at the outer radius (for the walls of the Well). */
  foamRadius?: number;
  horizonFade?: number;
}

export class Water {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;

  constructor(o: WaterOptions) {
    this.material = new THREE.ShaderMaterial({
      fog: false,
      transparent: false,
      uniforms: {
        time: { value: 0 },
        deep: { value: o.deep },
        sky: { value: Palette.skyHorizon },
        moonDir: { value: o.moonDir.clone().normalize() },
        moonColor: { value: Palette.moon },
        fogColor: { value: o.fogColor },
        fogDensity: { value: o.fogDensity },
        scale: { value: o.scale },
        foamRadius: { value: o.foamRadius ?? 1e6 },
        horizonFade: { value: o.horizonFade ?? 0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorld;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vWorld = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float time, fogDensity, scale, foamRadius, horizonFade;
        uniform vec3 deep, sky, moonDir, moonColor, fogColor;
        varying vec3 vWorld;
        ${NOISE_GLSL}
        float waves(vec2 p) {
          p /= scale;
          float h = sin(p.x * 1.7 + time * 1.1) * 0.5 + sin(p.y * 2.3 - time * 0.9) * 0.4;
          h += sin((p.x + p.y) * 3.1 + time * 1.7) * 0.25;
          h += (vnoise(p * 3.0 + time * 0.35) - 0.5) * 0.9;
          return h;
        }
        void main() {
          vec2 p = vWorld.xz;
          float e = 0.05 * scale;
          float hx = waves(p + vec2(e, 0.0)) - waves(p - vec2(e, 0.0));
          float hz = waves(p + vec2(0.0, e)) - waves(p - vec2(0.0, e));
          vec3 n = normalize(vec3(-hx * 0.35, 1.0, -hz * 0.35));
          vec3 toCam = cameraPosition - vWorld;
          float dist = length(toCam);
          vec3 V = toCam / dist;
          float fres = 0.04 + 0.96 * pow(1.0 - max(dot(n, V), 0.0), 4.0);
          vec3 R = reflect(-V, n);
          vec3 refl = mix(sky * 0.7, sky * 1.4, clamp(R.y, 0.0, 1.0));
          float spec = pow(max(dot(R, moonDir), 0.0), 120.0) * 2.5 + pow(max(dot(R, moonDir), 0.0), 900.0) * 6.0;
          vec3 col = mix(deep, refl, fres) + moonColor * spec;
          float r = length(p);
          float foam = smoothstep(foamRadius - 1.2, foamRadius, r) * (0.5 + 0.5 * vnoise(p * 2.0 + time * 0.6));
          col = mix(col, vec3(0.55, 0.65, 0.68), foam * 0.45);
          if (fogDensity > 0.0) {
            float f = 1.0 - exp(-fogDensity * fogDensity * dist * dist);
            col = mix(col, fogColor, clamp(f, 0.0, 1.0));
          }
          if (horizonFade > 0.0) col = mix(col, sky * 0.9, smoothstep(horizonFade * 0.35, horizonFade, dist));
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    const geo = new THREE.CircleGeometry(o.radius, 64);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.position.y = o.y;
    this.mesh.receiveShadow = false;
  }

  update(time: number): void {
    this.material.uniforms.time.value = time;
  }
}

// ---------------------------------------------------------------- light shafts

/** Volumetric-looking beam: an open cylinder with soft additive edges and drifting streaks. */
export class LightShaft {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;

  constructor(from: THREE.Vector3, to: THREE.Vector3, radiusTop: number, radiusBottom: number, color: THREE.Color, intensity: number) {
    const length = from.distanceTo(to);
    const geo = new THREE.CylinderGeometry(radiusTop, radiusBottom, length, 32, 8, true);
    geo.translate(0, -length / 2, 0);
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
      uniforms: { color: { value: color }, intensity: { value: intensity }, time: { value: 0 }, len: { value: length } },
      vertexShader: /* glsl */ `
        varying vec3 vNormalW; varying vec3 vWorld; varying float vT; varying vec2 vUv;
        uniform float len;
        void main() {
          vT = -position.y / len;
          vUv = uv;
          vec4 w = modelMatrix * vec4(position, 1.0);
          vWorld = w.xyz;
          vNormalW = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * w;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 color; uniform float intensity, time;
        varying vec3 vNormalW; varying vec3 vWorld; varying float vT; varying vec2 vUv;
        ${NOISE_GLSL}
        void main() {
          vec3 V = normalize(cameraPosition - vWorld);
          float edge = pow(abs(dot(normalize(vNormalW), V)), 1.6);
          float streak = 0.55 + 0.45 * vnoise(vec2(vUv.x * 40.0, vT * 3.0 - time * 0.15));
          float fade = smoothstep(0.0, 0.12, vT) * (1.0 - smoothstep(0.65, 1.0, vT));
          gl_FragColor = vec4(color * intensity * edge * streak * fade, 1.0);
        }
      `,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.position.copy(from);
    const dir = new THREE.Vector3().subVectors(to, from).normalize();
    this.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
    this.mesh.renderOrder = 5;
  }

  update(time: number): void {
    this.material.uniforms.time.value = time;
  }
}

// ---------------------------------------------------------------- dust motes

export class Dust {
  readonly points: THREE.Points;
  private readonly material: THREE.ShaderMaterial;

  constructor(count: number, center: THREE.Vector3, radius: number, yMin: number, yMax: number, shaftFrom: THREE.Vector3, shaftDir: THREE.Vector3, seed = 7) {
    const rng = mulberry32(seed);
    const pos = new Float32Array(count * 3);
    const rnd = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(rng()) * radius;
      pos[i * 3] = center.x + Math.sin(a) * r;
      pos[i * 3 + 1] = yMin + rng() * (yMax - yMin);
      pos[i * 3 + 2] = center.z + Math.cos(a) * r;
      rnd[i] = rng();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('rnd', new THREE.BufferAttribute(rnd, 1));
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
      uniforms: {
        time: { value: 0 },
        shaftFrom: { value: shaftFrom },
        shaftDir: { value: shaftDir.clone().normalize() },
        pixelRatio: { value: Math.min(window.devicePixelRatio, 1.75) },
        warm: { value: Palette.lantern },
        cool: { value: Palette.moon },
      },
      vertexShader: /* glsl */ `
        attribute float rnd;
        uniform float time, pixelRatio;
        uniform vec3 shaftFrom, shaftDir;
        varying float vBright; varying float vRnd;
        void main() {
          vec3 p = position;
          p.x += sin(time * 0.21 + rnd * 40.0) * 0.6;
          p.y += sin(time * 0.13 + rnd * 17.0) * 0.5;
          p.z += cos(time * 0.17 + rnd * 23.0) * 0.6;
          vec3 rel = p - shaftFrom;
          float along = dot(rel, shaftDir);
          float d = length(rel - shaftDir * along);
          vBright = 0.18 + 1.6 * exp(-d * d / 9.0);
          vRnd = rnd;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = (1.5 + rnd * 2.5) * pixelRatio * (12.0 / -mv.z);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 warm, cool;
        varying float vBright; varying float vRnd;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float a = smoothstep(0.5, 0.0, length(c));
          vec3 col = mix(cool, warm, step(0.75, vRnd));
          gl_FragColor = vec4(col * a * vBright * 0.35, 1.0);
        }
      `,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
  }

  update(time: number): void {
    this.material.uniforms.time.value = time;
  }
}

// ---------------------------------------------------------------- steam / puffs

interface Puff {
  sprite: THREE.Sprite;
  life: number;
  max: number;
  vel: THREE.Vector3;
}

export class SteamEmitter {
  readonly group = new THREE.Group();
  private readonly puffs: Puff[] = [];
  private timer = 0;
  private readonly rng = mulberry32(5);
  private static texture: THREE.Texture | null = null;
  /** Bursts are periodic so the engine feels like it "breathes". */
  burst = 0;

  constructor(
    private readonly origin: THREE.Vector3,
    private readonly direction: THREE.Vector3,
    public rate: number,
    private readonly color = new THREE.Color('#9fb3b8'),
  ) {
    SteamEmitter.texture ??= radialTexture('rgba(255,255,255,0.9)', 'rgba(255,255,255,0)', 64);
    for (let i = 0; i < 24; i++) {
      const mat = new THREE.SpriteMaterial({ map: SteamEmitter.texture, color: this.color, transparent: true, depthWrite: false, opacity: 0 });
      const sprite = new THREE.Sprite(mat);
      sprite.visible = false;
      this.group.add(sprite);
      this.puffs.push({ sprite, life: 0, max: 1, vel: new THREE.Vector3() });
    }
  }

  update(dt: number): void {
    this.timer += dt * (this.rate + this.burst * 20);
    this.burst = Math.max(0, this.burst - dt);
    while (this.timer > 1) {
      this.timer -= 1;
      const p = this.puffs.find((q) => q.life <= 0);
      if (!p) break;
      p.max = p.life = 1.6 + this.rng() * 1.2;
      p.sprite.position.copy(this.origin);
      p.vel
        .copy(this.direction)
        .multiplyScalar(0.8 + this.rng() * 0.8)
        .add(new THREE.Vector3((this.rng() - 0.5) * 0.3, 0.4, (this.rng() - 0.5) * 0.3));
      p.sprite.visible = true;
    }
    for (const p of this.puffs) {
      if (p.life <= 0) continue;
      p.life -= dt;
      const t = 1 - p.life / p.max;
      p.sprite.position.addScaledVector(p.vel, dt);
      p.vel.multiplyScalar(1 - dt * 0.6);
      p.vel.y += dt * 0.3;
      const s = 0.4 + t * 2.2;
      p.sprite.scale.set(s, s, s);
      (p.sprite.material as THREE.SpriteMaterial).opacity = Math.sin(t * Math.PI) * 0.22;
      if (p.life <= 0) p.sprite.visible = false;
    }
  }
}
