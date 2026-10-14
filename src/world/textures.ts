import * as THREE from 'three';
import { mulberry32, smoothstep, clamp } from '../core/math';

/**
 * Procedurally generated, tileable textures. Everything is generated at load time from fixed seeds,
 * so there are no third-party texture assets to license and the result is identical on every machine.
 */

// ---------------------------------------------------------------- noise

function hash2(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** Value noise on a lattice that wraps every `period` cells, so it tiles. */
function valueNoise(x: number, y: number, period: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const x0 = mod(xi, period);
  const y0 = mod(yi, period);
  const x1 = mod(xi + 1, period);
  const y1 = mod(yi + 1, period);
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0, seed);
  const b = hash2(x1, y0, seed);
  const c = hash2(x0, y1, seed);
  const d = hash2(x1, y1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** Tileable fbm over u,v in [0,1). `freq` must be an integer. Returns roughly [0,1]. */
export function fbm(u: number, v: number, freq: number, octaves: number, seed: number): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let f = freq;
  for (let o = 0; o < octaves; o++) {
    sum += valueNoise(u * f, v * f, f, seed + o * 31) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}

// ---------------------------------------------------------------- canvas helpers

interface Field {
  size: number;
  albedo: Float32Array; // rgb 0..1
  height: Float32Array; // 0..1
}

function newField(size: number): Field {
  return { size, albedo: new Float32Array(size * size * 3), height: new Float32Array(size * size) };
}

function fieldToTextures(field: Field, normalStrength: number, repeat = 1): { map: THREE.CanvasTexture; normalMap: THREE.CanvasTexture } {
  const { size, albedo, height } = field;
  const colorCanvas = document.createElement('canvas');
  const normalCanvas = document.createElement('canvas');
  colorCanvas.width = colorCanvas.height = normalCanvas.width = normalCanvas.height = size;
  const cctx = colorCanvas.getContext('2d')!;
  const nctx = normalCanvas.getContext('2d')!;
  const cimg = cctx.createImageData(size, size);
  const nimg = nctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      cimg.data[i * 4] = clamp(albedo[i * 3] * 255, 0, 255);
      cimg.data[i * 4 + 1] = clamp(albedo[i * 3 + 1] * 255, 0, 255);
      cimg.data[i * 4 + 2] = clamp(albedo[i * 3 + 2] * 255, 0, 255);
      cimg.data[i * 4 + 3] = 255;
      const hl = height[y * size + mod(x - 1, size)];
      const hr = height[y * size + mod(x + 1, size)];
      const hu = height[mod(y - 1, size) * size + x]; // canvas row above = higher v
      const hd = height[mod(y + 1, size) * size + x];
      let nx = -(hr - hl) * normalStrength;
      let ny = -(hu - hd) * normalStrength;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len;
      ny /= len;
      nz /= len;
      nimg.data[i * 4] = (nx * 0.5 + 0.5) * 255;
      nimg.data[i * 4 + 1] = (ny * 0.5 + 0.5) * 255;
      nimg.data[i * 4 + 2] = (nz * 0.5 + 0.5) * 255;
      nimg.data[i * 4 + 3] = 255;
    }
  }
  cctx.putImageData(cimg, 0, 0);
  nctx.putImageData(nimg, 0, 0);
  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const normalMap = new THREE.CanvasTexture(normalCanvas);
  for (const t of [map, normalMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.anisotropy = 8;
    t.generateMipmaps = true;
  }
  return { map, normalMap };
}

// ---------------------------------------------------------------- masonry

interface MasonryOptions {
  size: number;
  rows: number;
  minWidth: number; // fraction of tile width
  maxWidth: number;
  mortar: number; // fraction of row height
  base: [number, number, number];
  variation: number;
  seed: number;
  mossiness?: number;
}

/**
 * Rounded, chipped ashlar: irregular block edges, per-block relief and tint, recessed damp mortar,
 * and faint vertical water streaks so walls read as weathered stone rather than tiles.
 */
function masonry(o: MasonryOptions): Field {
  const f = newField(o.size);
  const rng = mulberry32(o.seed);
  const rowH = 1 / o.rows;
  // Block boundaries per row, as cumulative u positions that wrap at 1.
  const rows: { edges: number[]; tints: number[][]; relief: number[]; offset: number }[] = [];
  for (let r = 0; r < o.rows; r++) {
    const edges: number[] = [0];
    let u = 0;
    while (u < 1) {
      const w = o.minWidth + rng() * (o.maxWidth - o.minWidth);
      u += w;
      if (u > 1 - o.minWidth * 0.6) u = 1;
      edges.push(u);
    }
    const tints = edges.map(() => {
      const t = 1 + (rng() - 0.5) * o.variation;
      const warm = (rng() - 0.5) * 0.1;
      const green = rng() < 0.3 ? rng() * 0.07 : 0;
      return [t + warm, t + green, t - warm * 0.4];
    });
    const relief = edges.map(() => 0.7 + rng() * 0.25);
    rows.push({ edges, tints, relief, offset: rng() });
  }
  const s = o.size;
  for (let y = 0; y < s; y++) {
    const v = y / s;
    const r = Math.min(o.rows - 1, Math.floor(v * o.rows));
    const row = rows[r];
    const vIn = (v - r * rowH) / rowH; // 0..1 within row
    for (let x = 0; x < s; x++) {
      const u0 = x / s;
      const u = (u0 + row.offset) % 1;
      let b = 0;
      while (b < row.edges.length - 2 && u >= row.edges[b + 1]) b++;
      const left = row.edges[b];
      const right = row.edges[b + 1];
      const dxu = Math.min(u - left, right - u) * o.rows; // in row-height units
      const dyu = Math.min(vIn, 1 - vIn);
      // Chipped, irregular arris: noise eats into the block edge.
      const chip = (fbm(u0, v, 24, 3, o.seed + 7) - 0.5) * 0.16;
      const edgeDist = Math.min(dxu, dyu) + chip;
      const bevel = smoothstep(o.mortar * 0.7, o.mortar + 0.09, edgeDist);
      const surface = fbm(u0, v, 6, 5, o.seed + 3);
      const fine = fbm(u0, v, 48, 2, o.seed + 11);
      const blockH = row.relief[b];
      const stoneH = blockH + (surface - 0.5) * 0.3 + (fine - 0.5) * 0.08;
      const mortarH = 0.18 + fine * 0.08;
      const i = y * s + x;
      f.height[i] = mortarH + (stoneH - mortarH) * bevel;
      const tint = row.tints[b];
      // Vertical water streaks running down the wall.
      const streak = smoothstep(0.55, 0.8, fbm(u0, v * 0.25, 16, 3, o.seed + 31)) * 0.18;
      const grime = fbm(u0, v, 4, 4, o.seed + 19);
      const moss = o.mossiness ? smoothstep(0.58, 0.78, grime) * o.mossiness : 0;
      const stoneShade = (0.8 + (surface - 0.5) * 0.4 + (fine - 0.5) * 0.12) * (0.88 + 0.12 * bevel) - streak;
      const mortarShade = 0.62 + (fine - 0.5) * 0.1 - streak * 0.5;
      const shade = mortarShade + (stoneShade - mortarShade) * bevel;
      const mossK = moss * (1.2 - bevel * 0.7);
      f.albedo[i * 3] = o.base[0] * (1 + (tint[0] - 1) * bevel) * shade * (1 - mossK * 0.3);
      f.albedo[i * 3 + 1] = o.base[1] * (1 + (tint[1] - 1) * bevel) * shade * (1 + mossK * 0.15);
      f.albedo[i * 3 + 2] = o.base[2] * (1 + (tint[2] - 1) * bevel) * shade * (1 - mossK * 0.25);
    }
  }
  return f;
}

// ---------------------------------------------------------------- metals and wood

function metal(size: number, base: [number, number, number], rust: [number, number, number], rustAmount: number, seed: number): Field {
  const f = newField(size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const n = fbm(u, v, 6, 5, seed);
      const streak = fbm(u * 0.25, v, 32, 2, seed + 5);
      const patch = smoothstep(0.5, 0.68, fbm(u, v, 3, 5, seed + 9)) * rustAmount;
      const shade = 0.8 + n * 0.35 + (streak - 0.5) * 0.15;
      const i = y * size + x;
      f.height[i] = n * 0.5 + patch * 0.4;
      for (let c = 0; c < 3; c++) f.albedo[i * 3 + c] = (base[c] * (1 - patch) + rust[c] * patch) * shade;
    }
  }
  return f;
}

