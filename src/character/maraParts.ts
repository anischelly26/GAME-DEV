import {
  capsule,
  ellipsoid,
  evaluate,
  inFrame,
  len,
  limbFrame,
  mirrorX,
  norm,
  roundBox,
  roundCone,
  scaled,
  smax,
  sphere,
  torusY,
  type Dist,
  type Frame,
  type Primitive,
  type Shape,
  type Vec3,
} from './sdf';

/**
 * Mara Venn's body and costume as signed-distance shapes. Original design; no third-party assets.
 * Modelled facing +Z with feet at y = 0, about 1.68 m tall. Side -1 is x < 0 (her right), side +1
 * is x > 0 (her left), matching the animation code.
 *
 * Pure data and maths (no three.js), so the parts can be meshed in Web Workers.
 */

/** Arms are sculpted at this angle from vertical (an A-pose) so the armpits mesh cleanly. */
export const ARM_BIND_ANGLE = 0.5;
export const SIDES = [-1, 1] as const;
const UPPER_ARM = 0.27;
const FOREARM = 0.235;
const LEG_X = 0.092;

export const armDir = (s: number): Vec3 => [s * Math.sin(ARM_BIND_ANGLE), -Math.cos(ARM_BIND_ANGLE), 0];
const along = (o: Vec3, d: Vec3, t: number): Vec3 => [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t];
export const sideName = (s: number) => (s < 0 ? 'R' : 'L');

export interface BoneDef {
  name: string;
  parent: string | null;
  /** Bind position in model space. */
  pos: Vec3;
  /** Rest rotation about Z in model space (the arms carry the A-pose angle). */
  rz?: number;
}

export function boneDefs(): BoneDef[] {
  const defs: BoneDef[] = [
    { name: 'root', parent: null, pos: [0, 0, 0] },
    { name: 'hips', parent: 'root', pos: [0, 0.93, 0] },
    { name: 'spine', parent: 'hips', pos: [0, 1.05, 0] },
    { name: 'chest', parent: 'spine', pos: [0, 1.24, 0] },
    { name: 'neck', parent: 'chest', pos: [0, 1.39, -0.008] },
    { name: 'head', parent: 'neck', pos: [0, 1.455, 0] },
    { name: 'bun', parent: 'head', pos: [0, 1.6, -0.09] },
  ];
  for (const s of SIDES) {
    const n = sideName(s);
    const shoulder: Vec3 = [s * 0.165, 1.35, -0.008];
    const d = armDir(s);
    const elbow = along(shoulder, d, UPPER_ARM);
    const wrist = along(elbow, d, FOREARM);
    defs.push(
      { name: `upperArm${n}`, parent: 'chest', pos: shoulder, rz: s * ARM_BIND_ANGLE },
      { name: `forearm${n}`, parent: `upperArm${n}`, pos: elbow, rz: s * ARM_BIND_ANGLE },
      { name: `hand${n}`, parent: `forearm${n}`, pos: wrist, rz: s * ARM_BIND_ANGLE },
      { name: `thigh${n}`, parent: 'hips', pos: [s * LEG_X, 0.885, 0] },
      { name: `shin${n}`, parent: `thigh${n}`, pos: [s * LEG_X, 0.485, 0.006] },
      { name: `foot${n}`, parent: `shin${n}`, pos: [s * LEG_X, 0.085, -0.004] },
    );
  }
  return defs;
}

export const bonePos = (defs: BoneDef[], name: string) => defs.find((b) => b.name === name)!.pos;
const P = (dist: Dist, bone: string, blend = 0, extra: Partial<Primitive> = {}): Primitive => ({ dist, bone, blend, ...extra });
/** A soft crease where `planeDist` crosses zero (kept wider than the voxel size). */
const groove = (planeDist: number, depth = 0.0015, width = 0.0045) => depth * Math.exp(-(planeDist * planeDist) / (width * width));
/** Frame rotated about Z by `theta` around `o` (shapes defined in it appear rotated by +theta). */
const rotZ = (o: Vec3, theta: number): Frame => ({ o, x: [Math.cos(theta), Math.sin(theta), 0], y: [-Math.sin(theta), Math.cos(theta), 0], z: [0, 0, 1] });
const smooth01 = (t: number) => {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
};
/** 1 inside [lo, hi], easing to 0 over `w` outside it (keeps detail terms continuous). */
const band = (v: number, lo: number, hi: number, w: number) => smooth01((v - lo) / w + 1) * smooth01((hi - v) / w + 1);

