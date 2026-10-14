import * as THREE from 'three';
import type { MaterialLibrary } from '../materials';
import { Palette } from '../materials';
import { radialTexture } from '../textures';

let glowTexture: THREE.Texture | null = null;
export const glowSprite = (): THREE.Texture => (glowTexture ??= radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)', 128));

/**
 * Caged bulkhead lamp: back plate, glass dome and three wire guards. Built facing +Z (out of the
 * wall). The glass material is passed in so each lamp can be switched independently.
 */
function cagedLamp(m: MaterialLibrary, glass: THREE.Material, scale = 1): THREE.Group {
  const g = new THREE.Group();
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.04, 16), m.iron);
  plate.rotation.x = Math.PI / 2;
  plate.position.z = 0.02;
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.05, 16), m.brass);
  collar.rotation.x = Math.PI / 2;
  collar.position.z = 0.06;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.085, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), glass);
  dome.rotation.x = Math.PI / 2;
  dome.position.z = 0.08;
  g.add(plate, collar, dome);
  for (let i = 0; i < 3; i++) {
    const guard = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.008, 4, 16, Math.PI), m.iron);
    guard.rotation.set(0, Math.PI / 2, (i / 3) * Math.PI);
    guard.position.z = 0.08;
    g.add(guard);
  }
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  g.scale.setScalar(scale);
  return g;
}

function flicker(t: number, seed: number): number {
  return 0.93 + 0.04 * Math.sin(t * 13.1 + seed) + 0.03 * Math.sin(t * 27.7 + seed * 2.1);
}

let seedCounter = 1;

/**
 * Practical amber work lamp. Can be switched on/off with a short warm-up, which the lookout reveal
 * uses to light a route of service lights across the turbine hall.
 */
export class WorkLamp {
  readonly group = new THREE.Group();
  readonly light: THREE.PointLight | null;
  private readonly glass: THREE.MeshStandardMaterial;
  private readonly halo: THREE.Sprite;
  private readonly pool: THREE.Mesh | null;
  private readonly seed = seedCounter++ * 7.31;
  private readonly baseIntensity: number;
  private level: number;
  private target: number;

  /**
   * @param position lamp centre (on the wall surface)
   * @param outward unit vector pointing away from the wall
   */
  constructor(m: MaterialLibrary, position: THREE.Vector3, outward: THREE.Vector3, opts: { light?: boolean; intensity?: number; distance?: number; pool?: boolean; on?: boolean; scale?: number; castShadow?: boolean } = {}) {
    this.group.position.copy(position);
    this.group.rotation.y = Math.atan2(outward.x, outward.z);
    this.glass = m.glassWarm.clone();
    this.group.add(cagedLamp(m, this.glass, opts.scale ?? 1));
    this.halo = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowSprite(), color: Palette.lantern, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.35 }),
    );
    this.halo.scale.setScalar(0.9 * (opts.scale ?? 1));
    this.halo.position.z = 0.12;
    this.group.add(this.halo);
    if (opts.pool ?? true) {
      this.pool = new THREE.Mesh(
        new THREE.PlaneGeometry(2.4, 2.4),
        new THREE.MeshBasicMaterial({ map: glowSprite(), color: Palette.lantern, transparent: true, opacity: 0.14, depthWrite: false, blending: THREE.AdditiveBlending }),
      );
      this.pool.position.z = 0.01;
      this.group.add(this.pool);
    } else this.pool = null;
    this.baseIntensity = opts.intensity ?? 5;
    if (opts.light) {
      this.light = new THREE.PointLight(Palette.lantern, this.baseIntensity, opts.distance ?? 9, 1.6);
      this.light.position.z = 0.3;
      if (opts.castShadow) {
        this.light.castShadow = true;
        this.light.shadow.mapSize.set(512, 512);
        this.light.shadow.bias = -0.002;
        this.light.shadow.radius = 3;
      }
      this.group.add(this.light);
    } else this.light = null;
    this.level = this.target = opts.on === false ? 0 : 1;
    this.apply(0);
  }

  setOn(on: boolean, instant = false): void {
    this.target = on ? 1 : 0;
    if (instant) this.level = this.target;
  }

  get isOn(): boolean {
    return this.target > 0;
  }

  private apply(time: number): void {
    const k = this.level * flicker(time, this.seed);
    // A dead lamp still shows a faint cold glint so the fixture reads in the dark.
    this.glass.emissive.copy(Palette.lantern);
    this.glass.emissiveIntensity = 0.05 + 3 * k;
    (this.halo.material as THREE.SpriteMaterial).opacity = 0.35 * k;
    if (this.pool) (this.pool.material as THREE.MeshBasicMaterial).opacity = 0.14 * k;
    if (this.light) this.light.intensity = this.baseIntensity * k;
  }

  update(dt: number, time: number): void {
    // Gas lamps catch with a quick sputter rather than a linear fade.
    if (this.level !== this.target) {
      const step = dt * (this.target > this.level ? 2.2 : 4);
      this.level = this.target > this.level ? Math.min(this.target, this.level + step) : Math.max(this.target, this.level - step);
    }
    const sputter = this.level > 0 && this.level < 1 ? 0.6 + 0.4 * Math.sin(time * 60) : 1;
    const saved = this.level;
    this.level *= sputter;
    this.apply(time);
    this.level = saved;
  }
}

