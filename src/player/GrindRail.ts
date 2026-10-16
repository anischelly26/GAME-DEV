import * as THREE from 'three';

/**
 * A pipe (or rail) Mara can grind along: the centreline sampled by arc length, so the controller
 * can move along it at a speed, find the nearest point to her feet, and read the slope.
 */
export class GrindRail {
  /** Centreline samples, evenly spaced by arc length. */
  readonly points: THREE.Vector3[] = [];
  readonly length: number;
  private readonly spacing: number;

  constructor(
    curve: THREE.Curve<THREE.Vector3>,
    /** Pipe radius: Mara's feet ride this far above the centreline. */
    readonly radius: number,
    spacing = 0.2,
  ) {
    const n = Math.max(2, Math.ceil(curve.getLength() / spacing));
    for (let i = 0; i <= n; i++) this.points.push(curve.getPointAt(i / n));
    this.length = curve.getLength();
    this.spacing = this.length / n;
  }

  /** Centreline point at arc length `s` (clamped to the ends). */
  pointAt(s: number, out = new THREE.Vector3()): THREE.Vector3 {
    const f = THREE.MathUtils.clamp(s / this.spacing, 0, this.points.length - 1);
    const i = Math.min(Math.floor(f), this.points.length - 2);
    return out.lerpVectors(this.points[i], this.points[i + 1], f - i);
  }

  /** Unit tangent at arc length `s`, pointing toward increasing `s`. */
  tangentAt(s: number, out = new THREE.Vector3()): THREE.Vector3 {
    const f = THREE.MathUtils.clamp(s / this.spacing, 0, this.points.length - 1);
    const i = Math.min(Math.floor(f), this.points.length - 2);
    return out.subVectors(this.points[i + 1], this.points[i]).normalize();
  }

  /** Nearest point on the centreline to `p`: its arc length and distance. */
  closest(p: THREE.Vector3): { s: number; distance: number } {
    let bestS = 0;
    let best = Infinity;
    const ab = new THREE.Vector3();
    const ap = new THREE.Vector3();
    for (let i = 0; i < this.points.length - 1; i++) {
      const a = this.points[i];
      ab.subVectors(this.points[i + 1], a);
      ap.subVectors(p, a);
      const t = THREE.MathUtils.clamp(ap.dot(ab) / ab.lengthSq(), 0, 1);
      const d = ap.addScaledVector(ab, -t).length();
      if (d < best) {
        best = d;
        bestS = (i + t) * this.spacing;
      }
    }
    return { s: bestS, distance: best };
  }

  /** Where Mara's feet stand on top of the pipe at arc length `s`. */
  feetAt(s: number, out = new THREE.Vector3()): THREE.Vector3 {
    return this.pointAt(s, out).setY(out.y + this.radius);
  }
}