/** Find the front surface of a shape along -Z at (x, y). */
function surfaceZ(shape: Shape, x: number, y: number): number {
  let z = 0.16;
  while (z > -0.05 && evaluate(shape, x, y, z) > 0) z -= 0.002;
  let lo = z;
  let hi = z + 0.002;
  for (let i = 0; i < 24; i++) {
    const m = (lo + hi) / 2;
    if (evaluate(shape, x, y, m) > 0) hi = m;
    else lo = m;
  }
  return (lo + hi) / 2;
}

// ---------------------------------------------------------------- head and face

export const EYE = { x: 0.033, y: 1.513, z: 0.0745, r: 0.0125 };

export function headShape(): Shape {
  const prims: Primitive[] = [
    P(ellipsoid([0, 1.55, -0.012], [0.083, 0.098, 0.095]), 'head'),
    P(ellipsoid([0, 1.495, 0.018], [0.064, 0.076, 0.077]), 'head', 0.035),
    // Jaw line from below the ears to the chin, and the chin itself.
    P(capsule([-0.05, 1.47, -0.012], [0, 1.424, 0.045], 0.017), 'head', 0.03),
    P(capsule([0.05, 1.47, -0.012], [0, 1.424, 0.045], 0.017), 'head', 0.03),
    P(ellipsoid([0, 1.429, 0.052], [0.019, 0.017, 0.016]), 'head', 0.02),
    // Cheekbones, soft cheeks and brow ridge.
    P(sphere([-0.044, 1.502, 0.058], 0.019), 'head', 0.025),
    P(sphere([0.044, 1.502, 0.058], 0.019), 'head', 0.025),
    P(sphere([-0.038, 1.472, 0.056], 0.021), 'head', 0.03),
    P(sphere([0.038, 1.472, 0.056], 0.021), 'head', 0.03),
    P(capsule([-0.037, 1.535, 0.077], [0.037, 1.535, 0.077], 0.011), 'head', 0.02),
    // Nose: bridge to tip, then the wings of the nostrils.
    P(roundCone([0, 1.527, 0.086], [0, 1.491, 0.1], 0.0066, 0.011), 'head', 0.012),
    P(sphere([-0.0102, 1.486, 0.092], 0.0072), 'head', 0.008),
    P(sphere([0.0102, 1.486, 0.092], 0.0072), 'head', 0.008),
    // Eye sockets.
    P(sphere([-EYE.x, EYE.y, 0.088], 0.015), 'head', 0.01, { subtract: true, noWeight: true }),
    P(sphere([EYE.x, EYE.y, 0.088], 0.015), 'head', 0.01, { subtract: true, noWeight: true }),
    // Lips and the line where they meet.
    P(ellipsoid([0, 1.4595, 0.0835], [0.017, 0.006, 0.008]), 'head', 0.008),
    P(ellipsoid([0, 1.4485, 0.082], [0.0145, 0.0065, 0.008]), 'head', 0.008),
    P(capsule([-0.016, 1.454, 0.0905], [0.016, 1.454, 0.0905], 0.0016), 'head', 0.003, { subtract: true, noWeight: true }),
    // Ears (mostly under the hair).
    P(ellipsoid([-0.082, 1.505, -0.006], [0.011, 0.026, 0.017]), 'head', 0.01),
    P(ellipsoid([0.082, 1.505, -0.006], [0.011, 0.026, 0.017]), 'head', 0.01),
    P(capsule([0, 1.36, -0.012], [0, 1.452, -0.016], 0.04), 'neck', 0.035),
  ];
  return {
    prims,
    tint: (x, y, z) => {
      if (z < 0.03) return [1, 1, 1];
      // Warmer lips, a little colour on the cheeks, slightly darker lids.
      const lx = x / 0.02;
      const ly = (y - 1.454) / 0.0115;
      const lip = smooth01(1.4 * (1 - (lx * lx + ly * ly)));
      const cheek = smooth01(1 - len(Math.abs(x) - 0.046, y - 1.49, z - 0.066) / 0.026) * 0.8;
      const lid = smooth01(1 - len(Math.abs(x) - EYE.x, (y - EYE.y - 0.008) * 1.6, z - 0.084) / 0.016) * 0.5;
      return [1 - 0.02 * cheek - 0.06 * lid, 1 - 0.2 * lip - 0.08 * cheek - 0.1 * lid, 1 - 0.17 * lip - 0.08 * cheek - 0.08 * lid];
    },
  };
}