function planks(size: number, seed: number): Field {
  const f = newField(size);
  const boards = 8;
  const rng = mulberry32(seed);
  const tints = Array.from({ length: boards }, () => 0.8 + rng() * 0.35);
  const offs = Array.from({ length: boards }, () => rng());
  for (let y = 0; y < size; y++) {
    const v = y / size;
    const b = Math.floor(v * boards);
    const inB = v * boards - b;
    const seam = smoothstep(0.0, 0.06, Math.min(inB, 1 - inB));
    for (let x = 0; x < size; x++) {
      const u = (x / size + offs[b]) % 1;
      const grain = fbm(u, v * 0.125, 2, 4, seed + b) * 0.6;
      const ring = 0.5 + 0.5 * Math.sin((v * boards * 6 + grain * 9) * Math.PI);
      const knot = smoothstep(0.82, 0.9, fbm(u, v, 6, 3, seed + 40));
      const shade = (0.7 + ring * 0.25 - knot * 0.35) * tints[b] * (0.4 + seam * 0.6);
      const i = y * size + x;
      f.height[i] = seam * (0.8 + ring * 0.1);
      f.albedo[i * 3] = 0.42 * shade;
      f.albedo[i * 3 + 1] = 0.29 * shade;
      f.albedo[i * 3 + 2] = 0.19 * shade;
    }
  }
  return f;
}

