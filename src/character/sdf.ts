/**
 * Signed distance functions for sculpting characters in code.
 *
 * A shape is a list of primitives combined with smooth unions (and smooth subtractions for
 * carving). Every primitive carries the name of the bone it belongs to, which the mesher uses to
 * compute skin weights, so blended joints deform smoothly. Distances are in metres.
 */

export type Vec3 = [number, number, number];

/**
 * A primitive's raw distance function. `bound`, when present, guarantees
 * d(p) >= k * (|p - c| - r), which lets `evaluate` skip primitives that cannot change the result.
 */
export type Dist = ((x: number, y: number, z: number) => number) & { bound?: Bound };

export interface Bound {
  c: Vec3;
  r: number;
  k: number;
}

const bounded = (d: (x: number, y: number, z: number) => number, c: Vec3, r: number, k = 1): Dist => Object.assign(d, { bound: { c, r, k } });

export interface Primitive {
  dist: Dist;
  bone: string;
  /** Smooth-union radius with what came before (metres). 0 = hard union. */
  blend: number;
  /** Carve this primitive out instead of adding it. */
  subtract?: boolean;
  /** Excluded from skin weighting (e.g. carving tools, detail bumps). */
  noWeight?: boolean;
}

export interface Shape {
  prims: Primitive[];
  /** Optional surface detail applied to the final distance (folds, grooves, knit). */
  detail?: (x: number, y: number, z: number, d: number) => number;
  /** Clip the shape to a region: returns a distance that is negative inside the kept region. */
  clip?: Dist;
  clipBlend?: number;
  /** Optional colour multiplier painted into the vertex colours (lips, blush, wear). */
  tint?: (x: number, y: number, z: number) => [number, number, number];
}

/** Vector length; faster than Math.hypot in V8. */
export const len = (a: number, b: number, c = 0): number => Math.sqrt(a * a + b * b + c * c);

// ---------------------------------------------------------------- blending

