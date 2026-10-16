import * as THREE from 'three';
import { glowSprite } from './Lanterns';

/** One chalk "IV" mark: a collectible left along the route by whoever has been repairing it. */
export interface ChalkMarkSpot {
  id: string;
  /** Centre of the chalk on its surface. */
  pos: THREE.Vector3;
  /** Direction the chalk faces (out of the surface). */
  normal: THREE.Vector3;
  /** Picked up when Mara's chest comes this close (metres). */
  radius: number;
  /** Covered until `reveal` (the boarded hatch). */
  hidden?: boolean;
  /** Size of the chalk (metres). */
  size?: number;
}

interface Mark {
  spot: ChalkMarkSpot;
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  glint: THREE.Sprite;
  found: boolean;
  revealed: boolean;
  flash: number;
  phase: number;
}

/**
 * The chalk "IV" marks hidden off the main path. Each is a chalk circle on a wall or floor, faintly
 * lit so it reads in the dark, with a glint every few seconds to catch the eye. Walking (or
 * jumping) close enough picks it up; found marks stay on the wall, dimmed. They count for the run
 * and reset only with "Restart section".
 */
export class ChalkMarks {
  readonly group = new THREE.Group();
  private readonly marks: Mark[] = [];
  private time = 0;

  constructor(spots: ChalkMarkSpot[]) {
    const texture = ivoMarkTexture();
    spots.forEach((spot, i) => {
      const size = spot.size ?? 0.34;
      const material = new THREE.MeshStandardMaterial({
        map: texture,
        emissiveMap: texture,
        emissive: '#f4ecd8',
        emissiveIntensity: 0.45,
        transparent: true,
        roughness: 1,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), material);
      mesh.position.copy(spot.pos);
      mesh.lookAt(spot.pos.clone().add(spot.normal));
      mesh.visible = !spot.hidden;
      const glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite(), color: '#fff3d6', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
      glint.position.copy(spot.pos).addScaledVector(spot.normal, 0.06);
      glint.scale.setScalar(0.4);
      this.group.add(mesh, glint);
      this.marks.push({ spot, mesh, material, glint, found: false, revealed: !spot.hidden, flash: 0, phase: i * 1.7 });
    });
  }

  get total(): number {
    return this.marks.length;
  }

  get foundCount(): number {
    return this.marks.filter((m) => m.found).length;
  }

  get foundIds(): string[] {
    return this.marks.filter((m) => m.found).map((m) => m.spot.id);
  }

  /** Uncover a hidden mark (the boards over it broke). */
  reveal(id: string): void {
    const m = this.marks.find((x) => x.spot.id === id);
    if (!m || m.revealed) return;
    m.revealed = true;
    m.mesh.visible = true;
    m.flash = 0.6;
  }

  isRevealed(id: string): boolean {
    return this.marks.find((x) => x.spot.id === id)?.revealed ?? false;
  }

  /** Marks still to find that can be seen (Mara glances at them as she passes). */
  get unfound(): THREE.Vector3[] {
    return this.marks.filter((m) => m.revealed && !m.found).map((m) => m.spot.pos);
  }

  /** Where a mark is (tests, dev tools). */
  position(id: string): THREE.Vector3 | null {
    return this.marks.find((x) => x.spot.id === id)?.spot.pos ?? null;
  }

  /** Pick up any mark within reach of Mara's chest (fixed step). Returns the one taken, if any. */
  collect(chest: THREE.Vector3): ChalkMarkSpot | null {
    for (const m of this.marks) {
      if (!m.revealed || m.found || chest.distanceTo(m.spot.pos) >= m.spot.radius) continue;
      m.found = true;
      m.flash = 1;
      return m.spot;
    }
    return null;
  }

  /** Glints, and the bloom as a mark is taken. */
  update(dt: number): void {
    this.time += dt;
    for (const m of this.marks) {
      if (!m.revealed) continue;
      m.flash = Math.max(0, m.flash - dt * 1.4);
      if (m.found) {
        // Found: the chalk dims to a warm trace after one bright bloom.
        m.material.emissive.set('#ffcf8a');
        m.material.emissiveIntensity = 0.12 + m.flash * 1.6;
        m.material.opacity = 0.55 + m.flash * 0.45;
        m.glint.material.opacity = m.flash * 0.9;
        m.glint.scale.setScalar(0.4 + (1 - m.flash) * 1.2);
      } else {
        // A glint every couple of seconds, staggered between marks.
        const s = Math.max(0, Math.sin(this.time * 2.4 + m.phase));
        const pulse = s ** 10;
        m.glint.material.opacity = 0.12 + pulse * 0.75 + m.flash * 0.6;
        m.glint.scale.setScalar(0.32 + pulse * 0.3);
        m.material.emissiveIntensity = 0.45 + pulse * 0.35;
      }
    }
  }

  reset(): void {
    for (const m of this.marks) {
      m.found = false;
      m.revealed = !m.spot.hidden;
      m.mesh.visible = m.revealed;
      m.flash = 0;
      m.material.emissive.set('#f4ecd8');
      m.material.emissiveIntensity = 0.45;
      m.material.opacity = 1;
      m.glint.material.opacity = 0;
    }
  }
}

/** Chalk "IV" in a rough circle, drawn in two passes so the strokes look dragged, not printed. */
function ivoMarkTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (const [width, alpha] of [
    [13, 0.55],
    [6, 0.9],
  ]) {
    g.strokeStyle = `rgba(238, 232, 216, ${alpha})`;
    g.lineWidth = width;
    // The circle, not quite closed.
    g.beginPath();
    for (let i = 0; i <= 40; i++) {
      const a = -1.2 + (i / 40) * Math.PI * 1.92;
      const r = 104 + (rnd() - 0.5) * 6;
      const x = 128 + Math.cos(a) * r;
      const y = 128 + Math.sin(a) * r;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
    // I
    g.beginPath();
    g.moveTo(82 + rnd() * 3, 70);
    g.lineTo(80 + rnd() * 3, 186);
    // V
    g.moveTo(112, 70 + rnd() * 3);
    g.lineTo(146, 188);
    g.lineTo(180, 68 + rnd() * 3);
    g.stroke();
  }
  // Chalk grain: knock specks out of the strokes.
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(0,0,0,${0.3 + rnd() * 0.5})`;
    g.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 2, 1 + rnd() * 2);
  }
  g.globalCompositeOperation = 'source-over';
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** A chalk arrow pointing down (at the boarded hatch), with a small "IV" beside it. */
export function chalkArrowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.strokeStyle = 'rgba(238, 232, 216, 0.85)';
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.lineWidth = 9;
  g.beginPath();
  g.moveTo(64, 30);
  g.lineTo(62, 200);
  g.moveTo(26, 160);
  g.lineTo(62, 214);
  g.lineTo(100, 158);
  g.stroke();
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(92, 34);
  g.lineTo(92, 76);
  g.moveTo(104, 34);
  g.lineTo(113, 76);
  g.lineTo(122, 34);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
