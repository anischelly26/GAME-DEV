import * as THREE from 'three';

/**
 * Chapter Two, the Warders' Green: dimensions in one place (metres; +z north toward the hangar, +x
 * east toward the low sun; the village stands at y = 0).
 *
 *   z -50..-27  the shingle cove where Mara wakes (beach down to the sea at y -3.2)
 *   z -27       the cove wall: a 1.7 m ledge Mara catches and climbs, up to the lane
 *   z -27..6    Cottage Lane: three cottages each side, front gardens behind hedges; a Watch on a
 *               rail down the middle
 *   z 6..22     the green: an old oak, benches, the drinking fountain
 *   z 22..40    the sunken playground (floor y -2.4), entered down the slide; a second Watch on a
 *               rail round its rim; the swings by the sea wall
 *   z 40..41.5  the sea wall, 3.8 m high; a fallen section over the playground is 2.4 m high
 *               (4.8 m above the playground floor), reachable only by leaping off the swing
 *   z 41.5..62  the hangar yard; the causeway gate at its far end (chapter end)
 */
export const G = {
  seaY: -3.2,
  /** Below this, Mara has gone into the sea (recover at the checkpoint). */
  recoverY: -3.0,
  land: { x0: -20, x1: 20 },
  cove: { z0: -50, z1: -27, x0: -13, x1: 13, landingY: -1.7, landingZ0: -31 },
  lane: { x: 2.2, z0: -27, z1: 6 },
  cottage: { x0: 5.5, depth: 6.4, width: 7.2, eaves: 3.1, zs: [-19.5, -10.3, -1.1] },
  green: { z0: 6, z1: 22 },
  bowl: { x0: -9, x1: 9, z0: 22, z1: 40, floorY: -2.4 },
  /** The fallen section's top is 4.8 m above the playground floor: past a double jump and a ledge
   * catch (2.5 + 2.2 m), within a leap off a well-pumped swing. */
  wall: { z0: 40, z1: 41.5, top: 3.8, lowTop: 2.4, lowX: 2.2 },
  yard: { z1: 62, x0: -16, x1: 16 },
  /** The slide: model scale, and the platform's back edge (world z) at the bowl's south wall. */
  slide: { scale: 1.6, backZ: 23.0 },
  /** The working swing: its crossbar (world), chain length. */
  swing: { x: 0, z: 36.2, barY: 0.95, chain: 2.55 },
  /** Watch rails: the lane (a line it runs up and down), the rim (a U round the playground). */
  laneRail: [new THREE.Vector3(0, 0, -21), new THREE.Vector3(0, 0, 3.5)],
  rimRail: [new THREE.Vector3(-10.7, 0, 38.6), new THREE.Vector3(-10.7, 0, 20.7), new THREE.Vector3(10.7, 0, 20.7), new THREE.Vector3(10.7, 0, 38.6)],
};

/** Walkable ground height under (x, z), or null over the sea. Used for grass and props. */
export function groundY(x: number, z: number): number | null {
  if (x < G.land.x0 || x > G.land.x1) {
    return null;
  }
  if (z < G.cove.z1) {
    if (x < G.cove.x0 || x > G.cove.x1) return null;
    if (z > G.cove.landingZ0) return G.cove.landingY;
    // The beach falls from the landing to the sea.
    const t = (G.cove.landingZ0 - z) / (G.cove.landingZ0 - G.cove.z0);
    return G.cove.landingY + (G.seaY - 0.4 - G.cove.landingY) * t;
  }
  if (z > G.bowl.z0 && z < G.bowl.z1 && x > G.bowl.x0 && x < G.bowl.x1) return G.bowl.floorY;
  if (z >= G.wall.z0 && z <= G.wall.z1) return null;
  if (z > G.yard.z1 + 4) return null;
  return 0;
}
