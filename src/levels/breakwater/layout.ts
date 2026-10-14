/**
 * Shared dimensions for the Breakwater cell block slice. Kept free of three.js so unit tests can
 * validate the layout against the movement controller's measured capabilities.
 *
 * Plan view (z grows toward the open sea behind Mara's cell):
 *
 *   z 32.0  ---------------- ocean slit ----------------
 *           |            MARA'S CELL (4.6 x 5.0)        |
 *   z 27.0  ======== hatch wall (pressure hatch) =======
 *           |  maintenance landing   (checkpoint 1)     |
 *           |  fallen girder: practice jump (safe)      |
 *   z 22.6  ~~~~~~~~~~~~ drainage channel ~~~~~~~~~~~~~~  2.0 m gap, water 3.4 m below
 *   z 20.6  |  far landing (lit)                        |
 *   z 18.5  ====== breach in the turbine hall shell =====
 *           |  LOOKOUT (ruined tier-2 cell)  checkpoint 2|
 *   z 12.9  ---- open front: view over the turbine hall --
 *                       (hall centre at the origin)
 */

export const DEG = Math.PI / 180;

/** Turbine hall: an 18-sided ring of cell tiers around the tide engine column. */
export const HALL = {
  sides: 18,
  /** Inner edge of the gallery walkways (apothem). */
  aIn: 9.0,
  /** Inner face of the cell facade (apothem). */
  aWall: 12.4,
  wallT: 0.5,
  /** Depth of the dark recess behind each cell opening. */
  recess: 2.2,
  /** Outer shell of the hall. */
  aShell: 18.5,
  tierY: [0, 4.6, 9.2],
  tierH: 4.6,
  floorT: 0.45,
  cellOpeningW: 2.6,
  cellOpeningH: 2.8,
  waterY: -10,
  roofY: 13.8,
  columnR: 3.0,
  oculusR: 6.8,
};

export const sideAngle = (k: number): number => (k * 2 * Math.PI) / HALL.sides;
export const halfSide = (apothem: number): number => apothem * Math.tan(Math.PI / HALL.sides);

/** Point on side `k` at apothem `a`, tangent offset `u`. Returns [x, z]. */
export function sidePoint(k: number, a: number, u: number): [number, number] {
  const th = sideAngle(k);
  return [Math.sin(th) * a + Math.cos(th) * u, Math.cos(th) * a - Math.sin(th) * u];
}

/** Point at fraction `f` (0..1) along side `k` at apothem `a`. */
export function sideFraction(k: number, a: number, f: number): [number, number] {
  const L = halfSide(a);
  return sidePoint(k, a, -L + 2 * L * f);
}

/** Mara's cell (interior bounds). The hatch wall's inner face is at z0. */
export const CELL = { x0: -2.3, x1: 2.3, z0: 27.0, z1: 32.0, y: 4.6, h: 4.4, wallT: 0.5 };

/** Maintenance shaft between the cell and the turbine hall. */
export const SHAFT = {
  x0: -3.6,
  x1: 3.6,
  /** Turbine-hall side (the breach) and cell side (the hatch wall's outer face). */
  z0: 18.5,
  z1: 26.5,
  floorY: 4.6,
  /** Drainage channel across the shaft: the jump gap. */
  gapNear: 22.6,
  gapFar: 20.6,
  channelBottom: 0.2,
  waterY: 1.2,
  topY: 13.5,
  /** Fallen girder used as the safe practice jump. */
  girder: { z: 24.7, depth: 0.42, height: 0.6 },
};

/** Ruined tier-2 cell used as the sheltered lookout over the turbine hall (side k = 0). */
export const LOOKOUT = { x0: -2.1, x1: 2.1, z0: HALL.aWall + HALL.wallT, z1: 17.4, y: 4.6, h: 3.4 };

export const GAP_WIDTH = SHAFT.gapNear - SHAFT.gapFar;

/** Below this height the player is falling into the drainage channel: recover at the checkpoint. */
export const RECOVER_Y = 2.6;
/** Fade starts here so the recovery reads as a quick cut, not a pop. */
export const FALL_FADE_Y = 3.8;

/** Spawn and checkpoint positions (feet) and facings (yaw; 0 faces +Z, PI faces -Z). */
export const SPAWNS = {
  cell: { x: -0.35, y: CELL.y, z: 29.7, facing: Math.PI },
  landing: { x: 1.05, y: SHAFT.floorY, z: 25.6, facing: Math.PI },
  lookout: { x: 0.2, y: LOOKOUT.y, z: 15.6, facing: Math.PI },
};

/** Where the harbour beacon stands, far across the water, seen through the hall's breach. */
export const BEACON = { x: -120, y: 0, z: -300, height: 46 };
/** Sides of the hall whose upper tiers and roof have collapsed outward. */
export const BREACH_SIDES = [10, 11];