export function browsShape(): Shape {
  const head = headShape();
  const prims: Primitive[] = [];
  const at = (x: number, y: number): Vec3 => [x, y, surfaceZ(head, x, y) + 0.0009];
  for (const s of SIDES) {
    const inner = at(s * 0.012, 1.5335);
    const mid = at(s * 0.031, 1.538);
    const outer = at(s * 0.049, 1.5335);
    prims.push(P(roundCone(inner, mid, 0.0027, 0.003), 'head', 0.002), P(roundCone(mid, outer, 0.003, 0.002), 'head', 0.002));
  }
  return { prims };
}

export function hairShape(): Shape {
  const tilt = -0.28;
  const prims: Primitive[] = [
    P(ellipsoid([0, 1.556, -0.016], [0.093, 0.104, 0.103]), 'head'),
    P(ellipsoid([0, 1.5, -0.045], [0.098, 0.075, 0.085]), 'head', 0.03),
    P(ellipsoid([-0.083, 1.495, 0.0], [0.028, 0.06, 0.068]), 'head', 0.02),
    P(ellipsoid([0.083, 1.495, 0.0], [0.028, 0.06, 0.068]), 'head', 0.02),
    // Locks framing the face.
    P(roundCone([-0.073, 1.545, 0.052], [-0.069, 1.463, 0.046], 0.016, 0.011), 'head', 0.015),
    P(roundCone([0.073, 1.545, 0.052], [0.07, 1.47, 0.044], 0.015, 0.01), 'head', 0.015),
    // Fringe volume over the forehead, swept from a parting on her left.
    P(inFrame(rotZ([-0.008, 1.585, 0.058], tilt), ellipsoid([0, 0, 0], [0.078, 0.034, 0.036])), 'head', 0.02),
    // Face and nape cut-outs: a tilted hairline, and the bob ending around the jaw.
    P(inFrame(rotZ([0, 1.49, 0.075], tilt), ellipsoid([0, 0, 0], [0.065, 0.083, 0.09])), 'head', 0.008, { subtract: true, noWeight: true }),
    P(ellipsoid([0, 1.422, 0.02], [0.12, 0.035, 0.12]), 'head', 0.02, { subtract: true, noWeight: true }),
    // Loose clumps breaking the fringe edge over her right brow.
    P(roundCone([-0.02, 1.577, 0.084], [-0.033, 1.555, 0.087], 0.0085, 0.005), 'head', 0.01),
    P(roundCone([-0.04, 1.568, 0.081], [-0.054, 1.543, 0.08], 0.0085, 0.005), 'head', 0.01),
    // Bun.
    P(sphere([0, 1.607, -0.118], 0.034), 'bun', 0.012),
  ];
  return {
    prims,
    detail: (x, y, z, d) => {
      if (Math.abs(d) > 0.012) return d;
      const ang = Math.atan2(x, z + 0.02);
      // Strand clumps flowing down and back; a spiral on the bun.
      let dd = d + 0.0011 * Math.sin(ang * 30 + y * 20) + 0.0008 * Math.sin(ang * 13 + 3.1);
      const by = y - 1.607;
      const bz = z + 0.118;
      if (x * x + by * by + bz * bz < 0.045 * 0.045) dd += 0.0012 * Math.sin(Math.atan2(by, x) * 5 + len(x, by) * 120);
      return dd;
    },
  };
}

export function hairTieShape(): Shape {
  const axis = norm([0, 0.45, -0.89]);
  const frame = limbFrame([0, 1.594, -0.094], [-axis[0], -axis[1], -axis[2]], [1, 0, 0]);
  return { prims: [P(inFrame(frame, torusY([0, 0, 0], 0.024, 0.0065)), 'bun')] };
}

// ---------------------------------------------------------------- arms and hands

/** Canonical left hand: wrist at origin, fingers toward -Y, palm facing -X, thumb toward +Z. */
function canonicalHand(): Primitive[] {
  const prims: Primitive[] = [P(capsule([0, 0.025, 0], [0, -0.012, 0], 0.021), '', 0.016)];
  prims.push(P(roundBox([0, -0.048, 0], [0.012, 0.042, 0.036], 0.011), '', 0.012));
  prims.push(P(capsule([0.002, -0.084, -0.026], [0.002, -0.084, 0.026], 0.011), '', 0.008));
  const zs = [0.026, 0.009, -0.009, -0.025];
  const lens = [0.064, 0.073, 0.069, 0.055];
  const rad = [0.0086, 0.0092, 0.0088, 0.0076];
  for (let i = 0; i < 4; i++) {
    // Relaxed curl: each finger bends towards the palm (-X).
    const a: Vec3 = [0.001, -0.086, zs[i]];
    const b: Vec3 = [-0.006, -0.086 - lens[i] * 0.52, zs[i]];
    const c: Vec3 = [-0.02, -0.086 - lens[i] * 0.9, zs[i] * 0.93];
    prims.push(P(capsule(a, b, rad[i]), '', 0.006), P(capsule(b, c, rad[i] * 0.88), '', 0.004));
  }
  prims.push(P(roundCone([-0.004, -0.02, 0.03], [-0.013, -0.051, 0.049], 0.0122, 0.0105), '', 0.009));
  prims.push(P(capsule([-0.013, -0.051, 0.049], [-0.022, -0.073, 0.052], 0.0095), '', 0.004));
  return prims;
}