function fabric(size: number, base: [number, number, number], seed: number): Field {
  const f = newField(size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const weave = 0.5 + 0.25 * (Math.sin(u * size * 0.9) + Math.sin(v * size * 0.9));
      const n = fbm(u, v, 8, 4, seed);
      const i = y * size + x;
      f.height[i] = weave * 0.25 + n * 0.75;
      const shade = 0.86 + weave * 0.04 + (n - 0.5) * 0.2;
      for (let c = 0; c < 3; c++) f.albedo[i * 3 + c] = base[c] * shade;
    }
  }
  return f;
}

// ---------------------------------------------------------------- painted / drawn

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  draw(ctx);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** Erase pixels with noise so strokes look like chalk / worn paint. */
function distress(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number, seed: number): void {
  const img = ctx.getImageData(0, 0, w, h);
  const rng = mulberry32(seed);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const n = fbm(x / w, y / h, 24, 3, seed) * 0.7 + rng() * 0.3;
      img.data[i + 3] *= smoothstep(amount - 0.2, amount + 0.15, n);
    }
  }
  ctx.putImageData(img, 0, 0);
}

function wobblyLine(ctx: CanvasRenderingContext2D, pts: Array<[number, number]>, rng: () => number, jitter = 2.5): void {
  ctx.beginPath();
  pts.forEach(([x, y], i) => {
    const jx = x + (rng() - 0.5) * jitter;
    const jy = y + (rng() - 0.5) * jitter;
    if (i === 0) ctx.moveTo(jx, jy);
    else ctx.lineTo(jx, jy);
  });
  ctx.stroke();
}

/**
 * Scratched maintenance diagram by the hatch: two states of the same pipework.
 * Left: bypass OPEN, flow escapes through the vent, hatch shut. Right: bypass SHUT, flow drives the
 * piston, hatch raised. Meaning is carried by shapes and arrows, not colour.
 */