/**
 * Checkpoint lamp: a service light on a short iron post. Off it shows a small blue pilot flame;
 * once activated it burns amber and becomes Mara's return point after a fall.
 */
export class ServiceLight {
  readonly group = new THREE.Group();
  readonly light: THREE.PointLight;
  readonly lampWorld = new THREE.Vector3();
  lit = false;
  private readonly glass: THREE.MeshStandardMaterial;
  private readonly halo: THREE.Sprite;
  private igniteT = 10;
  private readonly seed = seedCounter++ * 3.7;

  constructor(m: MaterialLibrary, feet: THREE.Vector3, facing: number) {
    this.group.position.copy(feet);
    this.group.rotation.y = facing;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.1, 8), m.iron);
    base.position.y = 0.05;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.5, 8), m.iron);
    post.position.y = 0.8;
    // Small gas regulator with a ceramic tap, the visible "switch".
    const regulator = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.16, 10), m.brass);
    regulator.position.set(0, 0.95, 0.06);
    const tap = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.03), m.ceramic);
    tap.position.set(0, 0.95, 0.15);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.3), m.iron);
    arm.position.set(0, 1.55, 0.13);
    this.group.add(base, post, regulator, tap, arm);
    for (const o of [base, post, regulator, arm]) o.castShadow = true;
    this.glass = m.glassCold.clone();
    const lamp = cagedLamp(m, this.glass, 1.25);
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(0, 1.55, 0.3);
    this.group.add(lamp);
    this.halo = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowSprite(), color: Palette.pilot, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.3 }),
    );
    this.halo.position.set(0, 1.45, 0.3);
    this.halo.scale.setScalar(0.6);
    this.group.add(this.halo);
    this.light = new THREE.PointLight(Palette.lantern, 0, 8, 1.6);
    this.light.position.set(0, 1.35, 0.35);
    this.group.add(this.light);
    this.group.updateMatrixWorld(true);
    this.halo.getWorldPosition(this.lampWorld);
  }

  ignite(instant = false): void {
    if (this.lit) return;
    this.lit = true;
    this.igniteT = instant ? 10 : 0;
    this.glass.emissive.copy(Palette.lantern);
    (this.halo.material as THREE.SpriteMaterial).color.copy(Palette.lantern);
  }

  extinguish(): void {
    this.lit = false;
    this.glass.emissive.copy(Palette.pilot);
    (this.halo.material as THREE.SpriteMaterial).color.copy(Palette.pilot);
    this.light.intensity = 0;
    this.halo.scale.setScalar(0.6);
  }

  update(dt: number, time: number): void {
    const halo = this.halo.material as THREE.SpriteMaterial;
    if (!this.lit) {
      this.glass.emissiveIntensity = 0.35 + 0.1 * Math.sin(time * 3 + this.seed);
      halo.opacity = 0.25;
      return;
    }
    this.igniteT += dt;
    const flare = 1 + 2.2 * Math.exp(-this.igniteT * 3) * Math.min(1, this.igniteT * 8);
    const k = Math.min(1, this.igniteT * 3) * flicker(time, this.seed);
    this.light.intensity = 6 * k * flare;
    this.glass.emissiveIntensity = 3 * k * flare;
    halo.opacity = 0.4 * k;
    this.halo.scale.setScalar(1.1 + 0.8 * (flare - 1));
  }
}