export function armSkinShape(s: number): Shape {
  const n = sideName(s);
  const defs = boneDefs();
  const elbow = bonePos(defs, `forearm${n}`);
  const wrist = bonePos(defs, `hand${n}`);
  const d = armDir(s);
  const prims: Primitive[] = [
    P(roundCone(elbow, along(wrist, d, -0.03), 0.031, 0.023), `forearm${n}`),
    P(sphere(along(elbow, d, 0.09), 0.033), `forearm${n}`, 0.06),
  ];
  const frame: Frame = limbFrame(wrist, d, [0, 0, 1]);
  for (const hp of canonicalHand()) {
    const local = s > 0 ? hp.dist : mirrorX(hp.dist);
    prims.push({ ...hp, dist: inFrame(frame, local), bone: `hand${n}` });
  }
  return { prims };
}

// ---------------------------------------------------------------- clothing

function torsoPrims(inflate: number): Primitive[] {
  const i = inflate;
  return [
    P(ellipsoid([0, 1.235, 0.004], [0.136 + i, 0.13 + i, 0.09 + i]), 'chest'),
    P(ellipsoid([0, 1.085, -0.002], [0.115 + i, 0.12 + i, 0.08 + i]), 'spine', 0.07),
    P(capsule([-0.13, 1.33, -0.01], [0.13, 1.33, -0.01], 0.039 + i), 'chest', 0.06),
    P(sphere([-0.047, 1.222, 0.063], 0.05 + i), 'chest', 0.05),
    P(sphere([0.047, 1.222, 0.063], 0.05 + i), 'chest', 0.05),
  ];
}

export function shirtShape(): Shape {
  const defs = boneDefs();
  const prims = torsoPrims(0);
  // Short sleeve stubs so the shoulders follow the arms under the jacket.
  for (const s of SIDES) {
    const n = sideName(s);
    const sh = bonePos(defs, `upperArm${n}`);
    prims.push(P(roundCone(along(sh, armDir(s), 0.03), along(sh, armDir(s), 0.12), 0.035, 0.033), `upperArm${n}`, 0.02));
  }
  prims.push(P(ellipsoid([0, 0.985, 0], [0.136, 0.07, 0.09]), 'hips', 0.06));
  prims.push(P(capsule([0, 1.36, 0.004], [0, 1.52, 0.0], 0.04), 'chest', 0.012, { subtract: true, noWeight: true }));
  return {
    prims,
    // Only what can be seen: the front (through the open jacket) and below the hem.
    clip: (_x, y, z) => Math.min(-z, y - 1.07),
    detail: (x, y, z, d) => {
      if (Math.abs(d) > 0.012) return d;
      // Soft folds where the shirt bunches above the belt, and the button placket.
      const waist = Math.max(0, 1 - Math.abs(y - 1.05) / 0.06);
      let dd = d + 0.0022 * Math.sin(y * 150 + x * 25) * waist;
      if (z > 0) dd += groove(x - 0.008, 0.0012, 0.004);
      return dd;
    },
  };
}

