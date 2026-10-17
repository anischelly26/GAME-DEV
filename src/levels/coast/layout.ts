import * as THREE from 'three';

/**
 * Chapter Three, the Low Tide: the water between the hangar spur and Knoll Rock (metres; sea level
 * is y 0 at low tide; +z north toward the lighthouse).
 *
 *   z -16..2    the hangar's slipway (Mara starts at its top) and the spur's rocks
 *   z 8..18     the first sandbar, dry at low tide: a place to stand after the first swim
 *   z 26        the skiff, moored to a buoy
 *   z 30..62    open water and rocks: learning the skiff
 *   z 66..72    the bar across the lagoon's mouth (between the rock arms): 0.3 m deep at low
 *               water, too shallow for the skiff; Breakwater's engine sends a surge over it
 *   z 70..130   Knoll Rock's lagoon, the patrol boat circling the lighthouse
 */
export const C = {
  /** The surge: every `period` s the sea rises by `height` m and falls again over `length` s. */
  surge: { period: 9, length: 3.6, height: 0.85 },
  bedDeep: -2.6,
  slipway: { x0: -5, x1: 5, z0: -16, z1: -3, top: 0.9 },
  skiffAt: new THREE.Vector3(8, 0, 26),
  /** The lagoon: centred on the lighthouse; its rock arms leave a mouth on the south side. */
  light: new THREE.Vector3(24, 0, 100),
  lagoonR: 31,
  mouth: { x0: 15, x1: 33, z: 69, half: 3.4, depth: 0.3 },
  /** The patrol's ring round the lighthouse. */
  patrolR: 19,
  /** Where the play area's water mesh ends (the open sea beyond is the plain sea shader). */
  area: { x0: -70, x1: 110, z0: -40, z1: 150 },
};

/** Smooth bump: 1 at the centre, 0 beyond `r`. */
function bump(x: number, z: number, cx: number, cz: number, rx: number, rz: number): number {
  const d = ((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2;
  return d >= 1 ? 0 : (1 - d) * (1 - d);
}

/** The sea bed's height under (x, z), relative to low-water sea level. */
export function seabed(x: number, z: number): number {
  let y = C.bedDeep;
  // Up the slipway's foot and the spur's shallows.
  y = Math.max(y, -0.4 - Math.max(0, z + 3) * 0.32 - Math.max(0, Math.abs(x) - 8) * 0.25);
  // The first sandbar (dry), and a few more humps across the water.
  y = Math.max(y, C.bedDeep + 2.95 * bump(x, z, 1, 13, 15, 5.5));
  y = Math.max(y, C.bedDeep + 2.9 * bump(x, z, -24, 42, 9, 6));
  y = Math.max(y, C.bedDeep + 2.85 * bump(x, z, 34, 46, 7, 5));
  y = Math.max(y, C.bedDeep + 2.2 * bump(x, z, 6, 52, 6, 4));
  // The bar across the lagoon's mouth: shallow, never dry, flat on top (wider than the bed's
  // 2 m grid, so the grid cannot miss its crest).
  const M = C.mouth;
  if (x > M.x0 - 6 && x < M.x1 + 6) {
    const a = Math.min(1, Math.max(0, (M.half - Math.abs(z - M.z)) / 1.6));
    const across = a * a * (3 - 2 * a);
    const along = Math.min(1, Math.max(0, Math.min(x - (M.x0 - 6), M.x1 + 6 - x) / 6));
    y = Math.max(y, C.bedDeep + (C.bedDeep * -1 - M.depth) * across * along);
  }
  // A gravel shelf rising round Knoll Rock.
  const dl = Math.hypot(x - C.light.x, z - C.light.z);
  if (dl < 16) y = Math.max(y, -2.0 + (1 - dl / 16) * 0.6);
  // Small ripples in the sand.
  return y + Math.sin(x * 0.9) * Math.sin(z * 0.7) * 0.04;
}

/** The surge's rise (0..1) at time `t`: a smooth swell, then calm. */
export function surgeAt(t: number): number {
  const p = ((t % C.surge.period) + C.surge.period) % C.surge.period;
  if (p > C.surge.length) return 0;
  const s = Math.sin((Math.PI * p) / C.surge.length);
  return s * s;
}
