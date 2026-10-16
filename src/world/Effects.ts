import * as THREE from 'three';

/**
 * Short-lived gameplay effects, pooled so nothing is allocated during play:
 *
 * - **puffs**: soft billboards that drift, grow and fade (steam from Mara's kicker, dust from
 *   rolls and hard landings);
 * - **rings**: flat shockwave rings that expand along the ground (the ground pound).
 *
 * Everything is in one scene group. Idle particles are hidden, so they cost no draw calls.
 */
export class Effects {
  readonly group = new THREE.Group();
  private readonly puffs: Puff[] = [];
  private readonly rings: Ring[] = [];
  /** Bright, fast, falling specks (a pipe being ground). Additive, so they glow. */
  private readonly sparkPool: Array<{ sprite: THREE.Sprite; vel: THREE.Vector3; age: number; life: number }> = [];
  private nextSpark = 0;
  private nextPuff = 0;
  private nextRing = 0;

  constructor(puffCount = 64, ringCount = 4) {
    this.group.name = 'effects';
    const tex = softTexture();
    for (let i = 0; i < puffCount; i++) {
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0, color: '#ffffff' });
      const sprite = new THREE.Sprite(mat);
      sprite.visible = false;
      this.group.add(sprite);
      this.puffs.push({ sprite, vel: new THREE.Vector3(), life: 0, age: 0, size0: 0.2, size1: 0.8, peak: 0.5 });
    }
    for (let i = 0; i < 48; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: '#ffc46b', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
      sprite.visible = false;
      this.group.add(sprite);
      this.sparkPool.push({ sprite, vel: new THREE.Vector3(), age: 0, life: 0 });
    }
    const ringGeo = new THREE.RingGeometry(0.82, 1, 48);
    ringGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < ringCount; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: '#e8dcc4', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(ringGeo, mat);
      mesh.visible = false;
      mesh.renderOrder = 3;
      this.group.add(mesh);
      this.rings.push({ mesh, age: 0, life: 0, radius: 1 });
    }
  }

  /** A burst of `count` puffs around `at`, pushed along `dir` with some spread. */
  burst(at: THREE.Vector3Like, opts: { count: number; color: string; dir?: THREE.Vector3Like; speed?: number; spread?: number; life?: number; size?: [number, number]; opacity?: number; rise?: number }): void {
    const dir = opts.dir ?? { x: 0, y: 1, z: 0 };
    for (let i = 0; i < opts.count; i++) {
      const p = this.puffs[this.nextPuff];
      this.nextPuff = (this.nextPuff + 1) % this.puffs.length;
      const spread = opts.spread ?? 1;
      const speed = (opts.speed ?? 1.5) * (0.6 + Math.random() * 0.6);
      p.vel.set(dir.x + (Math.random() - 0.5) * spread, dir.y + (Math.random() - 0.5) * spread * 0.5, dir.z + (Math.random() - 0.5) * spread).normalize().multiplyScalar(speed);
      p.vel.y += opts.rise ?? 0;
      p.sprite.position.set(at.x + (Math.random() - 0.5) * 0.15, at.y + Math.random() * 0.1, at.z + (Math.random() - 0.5) * 0.15);
      p.life = (opts.life ?? 0.7) * (0.75 + Math.random() * 0.5);
      p.age = 0;
      [p.size0, p.size1] = opts.size ?? [0.25, 0.9];
      p.peak = opts.opacity ?? 0.5;
      (p.sprite.material as THREE.SpriteMaterial).color.set(opts.color);
      p.sprite.visible = true;
    }
  }

  /** `count` sparks thrown from `at` along `dir` (they arc down under gravity and fade). */
  sparks(at: THREE.Vector3Like, dir: THREE.Vector3Like, count: number, speed: number): void {
    for (let i = 0; i < count; i++) {
      const s = this.sparkPool[this.nextSpark];
      this.nextSpark = (this.nextSpark + 1) % this.sparkPool.length;
      s.vel.set(dir.x + (Math.random() - 0.5) * 0.9, dir.y + Math.random() * 0.6, dir.z + (Math.random() - 0.5) * 0.9).normalize().multiplyScalar(speed * (0.6 + Math.random() * 0.7));
      s.sprite.position.set(at.x, at.y, at.z);
      s.age = 0;
      s.life = 0.25 + Math.random() * 0.25;
      s.sprite.scale.setScalar(0.05 + Math.random() * 0.05);
      s.sprite.visible = true;
    }
  }

  /** A shockwave ring expanding on the ground at `at` to `radius` metres. */
  ring(at: THREE.Vector3Like, radius = 2.2, life = 0.45): void {
    const r = this.rings[this.nextRing];
    this.nextRing = (this.nextRing + 1) % this.rings.length;
    r.mesh.position.set(at.x, at.y + 0.04, at.z);
    r.age = 0;
    r.life = life;
    r.radius = radius;
    r.mesh.visible = true;
  }

  update(dt: number): void {
    for (const s of this.sparkPool) {
      if (!s.sprite.visible) continue;
      s.age += dt;
      const k = s.age / s.life;
      if (k >= 1) {
        s.sprite.visible = false;
        continue;
      }
      s.vel.y -= 9.8 * dt;
      s.sprite.position.addScaledVector(s.vel, dt);
      const m = s.sprite.material as THREE.SpriteMaterial;
      m.opacity = 1 - k * k;
      m.color.setRGB(1, 0.78 - k * 0.45, 0.42 - k * 0.35);
    }
    for (const p of this.puffs) {
      if (!p.sprite.visible) continue;
      p.age += dt;
      const k = p.age / p.life;
      if (k >= 1) {
        p.sprite.visible = false;
        continue;
      }
      p.vel.multiplyScalar(Math.exp(-dt * 3.2));
      p.sprite.position.addScaledVector(p.vel, dt);
      const s = p.size0 + (p.size1 - p.size0) * (1 - (1 - k) * (1 - k));
      p.sprite.scale.setScalar(s);
      (p.sprite.material as THREE.SpriteMaterial).opacity = p.peak * Math.min(1, k * 6) * (1 - k);
    }
    for (const r of this.rings) {
      if (!r.mesh.visible) continue;
      r.age += dt;
      const k = r.age / r.life;
      if (k >= 1) {
        r.mesh.visible = false;
        continue;
      }
      const s = 0.2 + r.radius * (1 - (1 - k) * (1 - k));
      r.mesh.scale.set(s, 1, s);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - k);
    }
  }
}

interface Puff {
  sprite: THREE.Sprite;
  vel: THREE.Vector3;
  life: number;
  age: number;
  size0: number;
  size1: number;
  peak: number;
}

interface Ring {
  mesh: THREE.Mesh;
  age: number;
  life: number;
  radius: number;
}

let soft: THREE.CanvasTexture | null = null;

/** A soft round blob with a slightly lumpy edge, for steam and dust. */
function softTexture(): THREE.CanvasTexture {
  if (soft) return soft;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  grad.addColorStop(0, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  soft = new THREE.CanvasTexture(c);
  soft.colorSpace = THREE.SRGBColorSpace;
  return soft;
}