export function jacketShape(): Shape {
  const prims = torsoPrims(0.013);
  const defs = boneDefs();
  for (const s of SIDES) {
    const n = sideName(s);
    const sh = bonePos(defs, `upperArm${n}`);
    const el = bonePos(defs, `forearm${n}`);
    const d = armDir(s);
    prims.push(P(roundCone(along(sh, d, 0.02), along(el, d, 0.02), 0.049, 0.045), `upperArm${n}`, 0.035));
    // Rolled cuff: a thicker band just below the elbow, cut flat so it meets the forearm cleanly.
    prims.push(P(roundCone(along(el, d, 0.0), along(el, d, 0.05), 0.049, 0.047), `forearm${n}`, 0.006));
    const end = along(el, d, 0.046);
    const beyond: Dist = (x, y, z) => {
      const px = x - end[0];
      const py = y - end[1];
      const pz = z - end[2];
      const t = px * d[0] + py * d[1] + pz * d[2];
      return Math.max(-t, Math.sqrt(Math.max(0, px * px + py * py + pz * pz - t * t)) - 0.08);
    };
    prims.push(P(beyond, `forearm${n}`, 0.003, { subtract: true, noWeight: true }));
  }
  // Stand collar around the neck.
  prims.push(P(scaled([0, 1.376, -0.012], [1, 1, 0.92], torusY([0, 1.376, -0.012], 0.068, 0.02)), 'chest', 0.012));
  // Open front: a V-shaped slot down the chest; and the neck hole.
  const opening: Dist = (x, y, z) => Math.max(Math.abs(x) - (0.026 + 0.11 * Math.max(0, 1.37 - y)), 0.01 - z, y - 1.37);
  prims.push(P(opening, 'chest', 0.006, { subtract: true, noWeight: true }));
  prims.push(P(capsule([0, 1.37, -0.006], [0, 1.52, 0.0], 0.045), 'chest', 0.008, { subtract: true, noWeight: true }));
  const sleeves = SIDES.map((s) => ({ sh: bonePos(defs, `upperArm${sideName(s)}`), d: armDir(s) }));
  return {
    prims,
    clip: (_x, y) => 1.03 - y,
    clipBlend: 0.008,
    detail: (x, y, z, d) => {
      if (Math.abs(d) > 0.012) return d;
      let dd = d;
      // Seams: side seams, back yoke, hem band, topstitching along the opening, set-in sleeves.
      dd += groove(Math.abs(x) - 0.142) * band(y, 0, 1.3, 0.02);
      dd += groove(y - 1.29) * band(-z, 0, 1, 0.02) * band(Math.abs(x), 0, 0.14, 0.02);
      dd += groove(y - 1.06, 0.0013);
      dd += groove(Math.abs(x) - (0.026 + 0.11 * Math.max(0, 1.37 - y)) - 0.014, 0.001, 0.003) * band(z, 0, 1, 0.01) * band(y, 0, 1.36, 0.01);
      for (const { sh, d: ad } of sleeves) {
        const px = x - sh[0];
        const py = y - sh[1];
        const pz = z - sh[2];
        const t = px * ad[0] + py * ad[1] + pz * ad[2];
        const radial = Math.sqrt(Math.max(0, px * px + py * py + pz * pz - t * t));
        const near = band(radial, -1, 0.065, 0.015);
        if (near <= 0) continue;
        dd += groove(t - 0.03, 0.0016) * near;
        // Bunched folds above the elbow.
        dd += 0.002 * Math.sin(t * 150) * near * band(t, 0.18, 0.24, 0.025) * (0.4 + 0.6 * smooth01(-z / 0.03 + 0.5));
      }
      // Loose drape across the back.
      dd += 0.0016 * Math.sin(x * 60 + y * 18) * band(-z, 0.04, 1, 0.02) * band(y, 0, 1.25, 0.03);
      return dd;
    },
  };
}

function legPrims(inflate: number, s: number): Primitive[] {
  const n = sideName(s);
  const x = s * LEG_X;
  return [
    P(roundCone([x, 0.885, 0], [x, 0.485, 0.008], 0.091 + inflate, 0.064 + inflate), `thigh${n}`, 0.05),
    P(sphere([x, 0.485, 0.015], 0.06 + inflate), `shin${n}`, 0.02),
    P(roundCone([x, 0.485, 0.006], [x, 0.15, -0.005], 0.06 + inflate, 0.053 + inflate), `shin${n}`, 0.02),
  ];
}

export function trousersShape(): Shape {
  const prims: Primitive[] = [
    P(ellipsoid([0, 0.935, -0.004], [0.157, 0.105, 0.104]), 'hips'),
    P(sphere([-0.06, 0.88, -0.05], 0.085), 'hips', 0.05),
    P(sphere([0.06, 0.88, -0.05], 0.085), 'hips', 0.05),
    ...legPrims(0, -1),
    ...legPrims(0, 1),
  ];
  return {
    prims,
    clip: (_x, y) => y - 1.02,
    clipBlend: 0.01,
    detail: (x, y, z, d) => {
      if (Math.abs(d) > 0.012) return d;
      let dd = d;
      const s = x < 0 ? -1 : 1;
      const xc = s * LEG_X;
      const leg = band(y, 0.14, 0.82, 0.04);
      // Outer seam on each leg.
      dd += groove(z, 0.0012, 0.004) * leg * smooth01(((x - xc) * s) / 0.02);
      // Folds behind the knee and diagonal pulls at the front of the hip.
      dd += 0.0024 * Math.sin(y * 200) * band(y, 0.44, 0.52, 0.03) * smooth01(-z / 0.02);
      dd += 0.0016 * Math.sin((y - (x - xc) * s * 0.8) * 120) * band(y, 0.72, 0.84, 0.05) * smooth01(z / 0.02);
      // Fabric bunching above the boots.
      dd += 0.0022 * Math.sin(y * 140 + Math.atan2(z, x - xc) * 3) * band(y, 0, 0.3, 0.03);
      return dd;
    },
  };
}

