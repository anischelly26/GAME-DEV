import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ThirdPersonCamera } from '../../src/camera/ThirdPersonCamera';
import type { Physics } from '../../src/physics/Physics';

/** An unobstructed world: the camera's collision probe never hits anything. */
const openWorld = { sphereCastDistance: () => 100 } as unknown as Physics;
const noLook = { yaw: 0, pitch: 0 };

function settled(): { camera: ThirdPersonCamera; feet: THREE.Vector3 } {
  const camera = new ThirdPersonCamera(openWorld, null as never);
  const feet = new THREE.Vector3();
  // Two seconds standing still without touching the mouse.
  for (let i = 0; i < 120; i++) camera.update(1 / 60, noLook, feet, true, 0);
  return { camera, feet };
}

describe('camera lazy follow', () => {
  it('never turns the camera while the player is airborne', () => {
    const { camera, feet } = settled();
    const before = camera.yaw;
    // Half a second of sideways flight at 4 m/s (review 492bce4 R3 fixture).
    for (let i = 1; i <= 30; i++) {
      feet.set((i * 4) / 60, Math.sin((i * Math.PI) / 30), 0);
      camera.update(1 / 60, noLook, feet, false, 4);
    }
    expect(camera.yaw).toBe(before);
  });

  it('still drifts behind the direction of travel on the ground', () => {
    const { camera, feet } = settled();
    const before = camera.yaw;
    for (let i = 1; i <= 120; i++) {
      feet.set((i * 4) / 60, 0, 0);
      camera.update(1 / 60, noLook, feet, true, 4);
    }
    expect(Math.abs(camera.yaw - before)).toBeGreaterThan(0.1);
  });

  it('does not turn in the first moments after landing', () => {
    const { camera, feet } = settled();
    const before = camera.yaw;
    // A short hop, then a quarter of a second running on after landing.
    for (let i = 1; i <= 35; i++) {
      feet.set((i * 4) / 60, 0, 0);
      camera.update(1 / 60, noLook, feet, i > 20, 4);
    }
    expect(camera.yaw).toBe(before);
  });
});
