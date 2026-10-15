import { evaluate, len, type Shape } from './sdf';

export interface MeshOptions {
  min: [number, number, number];
  max: [number, number, number];
  /** Voxel size in metres (smaller = finer detail, slower). */
  voxel: number;
  /** Bone name -> skeleton index, for skin weights. */
  bones: Map<string, number>;
  /** Fall-off (metres) for blending weights between primitives near a vertex. */
  weightFalloff?: number;
  /** Ambient-occlusion strength baked into vertex colours (0 disables). */
  ao?: number;
}

/** Plain mesh arrays (transferable between workers). */
export interface MeshData {
  position: Float32Array;
  normal: Float32Array;
  color: Float32Array;
  skinIndex: Uint16Array;
  skinWeight: Float32Array;
  index: Uint32Array;
}

/**
 * Surface nets polygoniser: turns an SDF shape into a smooth indexed mesh with normals, baked
 * ambient occlusion (vertex colours) and skin weights. Fine samples are only evaluated near the
 * surface, using a coarse pass and the SDF's 1-Lipschitz bound to classify the rest.
 */
export function meshShape(shape: Shape, o: MeshOptions): MeshData {
  const h = o.voxel;
  const nx = Math.ceil((o.max[0] - o.min[0]) / h);
  const ny = Math.ceil((o.max[1] - o.min[1]) / h);
  const nz = Math.ceil((o.max[2] - o.min[2]) / h);
  const sx = nx + 1;
  const sy = ny + 1;
  const sz = nz + 1;
  const f = (x: number, y: number, z: number) => evaluate(shape, x, y, z);

  // --- coarse pass (every C fine samples)
  const C = 4;
  const cx = Math.ceil(nx / C) + 1;
  const cy = Math.ceil(ny / C) + 1;
  const cz = Math.ceil(nz / C) + 1;
  const coarse = new Float32Array(cx * cy * cz);
  for (let k = 0; k < cz; k++)
    for (let j = 0; j < cy; j++)
      for (let i = 0; i < cx; i++) coarse[i + cx * (j + cy * k)] = f(o.min[0] + i * C * h, o.min[1] + j * C * h, o.min[2] + k * C * h);
  // Exact samples are only needed near the surface; the nearest coarse sample is at most
  // (C / 2) * sqrt(3) * h away, plus a margin for the approximate (non-exact) distance functions.
  const reach = C * h * 1.45;

  // --- fine samples
  const field = new Float32Array(sx * sy * sz);
  for (let k = 0; k < sz; k++) {
    const z = o.min[2] + k * h;
    const ck = Math.min(cz - 1, Math.round(k / C));
    for (let j = 0; j < sy; j++) {
      const y = o.min[1] + j * h;
      const cj = Math.min(cy - 1, Math.round(j / C));
      for (let i = 0; i < sx; i++) {
        const ci = Math.min(cx - 1, Math.round(i / C));
        const dc = coarse[ci + cx * (cj + cy * ck)];
        field[i + sx * (j + sy * k)] = Math.abs(dc) > reach ? dc : f(o.min[0] + i * h, y, z);
      }
    }
  }

  // --- one vertex per cell that straddles the surface
  const cellIndex = new Int32Array(nx * ny * nz).fill(-1);
  const pos: number[] = [];
  const corner = (i: number, j: number, k: number) => field[i + sx * (j + sy * k)];
  const EDGES: Array<[number, number, number, number, number, number]> = [
    [0, 0, 0, 1, 0, 0],
    [0, 1, 0, 1, 1, 0],
    [0, 0, 1, 1, 0, 1],
    [0, 1, 1, 1, 1, 1],
    [0, 0, 0, 0, 1, 0],
    [1, 0, 0, 1, 1, 0],
    [0, 0, 1, 0, 1, 1],
    [1, 0, 1, 1, 1, 1],
    [0, 0, 0, 0, 0, 1],
    [1, 0, 0, 1, 0, 1],
    [0, 1, 0, 0, 1, 1],
    [1, 1, 0, 1, 1, 1],
  ];
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        let ax = 0;
        let ay = 0;
        let az = 0;
        let n = 0;
        for (const [a0, a1, a2, b0, b1, b2] of EDGES) {
          const va = corner(i + a0, j + a1, k + a2);
          const vb = corner(i + b0, j + b1, k + b2);
          if (va < 0 === vb < 0) continue;
          const t = va / (va - vb);
          ax += a0 + (b0 - a0) * t;
          ay += a1 + (b1 - a1) * t;
          az += a2 + (b2 - a2) * t;
          n++;
        }
        if (!n) continue;
        cellIndex[i + nx * (j + ny * k)] = pos.length / 3;
        pos.push(o.min[0] + (i + ax / n) * h, o.min[1] + (j + ay / n) * h, o.min[2] + (k + az / n) * h);
      }
    }
  }

  // --- project vertices onto the true surface and compute normals from the gradient
  const vcount = pos.length / 3;
  const nrm = new Float32Array(vcount * 3);
  const e = h * 0.25;
  // Tetrahedral gradient: four samples instead of six. Returns their mean (about f at the centre).
  const grad = (x: number, y: number, z: number, out: number[]) => {
    const a = f(x + e, y - e, z - e);
    const b = f(x - e, y - e, z + e);
    const c = f(x - e, y + e, z - e);
    const d = f(x + e, y + e, z + e);
    out[0] = a - b - c + d;
    out[1] = -a - b + c + d;
    out[2] = -a + b - c + d;
    const l = len(out[0], out[1], out[2]) || 1;
    out[0] /= l;
    out[1] /= l;
    out[2] /= l;
    return (a + b + c + d) * 0.25;
  };
  const g = [0, 0, 0];
  for (let v = 0; v < vcount; v++) {
    let x = pos[v * 3];
    let y = pos[v * 3 + 1];
    let z = pos[v * 3 + 2];
    // One Newton step towards the surface.
    const d = grad(x, y, z, g);
    const step = Math.max(-h * 0.5, Math.min(h * 0.5, d));
    x -= g[0] * step;
    y -= g[1] * step;
    z -= g[2] * step;
    grad(x, y, z, g);
    pos[v * 3] = x;
    pos[v * 3 + 1] = y;
    pos[v * 3 + 2] = z;
    nrm[v * 3] = g[0];
    nrm[v * 3 + 1] = g[1];
    nrm[v * 3 + 2] = g[2];
  }

  // --- faces: one quad per sign-changing grid edge, between the four cells sharing it
  const idx: number[] = [];
  const cell = (i: number, j: number, k: number) => (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz ? -1 : cellIndex[i + nx * (j + ny * k)]);
  const quad = (a: number, b: number, c: number, d: number) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    // Orient using the averaged vertex normals.
    const ux = pos[b * 3] - pos[a * 3];
    const uy = pos[b * 3 + 1] - pos[a * 3 + 1];
    const uz = pos[b * 3 + 2] - pos[a * 3 + 2];
    const wx = pos[c * 3] - pos[a * 3];
    const wy = pos[c * 3 + 1] - pos[a * 3 + 1];
    const wz = pos[c * 3 + 2] - pos[a * 3 + 2];
    const fx = uy * wz - uz * wy;
    const fy = uz * wx - ux * wz;
    const fz = ux * wy - uy * wx;
    const mx = nrm[a * 3] + nrm[b * 3] + nrm[c * 3] + nrm[d * 3];
    const my = nrm[a * 3 + 1] + nrm[b * 3 + 1] + nrm[c * 3 + 1] + nrm[d * 3 + 1];
    const mz = nrm[a * 3 + 2] + nrm[b * 3 + 2] + nrm[c * 3 + 2] + nrm[d * 3 + 2];
    if (fx * mx + fy * my + fz * mz >= 0) idx.push(a, b, c, a, c, d);
    else idx.push(a, c, b, a, d, c);
  };
  for (let k = 0; k < sz; k++) {
    for (let j = 0; j < sy; j++) {
      for (let i = 0; i < sx; i++) {
        const v0 = corner(i, j, k) < 0;
        if (i < nx && corner(i + 1, j, k) < 0 !== v0) quad(cell(i, j - 1, k - 1), cell(i, j, k - 1), cell(i, j, k), cell(i, j - 1, k));
        if (j < ny && corner(i, j + 1, k) < 0 !== v0) quad(cell(i - 1, j, k - 1), cell(i, j, k - 1), cell(i, j, k), cell(i - 1, j, k));
        if (k < nz && corner(i, j, k + 1) < 0 !== v0) quad(cell(i - 1, j - 1, k), cell(i, j - 1, k), cell(i, j, k), cell(i - 1, j, k));
      }
    }
  }

  // --- ambient occlusion (vertex colours) from the field along the normal
  const col = new Float32Array(vcount * 3);
  const aoStrength = o.ao ?? 1;
  for (let v = 0; v < vcount; v++) {
    let occ = 0;
    if (aoStrength > 0) {
      const x = pos[v * 3];
      const y = pos[v * 3 + 1];
      const z = pos[v * 3 + 2];
      let w = 1;
      for (let s = 1; s <= 3; s++) {
        const dist = s * 0.01;
        const d = f(x + nrm[v * 3] * dist, y + nrm[v * 3 + 1] * dist, z + nrm[v * 3 + 2] * dist);
        occ += (dist - d) * w;
        w *= 0.55;
      }
    }
    const ao = Math.max(0.35, Math.min(1, 1 - occ * 18 * aoStrength));
    if (shape.tint) {
      const t = shape.tint(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
      col[v * 3] = ao * t[0];
      col[v * 3 + 1] = ao * t[1];
      col[v * 3 + 2] = ao * t[2];
    } else col[v * 3] = col[v * 3 + 1] = col[v * 3 + 2] = ao;
  }

  // --- skin weights from the primitives nearest each vertex (no per-vertex allocation)
  const skinIndex = new Uint16Array(vcount * 4);
  const skinWeight = new Float32Array(vcount * 4);
  const falloff = o.weightFalloff ?? 0.018;
  const weighted = shape.prims.filter((p) => !p.subtract && !p.noWeight);
  const boneOf = weighted.map((p) => {
    const b = o.bones.get(p.bone);
    if (b === undefined) throw new Error(`Unknown bone ${p.bone}`);
    return b;
  });
  const ds = new Float64Array(weighted.length);
  const boneWeight = new Float64Array(o.bones.size);
  const touched: number[] = [];
  for (let v = 0; v < vcount; v++) {
    const x = pos[v * 3];
    const y = pos[v * 3 + 1];
    const z = pos[v * 3 + 2];
    let dmin = Infinity;
    for (let i = 0; i < weighted.length; i++) {
      const d = Math.max(0, weighted[i].dist(x, y, z));
      ds[i] = d;
      if (d < dmin) dmin = d;
    }
    touched.length = 0;
    for (let i = 0; i < weighted.length; i++) {
      const w = Math.exp(-(ds[i] - dmin) / falloff);
      if (w < 0.02) continue;
      const b = boneOf[i];
      if (boneWeight[b] === 0) touched.push(b);
      boneWeight[b] += w;
    }
    // Keep the four strongest bones.
    touched.sort((a, b) => boneWeight[b] - boneWeight[a]);
    const n = Math.min(4, touched.length);
    let sum = 0;
    for (let k = 0; k < n; k++) sum += boneWeight[touched[k]];
    for (let k = 0; k < n; k++) {
      skinIndex[v * 4 + k] = touched[k];
      skinWeight[v * 4 + k] = boneWeight[touched[k]] / (sum || 1);
    }
    for (const b of touched) boneWeight[b] = 0;
  }

  return { position: new Float32Array(pos), normal: nrm, color: col, skinIndex, skinWeight, index: new Uint32Array(idx) };
}
