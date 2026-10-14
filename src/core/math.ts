export const DEG = Math.PI / 180;
export const TAU = Math.PI * 2;

export const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, v));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const saturate = (v: number): number => clamp(v, 0, 1);

/** Frame-rate independent exponential smoothing toward `b`. Negative dt is treated as 0. */
export const damp = (a: number, b: number, lambda: number, dt: number): number =>
  lerp(a, b, 1 - Math.exp(-lambda * Math.max(0, dt)));

export function wrapAngle(a: number): number {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

export const dampAngle = (a: number, b: number, lambda: number, dt: number): number =>
  a + wrapAngle(b - a) * (1 - Math.exp(-lambda * Math.max(0, dt)));

/** Move `v` toward `target` by at most `maxDelta`. */
export function approach(v: number, target: number, maxDelta: number): number {
  if (v < target) return Math.min(v + maxDelta, target);
  return Math.max(v - maxDelta, target);
}

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = saturate((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

/** Small deterministic PRNG so procedural content is identical on every machine. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The Well is an 18-sided polygon. Angles are measured from +Z toward +X, so a point at
 * polar angle θ and radius r is (sin θ · r, cos θ · r).
 */
export const polar = (r: number, theta: number): { x: number; z: number } => ({
  x: Math.sin(theta) * r,
  z: Math.cos(theta) * r,
});
