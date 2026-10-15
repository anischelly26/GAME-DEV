import * as THREE from 'three';

/**
 * A painted strip of chevrons running alongside a pipe, lit from behind like the gauge faces: when
 * pressure flows along the pipe the chevrons glow and run toward where it is going; when it does
 * not they sit dark. Used wherever a puzzle sends pressure one way or another, so cause and effect
 * can be read along the pipework itself, not only at a gauge.
 */
export class FlowStrip {
  readonly group = new THREE.Group();
  private readonly segments: Array<{ mat: THREE.MeshBasicMaterial; tex: THREE.Texture }> = [];
  private level = 0;
  private target = 0;
  private offset = 0;

  /**
   * @param points  the path, start to end (flow runs this way)
   * @param facing  normal of the strip's face for a segment (direction, midpoint), toward the viewer
   */
  constructor(points: THREE.Vector3[], facing: (dir: THREE.Vector3, mid: THREE.Vector3) => THREE.Vector3, opts: { width?: number; color?: string } = {}) {
    const width = opts.width ?? 0.11;
    const color = new THREE.Color(opts.color ?? '#ffc46b');
    const base = chevronTexture();
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const d = b.clone().sub(a);
      const len = d.length();
      d.normalize();
      const mid = a.clone().add(b).multiplyScalar(0.5);
      const n = facing(d, mid).clone().projectOnPlane(d).normalize();
      const y = new THREE.Vector3().crossVectors(n, d);
      const tex = base.clone();
      tex.wrapS = THREE.RepeatWrapping;
      tex.repeat.set(len / 0.22, 1);
      tex.needsUpdate = true;
      const mat = new THREE.MeshBasicMaterial({ map: tex, color: color.clone().multiplyScalar(0.12), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(len, width), mat);
      mesh.matrix.makeBasis(d, y, n).setPosition(mid);
      mesh.matrixAutoUpdate = false;
      mesh.renderOrder = 2;
      this.group.add(mesh);
      this.segments.push({ mat, tex });
    }
    this.color = color;
  }

  private readonly color: THREE.Color;

  /** Pressure flowing along this pipe (true) or not. */
  set(flowing: boolean, instant = false): void {
    this.target = flowing ? 1 : 0;
    if (instant) this.level = this.target;
  }

  get flowing(): boolean {
    return this.target > 0;
  }

  update(dt: number): void {
    this.level += (this.target - this.level) * (1 - Math.exp(-dt * 4));
    this.offset -= dt * 1.6 * this.level;
    const brightness = 0.12 + this.level * 1.25;
    for (const s of this.segments) {
      s.tex.offset.x = this.offset;
      s.mat.color.copy(this.color).multiplyScalar(brightness);
    }
  }
}

let chevrons: THREE.CanvasTexture | null = null;

/** Amber chevrons pointing along +U on a dark ground. */
function chevronTexture(): THREE.CanvasTexture {
  if (chevrons) return chevrons;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 32;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(20, 16, 12, 0.85)';
  g.fillRect(0, 0, 64, 32);
  g.strokeStyle = '#ffffff';
  g.lineWidth = 7;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(22, 6);
  g.lineTo(40, 16);
  g.lineTo(22, 26);
  g.stroke();
  chevrons = new THREE.CanvasTexture(c);
  chevrons.colorSpace = THREE.SRGBColorSpace;
  chevrons.anisotropy = 4;
  return chevrons;
}