/** A stitched canvas patch over her left knee. */
export function kneePatchShape(): Shape {
  const leg = legPrims(0.0035, 1);
  const region = roundBox([LEG_X + 0.004, 0.495, 0.07], [0.043, 0.05, 0.04], 0.012);
  const shell: Dist = (x, y, z) => {
    let d = Infinity;
    for (const p of leg) d = Math.min(d, p.dist(x, y, z));
    return smax(d, region(x, y, z), 0.004);
  };
  return {
    prims: [P(shell, 'shinL')],
    detail: (x, y, _z, d) => d + groove(Math.max(Math.abs(x - LEG_X - 0.004) - 0.035, Math.abs(y - 0.495) - 0.042), 0.0008, 0.0025),
  };
}

export function bootShape(s: number): Shape {
  const n = sideName(s);
  const xc = s * LEG_X;
  const prims: Primitive[] = [
    P(roundCone([xc, 0.075, -0.012], [xc, 0.16, -0.01], 0.056, 0.059), `foot${n}`),
    P(roundCone([xc, 0.15, -0.01], [xc, 0.255, -0.008], 0.059, 0.063), `shin${n}`, 0.01),
    P(roundCone([xc, 0.232, -0.008], [xc, 0.272, -0.008], 0.068, 0.07), `shin${n}`, 0.004),
    P(roundBox([xc, 0.05, 0.045], [0.046, 0.045, 0.104], 0.034), `foot${n}`, 0.03),
    P(ellipsoid([xc, 0.045, 0.124], [0.047, 0.039, 0.05]), `foot${n}`, 0.02),
    P(sphere([xc, 0.06, -0.045], 0.049), `foot${n}`, 0.02),
  ];
  return {
    prims,
    clip: (_x, y) => 0.024 - y,
    clipBlend: 0.002,
    detail: (_x, y, z, d) => {
      if (Math.abs(d) > 0.012) return d;
      // Toe-cap seam, welt line, cuff seam.
      let dd = d + (y < 0.09 ? groove(z - 0.088, 0.0014) : 0);
      dd += groove(y - 0.036, 0.0011);
      dd += groove(y - 0.232, 0.0014);
      return dd;
    },
    // Scuffed toes and heels.
    tint: (_x, y, z) => {
      const scuff = y < 0.09 && (z > 0.12 || z < -0.08) ? 1.12 : 1;
      return [scuff, scuff * 0.98, scuff * 0.95];
    },
  };
}

export function soleShape(s: number): Shape {
  const n = sideName(s);
  const xc = s * LEG_X;
  return {
    prims: [
      P(roundBox([xc, 0.014, 0.05], [0.05, 0.014, 0.111], 0.009), `foot${n}`),
      P(roundBox([xc, 0.022, -0.035], [0.049, 0.022, 0.047], 0.008), `foot${n}`, 0.006),
    ],
  };
}

export function lacesShape(s: number): Shape {
  const n = sideName(s);
  const xc = s * LEG_X;
  const prims: Primitive[] = [];
  for (let i = 0; i < 5; i++) {
    const y = 0.095 + i * 0.033;
    const z = 0.05 - i * 0.002;
    const bone = i < 2 ? `foot${n}` : `shin${n}`;
    prims.push(P(capsule([xc - 0.022, y, z], [xc + 0.022, y + 0.016, z + 0.002], 0.0036), bone, 0.002));
    prims.push(P(capsule([xc + 0.022, y, z], [xc - 0.022, y + 0.016, z + 0.002], 0.0036), bone, 0.002));
  }
  return { prims };
}