export function pressureDiagramTexture(): THREE.CanvasTexture {
  const W = 1024;
  const H = 768;
  return canvasTexture(W, H, (ctx) => {
    const rng = mulberry32(99);
    ctx.strokeStyle = 'rgba(232,228,214,0.95)';
    ctx.fillStyle = 'rgba(232,228,214,0.95)';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const panel = (ox: number, open: boolean) => {
      ctx.lineWidth = 9;
      // Supply pipe from the top, tee, vent branch down to a grate, piston branch to the right.
      wobblyLine(ctx, [[ox + 90, 120], [ox + 90, 300]], rng);
      wobblyLine(ctx, [[ox + 90, 300], [ox + 90, 470]], rng);
      wobblyLine(ctx, [[ox + 40, 500], [ox + 140, 500]], rng);
      for (let i = 0; i < 4; i++) wobblyLine(ctx, [[ox + 50 + i * 25, 500], [ox + 50 + i * 25, 520]], rng);
      wobblyLine(ctx, [[ox + 90, 300], [ox + 260, 300], [ox + 260, 360]], rng);
      // Piston barrel and hatch.
      wobblyLine(ctx, [[ox + 235, 360], [ox + 285, 360], [ox + 285, 520], [ox + 235, 520], [ox + 235, 360]], rng);
      const hatchTop = open ? 400 : 250;
      wobblyLine(ctx, [[ox + 310, hatchTop], [ox + 430, hatchTop], [ox + 430, hatchTop + 170], [ox + 310, hatchTop + 170], [ox + 310, hatchTop]], rng);
      wobblyLine(ctx, [[ox + 285, open ? 440 : 300], [ox + 310, open ? 440 : 300]], rng);
      // Valve: a circle with a bar; bar ALONG the pipe = open, ACROSS = shut.
      ctx.beginPath();
      ctx.arc(ox + 90, 385, 26, 0, Math.PI * 2);
      ctx.stroke();
      if (open) wobblyLine(ctx, [[ox + 90, 355], [ox + 90, 415]], rng);
      else wobblyLine(ctx, [[ox + 60, 385], [ox + 120, 385]], rng);
      ctx.lineWidth = 6;
      if (open) {
        // Flow escapes down through the vent: arrow + steam curls under the grate.
        wobblyLine(ctx, [[ox + 125, 330], [ox + 125, 440]], rng);
        wobblyLine(ctx, [[ox + 112, 420], [ox + 125, 445], [ox + 138, 420]], rng);
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.arc(ox + 60 + i * 35, 560, 14, Math.PI, 0);
          ctx.stroke();
        }
        // Hatch stays shut: a cross over it.
        wobblyLine(ctx, [[ox + 330, 420], [ox + 410, 550]], rng);
        wobblyLine(ctx, [[ox + 410, 420], [ox + 330, 550]], rng);
      } else {
        // Flow drives the piston: arrow along the branch, and the hatch rises.
        wobblyLine(ctx, [[ox + 130, 275], [ox + 225, 275]], rng);
        wobblyLine(ctx, [[ox + 205, 262], [ox + 228, 275], [ox + 205, 288]], rng);
        wobblyLine(ctx, [[ox + 455, 470], [ox + 455, 270]], rng);
        wobblyLine(ctx, [[ox + 440, 292], [ox + 455, 266], [ox + 470, 292]], rng);
      }
    };
    panel(30, true);
    panel(540, false);
    ctx.lineWidth = 5;
    wobblyLine(ctx, [[512, 120], [512, 600]], rng, 6);
    // A tick under the working state.
    ctx.lineWidth = 9;
    wobblyLine(ctx, [[760, 640], [790, 670], [850, 600]], rng);
    ctx.font = 'bold 54px "Segoe Print", "Bradley Hand", "Comic Sans MS", cursive';
    ctx.fillText('PRESSURE DOES THE LIFTING.', 40, 80);
    ctx.font = 'bold 46px "Segoe Print", "Bradley Hand", "Comic Sans MS", cursive';
    ctx.fillText('Give it somewhere to go.', 60, 735);
    ctx.font = 'bold 40px "Segoe Print", "Bradley Hand", "Comic Sans MS", cursive';
    ctx.fillText('- I.', 900, 735);
    distress(ctx, W, H, 0.38, 5);
  });
}

/** Pressure gauge dial: tick marks, LOW and LIFT words, and a hatched LIFT band. */
export function gaugeFaceTexture(liftFrom: number): THREE.CanvasTexture {
  const S = 512;
  return canvasTexture(S, S, (ctx) => {
    const c = S / 2;
    ctx.fillStyle = '#e8dfc8';
    ctx.beginPath();
    ctx.arc(c, c, c - 6, 0, Math.PI * 2);
    ctx.fill();
    const angle = (v: number) => gaugeAngle(v) - Math.PI / 2;
    // LIFT band hatching.
    ctx.save();
    ctx.beginPath();
    ctx.arc(c, c, c - 40, angle(liftFrom), angle(1));
    ctx.arc(c, c, c - 112, angle(1), angle(liftFrom), true);
    ctx.closePath();
    ctx.clip();
    ctx.strokeStyle = '#2a2420';
    ctx.lineWidth = 7;
    for (let i = -S; i < S; i += 22) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + S, S);
      ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = '#2a2420';
    for (let i = 0; i <= 20; i++) {
      const a = angle(i / 20);
      const major = i % 5 === 0;
      ctx.lineWidth = major ? 9 : 4;
      const r0 = c - 40;
      const r1 = c - (major ? 100 : 72);
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0);
      ctx.lineTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1);
      ctx.stroke();
    }
    ctx.fillStyle = '#2a2420';
    ctx.font = 'bold 54px "Arial Black", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('LOW', c - 112, c + 150);
    ctx.fillText('LIFT', c + 112, c + 150);
    ctx.font = 'bold 32px Arial, sans-serif';
    ctx.fillText('HATCH LINE', c, c + 70);
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(c, c, c - 8, 0, Math.PI * 2);
    ctx.stroke();
  });
}

/**
 * Needle angle (radians, clockwise from straight up) for a gauge value 0..1. Shared by the dial
 * texture and the needle mesh so they always agree.
 */
export function gaugeAngle(v: number): number {
  return (-2 / 3) * Math.PI + (4 / 3) * Math.PI * clamp(v, 0, 1);
}

