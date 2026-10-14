import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Physics, RAPIER, PLAYER_GROUPS } from '../../src/physics/Physics';
import { TraversalSurfaces, findLedge, findVault, TRAVERSAL } from '../../src/player/Traversal';

/**
 * Eligibility rules for ledge catches and vaults, against a real Rapier world (no browser).
 * Course: flat floor; a 2.0 m wall-top platform at z = -2 (its face at z = -2); a 0.84 m rail at x = 5.
 */
let physics: Physics;
let player: RAPIER.Collider;
let surfaces: TraversalSurfaces;
let ledgeCollider: RAPIER.Collider;
let plainWall: RAPIER.Collider;

beforeAll(async () => {
  physics = await Physics.create();
  physics.box(new THREE.Vector3(0, -0.25, 0), new THREE.Vector3(30, 0.25, 30)); // floor
  ledgeCollider = physics.box(new THREE.Vector3(0, 1.0, -3), new THREE.Vector3(1.5, 1.0, 1.0)); // top at 2.0, face at z=-2
  plainWall = physics.box(new THREE.Vector3(-6, 1.0, -3), new THREE.Vector3(1.5, 1.0, 1.0)); // same, not registered
  const rail = physics.box(new THREE.Vector3(5, 0.42, 0), new THREE.Vector3(0.13, 0.42, 1.5)); // 0.84 tall, 0.26 deep
  const tall = physics.box(new THREE.Vector3(5, 0.7, 6), new THREE.Vector3(0.13, 0.7, 1.5)); // 1.4 tall: too high to vault
  surfaces = new TraversalSurfaces();
  surfaces.markClimbable(ledgeCollider);
  surfaces.markVaultable(rail);
  surfaces.markVaultable(tall);
  const body = physics.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 50, 0));
  player = physics.world.createCollider(RAPIER.ColliderDesc.capsule(0.45, 0.3).setCollisionGroups(PLAYER_GROUPS), body);
  physics.step();
});

const toward = new THREE.Vector3(0, 0, -1);

describe('ledge catch', () => {
  it('catches a registered ledge within reach while airborne', () => {
    const ledge = findLedge(physics, surfaces, new THREE.Vector3(0, 0.6, -1.5), toward, player);
    expect(ledge).not.toBeNull();
    expect(ledge!.topY).toBeCloseTo(2.0, 1);
    expect(ledge!.standFeet.z).toBeLessThan(-2);
    expect(ledge!.hangFeet.z).toBeGreaterThan(-2);
  });

  it('ignores walls that the level has not registered as climbable', () => {
    expect(findLedge(physics, surfaces, new THREE.Vector3(-6, 0.6, -1.5), toward, player)).toBeNull();
  });

  it('needs intent toward the wall', () => {
    expect(findLedge(physics, surfaces, new THREE.Vector3(0, 0.6, -1.5), new THREE.Vector3(0, 0, 1), player)).toBeNull();
  });

  it('respects the documented reach range', () => {
    // Feet on the floor: the top is 2.0 m above, inside the range.
    expect(findLedge(physics, surfaces, new THREE.Vector3(0, 0, -1.5), toward, player)).not.toBeNull();
    // Feet far below: out of reach.
    expect(findLedge(physics, surfaces, new THREE.Vector3(0, 2.0 - TRAVERSAL.ledgeMax - 0.5, -1.5), toward, player)).toBeNull();
  });

  it('does not catch from too far away', () => {
    expect(findLedge(physics, surfaces, new THREE.Vector3(0, 0.6, 0), toward, player)).toBeNull();
  });
});

describe('vault', () => {
  const east = new THREE.Vector3(1, 0, 0);
  it('vaults a low registered rail with room beyond', () => {
    const v = findVault(physics, surfaces, new THREE.Vector3(4.3, 0, 0), east, player);
    expect(v).not.toBeNull();
    expect(v!.to.x).toBeGreaterThan(5.13);
    expect(v!.apex.y).toBeGreaterThan(0.84);
  });

  it('refuses obstacles taller than the vault range', () => {
    expect(findVault(physics, surfaces, new THREE.Vector3(4.3, 0, 6), east, player)).toBeNull();
  });

  it('refuses when not facing the rail', () => {
    expect(findVault(physics, surfaces, new THREE.Vector3(4.3, 0, 0), new THREE.Vector3(-1, 0, 0), player)).toBeNull();
  });

  it('ignores the plain wall', () => {
    expect(plainWall.handle).toBeDefined();
    expect(findVault(physics, surfaces, new THREE.Vector3(-6, 0, -1.5), toward, player)).toBeNull();
  });
});