/** Polynomial smooth minimum (Quilez). */
export function smin(a: number, b: number, k: number): number {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

export function smax(a: number, b: number, k: number): number {
  return -smin(-a, -b, k);
}

export function evaluate(shape: Shape, x: number, y: number, z: number): number {
  let d = Infinity;
  for (const p of shape.prims) {
    const b = p.dist.bound;
    if (b && d !== Infinity) {
      // Skip primitives too far away to change the blend (smin/smax are exact beyond `blend`).
      const lower = b.k * (len(x - b.c[0], y - b.c[1], z - b.c[2]) - b.r);
      if (p.subtract ? lower >= p.blend - d : lower >= d + p.blend) continue;
    }
    const di = p.dist(x, y, z);
    if (p.subtract) d = smax(d, -di, p.blend);
    else d = d === Infinity ? di : smin(d, di, p.blend);
  }
  if (shape.clip) d = smax(d, shape.clip(x, y, z), shape.clipBlend ?? 0);
  if (shape.detail) d = shape.detail(x, y, z, d);
  return d;
}

// ---------------------------------------------------------------- primitives

export const sphere = (c: Vec3, r: number): Dist => bounded((x, y, z) => len(x - c[0], y - c[1], z - c[2]) - r, c, r);

/** Ellipsoid (bound-corrected approximation; never below (rmin / rmax) * (|p - c| - rmax)). */
export const ellipsoid = (c: Vec3, rad: Vec3): Dist =>
  bounded(
    (x, y, z) => {
      const px = (x - c[0]) / rad[0];
      const py = (y - c[1]) / rad[1];
      const pz = (z - c[2]) / rad[2];
      const k0 = len(px, py, pz);
      const k1 = len(px / rad[0], py / rad[1], pz / rad[2]);
      return k1 === 0 ? -Math.min(...rad) : (k0 * (k0 - 1)) / k1;
    },
    c,
    Math.max(...rad),
    Math.min(...rad) / Math.max(...rad),
  );

/** Capsule between a and b. */
export const capsule = (a: Vec3, b: Vec3, r: number): Dist => {
  const bax = b[0] - a[0];
  const bay = b[1] - a[1];
  const baz = b[2] - a[2];
  const len2 = bax * bax + bay * bay + baz * baz || 1e-9;
  const mid: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  return bounded(
    (x, y, z) => {
      const pax = x - a[0];
      const pay = y - a[1];
      const paz = z - a[2];
      const h = Math.max(0, Math.min(1, (pax * bax + pay * bay + paz * baz) / len2));
      return len(pax - bax * h, pay - bay * h, paz - baz * h) - r;
    },
    mid,
    Math.sqrt(len2) / 2 + r,
  );
};

/** Tapered capsule (round cone) from a (radius r1) to b (radius r2). */
export const roundCone = (a: Vec3, b: Vec3, r1: number, r2: number): Dist => {
  const bax = b[0] - a[0];
  const bay = b[1] - a[1];
  const baz = b[2] - a[2];
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = r1 - r2;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  const mid: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  return bounded(
    (x, y, z) => {
      const pax = x - a[0];
      const pay = y - a[1];
      const paz = z - a[2];
      const yy = pax * bax + pay * bay + paz * baz;
      const zz = yy - l2;
      const qx = pax * l2 - bax * yy;
      const qy = pay * l2 - bay * yy;
      const qz = paz * l2 - baz * yy;
      const x2 = qx * qx + qy * qy + qz * qz;
      const y2 = yy * yy * l2;
      const z2 = zz * zz * l2;
      const k = Math.sign(rr) * rr * rr * x2;
      if (Math.sign(zz) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
      if (Math.sign(yy) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
      return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - r1;
    },
    mid,
    Math.sqrt(l2) / 2 + Math.max(r1, r2),
  );
};

/** Rounded box, axis-aligned in the frame given by `frame` (see `inFrame`). */
export const roundBox = (c: Vec3, half: Vec3, round: number): Dist =>
  bounded(
    (x, y, z) => {
      const qx = Math.abs(x - c[0]) - half[0] + round;
      const qy = Math.abs(y - c[1]) - half[1] + round;
      const qz = Math.abs(z - c[2]) - half[2] + round;
      const ox = Math.max(qx, 0);
      const oy = Math.max(qy, 0);
      const oz = Math.max(qz, 0);
      return len(ox, oy, oz) + Math.min(Math.max(qx, qy, qz), 0) - round;
    },
    c,
    len(half[0], half[1], half[2]),
  );

/** Torus around the Y axis at centre c (major radius R, tube radius r). */
export const torusY = (c: Vec3, R: number, r: number): Dist => bounded((x, y, z) => len(len(x - c[0], z - c[2]) - R, y - c[1]) - r, c, R + r);

/** Half-space: distance to the plane n·p = h (n unit). Negative on the side n points away from. */
export const plane =
  (n: Vec3, h: number): Dist =>
  (x, y, z) =>
    n[0] * x + n[1] * y + n[2] * z - h;

// ---------------------------------------------------------------- frames and transforms

/** A rigid frame: origin plus orthonormal axes (columns). Points are mapped into it before evaluating. */
export interface Frame {
  o: Vec3;
  x: Vec3;
  y: Vec3;
  z: Vec3;
}

/** Evaluate `d` in a local frame (for hands, boots: modelled upright, placed along a limb). */
export const inFrame = (f: Frame, d: Dist): Dist => {
  const fn = (x: number, y: number, z: number) => {
    const px = x - f.o[0];
    const py = y - f.o[1];
    const pz = z - f.o[2];
    return d(px * f.x[0] + py * f.x[1] + pz * f.x[2], px * f.y[0] + py * f.y[1] + pz * f.y[2], px * f.z[0] + py * f.z[1] + pz * f.z[2]);
  };
  const b = d.bound;
  if (!b) return fn;
  const c: Vec3 = [0, 1, 2].map((i) => f.o[i] + b.c[0] * f.x[i] + b.c[1] * f.y[i] + b.c[2] * f.z[i]) as Vec3;
  return bounded(fn, c, b.r, b.k);
};

/** Non-uniform scale about a centre (approximate distance, conservative by the min scale). */
export const scaled = (c: Vec3, s: Vec3, d: Dist): Dist => {
  const m = Math.min(s[0], s[1], s[2]);
  const M = Math.max(s[0], s[1], s[2]);
  const fn = (x: number, y: number, z: number) => d(c[0] + (x - c[0]) / s[0], c[1] + (y - c[1]) / s[1], c[2] + (z - c[2]) / s[2]) * m;
  const b = d.bound;
  if (!b) return fn;
  const bc: Vec3 = [c[0] + (b.c[0] - c[0]) * s[0], c[1] + (b.c[1] - c[1]) * s[1], c[2] + (b.c[2] - c[2]) * s[2]];
  return bounded(fn, bc, b.r * M, (b.k * m) / M);
};

/** Mirror across the YZ plane (x -> -x) so one definition serves both sides. */
export const mirrorX = (d: Dist): Dist => {
  const fn = (x: number, y: number, z: number) => d(-x, y, z);
  return d.bound ? bounded(fn, [-d.bound.c[0], d.bound.c[1], d.bound.c[2]], d.bound.r, d.bound.k) : fn;
};

/** Frame for a limb pointing along `dir` from `o`, with `fwd` as a hint for the local +Z. */
export function limbFrame(o: Vec3, dir: Vec3, fwd: Vec3): Frame {
  // local -Y points along the limb (limbs hang down in their canonical pose)
  const ly = norm([-dir[0], -dir[1], -dir[2]]);
  let lx = cross(ly, fwd);
  lx = norm(lx);
  const lz = cross(lx, ly);
  return { o, x: lx, y: ly, z: lz };
}

export const norm = (v: Vec3): Vec3 => {
  const l = len(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
