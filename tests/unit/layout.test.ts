import { describe, expect, it } from 'vitest';
import { MOVEMENT, PLAYER_CENTER_OFFSET } from '../../src/player/PlayerController';
import { CELL, GAP_WIDTH, HALL, LOOKOUT, RECOVER_Y, SHAFT, SPAWNS, halfSide, sideFraction } from '../../src/levels/breakwater/layout';
import { OPENING, HATCH_LIFT } from '../../src/world/props/PressureHatch';

/**
 * Ballistic estimate of the controller's jump with the tuning constants. The e2e jump measurement
 * checks the real (physics) value; this keeps level dimensions honest at review time.
 */
function runningJumpDistance(): { distance: number; apex: number } {
  const v0 = Math.sqrt(2 * MOVEMENT.gravity * MOVEMENT.jumpHeight);
  const tUp = v0 / MOVEMENT.gravity;
  const tDown = Math.sqrt((2 * MOVEMENT.jumpHeight) / (MOVEMENT.gravity * MOVEMENT.fallGravityMul));
  return { distance: MOVEMENT.maxSpeed * (tUp + tDown), apex: MOVEMENT.jumpHeight };
}

describe('layout vs. movement capabilities', () => {
  const capsuleHeight = PLAYER_CENTER_OFFSET * 2;

  it('the required drainage gap is well inside running jump range', () => {
    const { distance } = runningJumpDistance();
    // Generous margin on the critical path: the gap is at most 60% of the theoretical max.
    expect(GAP_WIDTH).toBeLessThanOrEqual(distance * 0.6);
    expect(GAP_WIDTH).toBeGreaterThanOrEqual(1.5); // still reads as a real gap
  });

  it('the practice girder needs a jump but is easy to clear', () => {
    expect(SHAFT.girder.height).toBeGreaterThan(0.35); // above autostep: a real jump
    expect(SHAFT.girder.height).toBeLessThan(MOVEMENT.jumpHeight * 0.6);
  });

  it('the hatch, once raised, clears the player capsule', () => {
    expect(OPENING.height).toBeGreaterThan(capsuleHeight + 0.2);
    expect(HATCH_LIFT).toBeGreaterThanOrEqual(OPENING.height - 0.01);
    expect(OPENING.x1 - OPENING.x0).toBeGreaterThan(MOVEMENT.capsuleRadius * 2 + 0.5);
  });

  it('rooms have head room for the jump and the camera', () => {
    expect(CELL.h).toBeGreaterThan(capsuleHeight + MOVEMENT.jumpHeight + 0.5);
    expect(LOOKOUT.h).toBeGreaterThan(capsuleHeight + MOVEMENT.jumpHeight);
    expect(SHAFT.topY - SHAFT.floorY).toBeGreaterThan(capsuleHeight + MOVEMENT.jumpHeight + 2);
  });

  it('spawns sit inside their rooms', () => {
    expect(SPAWNS.cell.z).toBeGreaterThan(CELL.z0 + 1);
    expect(SPAWNS.cell.z).toBeLessThan(CELL.z1 - 1);
    expect(SPAWNS.landing.z).toBeGreaterThan(SHAFT.girder.z + 0.5);
    expect(SPAWNS.landing.z).toBeLessThan(SHAFT.z1);
    expect(SPAWNS.lookout.z).toBeGreaterThan(LOOKOUT.z0);
    expect(SPAWNS.lookout.z).toBeLessThan(LOOKOUT.z1);
  });

  it('falling into the channel triggers recovery above the water', () => {
    expect(RECOVER_Y).toBeGreaterThan(SHAFT.waterY);
    expect(RECOVER_Y).toBeLessThan(SHAFT.floorY - 1);
  });

  it('hall side geometry is consistent', () => {
    const [x0, z0] = sideFraction(0, HALL.aWall, 0);
    const [x1, z1] = sideFraction(0, HALL.aWall, 1);
    expect(Math.hypot(x1 - x0, z1 - z0)).toBeCloseTo(2 * halfSide(HALL.aWall), 5);
    expect(z0).toBeCloseTo(HALL.aWall, 5);
  });
});