export function beltShape(): Shape {
  const band = scaled([0, 1.0, -0.004], [1, 1, 0.68], torusY([0, 1.0, -0.004], 0.155, 0.021));
  const prims: Primitive[] = [P(band, 'hips')];
  // Pouches on both hips and one at the back.
  for (const s of SIDES) prims.push(P(roundBox([s * 0.148, 0.963, 0.03], [0.026, 0.045, 0.028], 0.01), 'hips', 0.006));
  prims.push(P(roundBox([-0.1, 0.955, -0.072], [0.034, 0.05, 0.028], 0.012), 'hips', 0.006));
  return {
    prims,
    detail: (_x, y, _z, d) => (Math.abs(d) > 0.01 ? d : d + groove(y - 0.985, 0.001, 0.003)),
  };
}

export function buckleShape(): Shape {
  return {
    prims: [
      P(roundBox([0, 1.0, 0.116], [0.027, 0.023, 0.006], 0.004), 'hips'),
      P(roundBox([0, 1.0, 0.123], [0.016, 0.012, 0.012], 0.002), 'hips', 0.002, { subtract: true, noWeight: true }),
      P(capsule([0, 1.0, 0.118], [0.012, 1.0, 0.122], 0.0035), 'hips', 0.002),
    ],
  };
}

export function wrenchShape(): Shape {
  // Hangs from a loop on the right of the belt: flat shaft, open jaw at the bottom.
  const f: Frame = limbFrame([-0.172, 0.975, 0.085], norm([-0.06, -1, 0.05]), [0.35, 0, 1]);
  const local = (d: Dist) => inFrame(f, d);
  return {
    prims: [
      P(local(roundBox([0, -0.055, 0], [0.004, 0.058, 0.009], 0.0035)), 'hips'),
      P(local(roundBox([0, -0.125, 0], [0.0055, 0.019, 0.019], 0.006)), 'hips', 0.006),
      P(local(roundBox([0, -0.138, 0], [0.01, 0.014, 0.0085], 0.002)), 'hips', 0.002, { subtract: true, noWeight: true }),
      P(local(torusY([0, 0.006, 0], 0.012, 0.0035)), 'hips', 0.003),
    ],
  };
}

export function scarfShape(): Shape {
  const tilt = (a: number, d: Dist): Dist => {
    const c = Math.cos(a);
    const sn = Math.sin(a);
    return (x, y, z) => d(x, 1.37 + (y - 1.37) * c - z * sn, (y - 1.37) * sn + z * c);
  };
  const prims: Primitive[] = [
    P(tilt(-0.22, scaled([0, 1.37, 0], [1, 1, 0.95], torusY([0, 1.37, -0.004], 0.073, 0.029))), 'chest'),
    P(tilt(-0.05, scaled([0, 1.396, -0.006], [1, 1, 0.92], torusY([0, 1.396, -0.006], 0.062, 0.022))), 'neck', 0.02),
    // Knot at the front, on her left.
    P(ellipsoid([0.044, 1.333, 0.085], [0.035, 0.03, 0.028]), 'chest', 0.02),
  ];
  return {
    prims,
    detail: (x, _y, z, d) => {
      if (Math.abs(d) > 0.012) return d;
      // Chunky knit ribs running around the wrap (kept well above the mesh resolution).
      return d + 0.0016 * Math.sin(Math.atan2(x, z) * 22);
    },
  };
}

// ---------------------------------------------------------------- part list

export type MaterialKey = 'skin' | 'shirt' | 'jacket' | 'trousers' | 'patch' | 'leather' | 'sole' | 'belt' | 'brass' | 'steel' | 'laces' | 'scarf' | 'hair';

export interface PartSpec {
  name: string;
  shape: () => Shape;
  min: Vec3;
  max: Vec3;
  /** Voxel size in metres. Detail functions keep their features at least ~4 voxels wide. */
  voxel: number;
  material: MaterialKey;
  ao?: number;
  weightFalloff?: number;
  /** [target triangle ratio, max error in metres] for meshoptimizer. */
  simplify: [number, number];
  /** Rough relative cost, used to balance work between workers. */
  cost: number;
}

function bounds(points: Vec3[], margin: number): [Vec3, Vec3] {
  const lo: Vec3 = [Infinity, Infinity, Infinity];
  const hi: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const p of points)
    for (let i = 0; i < 3; i++) {
      lo[i] = Math.min(lo[i], p[i] - margin);
      hi[i] = Math.max(hi[i], p[i] + margin);
    }
  return [lo, hi];
}