/** Valve position plate: OPEN (bar along the pipe) vs SHUT (bar across). */
export function valvePlateTexture(): THREE.CanvasTexture {
  return canvasTexture(512, 256, (ctx) => {
    ctx.fillStyle = '#d9cfb6';
    ctx.fillRect(0, 0, 512, 256);
    ctx.strokeStyle = '#2a2420';
    ctx.lineWidth = 10;
    ctx.strokeRect(8, 8, 496, 240);
    ctx.fillStyle = '#2a2420';
    ctx.font = 'bold 50px "Arial Black", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('BYPASS', 256, 70);
    ctx.font = 'bold 40px Arial, sans-serif';
    ctx.fillText('OPEN', 120, 220);
    ctx.fillText('SHUT', 392, 220);
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(120, 95);
    ctx.lineTo(120, 175);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(352, 135);
    ctx.lineTo(432, 135);
    ctx.stroke();
  });
}

/** White salt crust and tide staining, used as wall decals. */
export function saltStainTexture(seed = 3): THREE.CanvasTexture {
  const W = 512;
  const H = 512;
  return canvasTexture(W, H, (ctx) => {
    const img = ctx.createImageData(W, H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const u = x / W;
        const v = y / H;
        const n = fbm(u, v, 6, 5, seed);
        const streak = fbm(u * 4 - Math.floor(u * 4), v, 8, 3, seed + 1);
        const edge = Math.min(u, 1 - u, v, 1 - v) * 4;
        const a = smoothstep(0.45, 0.75, n * 0.7 + streak * 0.5 - (1 - Math.min(1, edge)) * 0.6);
        const i = (y * W + x) * 4;
        img.data[i] = 225;
        img.data[i + 1] = 232;
        img.data[i + 2] = 226;
        img.data[i + 3] = a * 170;
      }
    }
    ctx.putImageData(img, 0, 0);
  });
}

/** Stencilled paint on metal or stone. */
export function paintedTextTexture(text: string, opts: { w?: number; h?: number; color?: string; bg?: string; font?: string; seed?: number } = {}): THREE.CanvasTexture {
  const w = opts.w ?? 512;
  const h = opts.h ?? 256;
  return canvasTexture(w, h, (ctx) => {
    if (opts.bg) {
      ctx.fillStyle = opts.bg;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.fillStyle = opts.color ?? 'rgba(225,214,190,0.95)';
    ctx.font = opts.font ?? `900 ${Math.floor(h * 0.62)}px "Arial Black", Impact, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2 + h * 0.04);
    distress(ctx, w, h, 0.3, opts.seed ?? 3);
  });
}

/** Soft radial gradient used for fake light pools, glows and particles. */
export function radialTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', size = 128): THREE.CanvasTexture {
  return canvasTexture(size, size, (ctx) => {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, inner);
    g.addColorStop(0.35, inner.replace(/[\d.]+\)$/, '0.45)'));
    g.addColorStop(1, outer);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  });
}

// ---------------------------------------------------------------- library

export interface TextureSet {
  map: THREE.Texture;
  normalMap: THREE.Texture;
}

export interface TextureLibrary {
  stone: TextureSet;
  floor: TextureSet;
  iron: TextureSet;
  brass: TextureSet;
  wood: TextureSet;
  wool: TextureSet;
  smock: TextureSet;
}

export function createTextureLibrary(): TextureLibrary {
  return {
    stone: fieldToTextures(
      masonry({ size: 1024, rows: 10, minWidth: 0.14, maxWidth: 0.3, mortar: 0.045, base: [0.6, 0.63, 0.6], variation: 0.3, seed: 11, mossiness: 0.7 }),
      2.6,
    ),
    floor: fieldToTextures(
      masonry({ size: 1024, rows: 4, minWidth: 0.2, maxWidth: 0.42, mortar: 0.035, base: [0.52, 0.52, 0.5], variation: 0.24, seed: 23, mossiness: 0.35 }),
      2.2,
    ),
    iron: fieldToTextures(metal(512, [0.24, 0.26, 0.28], [0.42, 0.22, 0.12], 0.55, 31), 3),
    brass: fieldToTextures(metal(512, [0.78, 0.6, 0.34], [0.3, 0.58, 0.5], 0.45, 41), 2),
    wood: fieldToTextures(planks(512, 51), 3),
    wool: fieldToTextures(fabric(256, [0.5, 0.56, 0.62], 61), 2),
    smock: fieldToTextures(fabric(256, [0.9, 0.9, 0.9], 71), 0.8),
  };
}