export function partSpecs(): PartSpec[] {
  const defs = boneDefs();
  const specs: PartSpec[] = [
    { name: 'head', shape: headShape, min: [-0.1, 1.33, -0.115], max: [0.1, 1.655, 0.12], voxel: 0.004, material: 'skin', simplify: [0.4, 0.0003], cost: 6 },
    { name: 'shirt', shape: shirtShape, min: [-0.26, 0.9, -0.05], max: [0.26, 1.43, 0.16], voxel: 0.007, material: 'shirt', simplify: [0.3, 0.0006], cost: 2 },
    {
      name: 'jacket',
      shape: jacketShape,
      min: [-0.36, 1.0, -0.13],
      max: [0.36, 1.44, 0.16],
      voxel: 0.0065,
      material: 'jacket',
      weightFalloff: 0.03,
      simplify: [0.3, 0.0005],
      cost: 4,
    },
    {
      name: 'trousers',
      shape: trousersShape,
      min: [-0.26, 0.1, -0.16],
      max: [0.26, 1.06, 0.125],
      voxel: 0.0075,
      material: 'trousers',
      weightFalloff: 0.025,
      simplify: [0.25, 0.0006],
      cost: 3,
    },
    {
      name: 'patch',
      shape: kneePatchShape,
      min: [LEG_X - 0.06, 0.43, 0.02],
      max: [LEG_X + 0.07, 0.56, 0.105],
      voxel: 0.004,
      material: 'patch',
      ao: 0.5,
      simplify: [0.3, 0.0004],
      cost: 0.5,
    },
    { name: 'belt', shape: beltShape, min: [-0.2, 0.895, -0.13], max: [0.2, 1.035, 0.14], voxel: 0.005, material: 'belt', simplify: [0.25, 0.0005], cost: 0.8 },
    { name: 'buckle', shape: buckleShape, min: [-0.035, 0.97, 0.104], max: [0.035, 1.03, 0.135], voxel: 0.002, material: 'brass', ao: 0.3, simplify: [0.3, 0.0003], cost: 0.2 },
    { name: 'wrench', shape: wrenchShape, min: [-0.205, 0.835, 0.07], max: [-0.15, 0.995, 0.115], voxel: 0.0025, material: 'steel', ao: 0.3, simplify: [0.3, 0.0003], cost: 0.2 },
    { name: 'scarf', shape: scarfShape, min: [-0.12, 1.28, -0.11], max: [0.12, 1.44, 0.13], voxel: 0.005, material: 'scarf', simplify: [0.35, 0.0005], cost: 0.6 },
    { name: 'hairTie', shape: hairTieShape, min: [-0.04, 1.56, -0.125], max: [0.04, 1.63, -0.06], voxel: 0.0025, material: 'scarf', ao: 0.4, simplify: [0.3, 0.0003], cost: 0.1 },
    { name: 'hair', shape: hairShape, min: [-0.12, 1.42, -0.165], max: [0.12, 1.675, 0.12], voxel: 0.0045, material: 'hair', simplify: [0.4, 0.0004], cost: 2.5 },
    { name: 'brows', shape: browsShape, min: [-0.06, 1.522, 0.074], max: [0.06, 1.548, 0.1], voxel: 0.0016, material: 'hair', ao: 0.2, simplify: [0.4, 0.0002], cost: 0.2 },
  ];
  for (const s of SIDES) {
    const n = sideName(s);
    const xc = s * LEG_X;
    const el = bonePos(defs, `forearm${n}`);
    const wr = bonePos(defs, `hand${n}`);
    const [lo, hi] = bounds([el, wr, along(wr, armDir(s), 0.17)], 0.065);
    specs.push(
      { name: `arm${n}`, shape: () => armSkinShape(s), min: lo, max: hi, voxel: 0.0036, material: 'skin', simplify: [0.4, 0.0003], cost: 4 },
      { name: `boot${n}`, shape: () => bootShape(s), min: [xc - 0.08, 0.0, -0.1], max: [xc + 0.08, 0.285, 0.185], voxel: 0.0055, material: 'leather', simplify: [0.3, 0.0005], cost: 1.2 },
      {
        name: `sole${n}`,
        shape: () => soleShape(s),
        min: [xc - 0.065, -0.005, -0.095],
        max: [xc + 0.065, 0.055, 0.175],
        voxel: 0.005,
        material: 'sole',
        ao: 0.5,
        simplify: [0.15, 0.0006],
        cost: 0.2,
      },
      {
        name: `laces${n}`,
        shape: () => lacesShape(s),
        min: [xc - 0.032, 0.085, 0.035],
        max: [xc + 0.032, 0.25, 0.06],
        voxel: 0.0025,
        material: 'laces',
        ao: 0.3,
        simplify: [0.3, 0.0003],
        cost: 0.4,
      },
    );
  }
  return specs;
}
