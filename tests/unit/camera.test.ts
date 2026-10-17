import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ThirdPersonCamera, type CameraContext } from '../../src/camera/ThirdPersonCamera';
import type { Physics } from '../../src/physics/Physics';

/** An unobstructed world: the camera's collision probe never hits anything. */
const openWorld = { sphereCastDistance: () => 100 } as unknown as Physics;
const noLook = { yaw: 0, pitch: 0 };
const running: CameraContext = { grounded: true, speed: 4, mode: 'move', interacting: false, forwardInput: 1 };

function settled(physics: Physics = openWorld): { camera: ThirdPersonCamera; feet: THREE.Vector3 } {
  const camera = new ThirdPersonCamera(physics, null as never);
  const feet = new THREE.Vector3();
  // Two seconds standing still without touching the mouse.
  for (let i = 0; i < 120; i++) camera.update(1 / 60, noLook, feet, { ...running, speed: 0, forwardInput: 0 });
  return { camera, feet };
}

/** Run sideways (across the camera's view) for `frames` steps with the given context. */
function runSideways(camera: ThirdPersonCamera, feet: THREE.Vector3, frames: number, ctx: (i: number) => CameraContext): number {
  const before = camera.yaw;
  for (let i = 1; i <= frames; i++) {
    feet.x += 4 / 60;
    camera.update(1 / 60, noLook, feet, ctx(i));
  }
  return camera.yaw - before;
}

describe('camera assist (auto-chase)', () => {
  it('never turns the camera while the player is airborne', () => {
    const { camera, feet } = settled();
    // Half a second of sideways flight at 4 m/s (review 492bce4 R3 fixture).
    expect(runSideways(camera, feet, 30, () => ({ ...running, grounded: false }))).toBe(0);
  });

  it('still drifts behind the direction of travel on the ground', () => {
    const { camera, feet } = settled();
    expect(Math.abs(runSideways(camera, feet, 150, () => running))).toBeGreaterThan(0.1);
  });

  it('does not turn in the first moments after landing', () => {
    const { camera, feet } = settled();
    // A short hop, then a quarter of a second running on after landing.
    expect(runSideways(camera, feet, 35, (i) => ({ ...running, grounded: i > 20 }))).toBe(0);
  });

  it('never turns while hanging, climbing or vaulting, or during an interaction', () => {
    for (const ctx of [
      { ...running, mode: 'hang' },
      { ...running, mode: 'climb' },
      { ...running, mode: 'vault' },
      { ...running, interacting: true },
    ]) {
      const { camera, feet } = settled();
      expect(runSideways(camera, feet, 150, () => ctx), JSON.stringify(ctx)).toBe(0);
    }
  });

  it('only follows when the stick is pushed forward', () => {
    for (const forwardInput of [0, 0.3, -1]) {
      const { camera, feet } = settled();
      expect(runSideways(camera, feet, 150, () => ({ ...running, forwardInput }))).toBe(0);
    }
  });

  it('is off with assist Off, inside precision volumes, and right after the player turns the camera', () => {
    let { camera, feet } = settled();
    camera.settings.assist = 'off';
    expect(runSideways(camera, feet, 150, () => running)).toBe(0);

    ({ camera, feet } = settled());
    camera.precision.push(() => true);
    expect(runSideways(camera, feet, 150, () => running)).toBe(0);

    ({ camera, feet } = settled());
    camera.update(1 / 60, { yaw: 0.01, pitch: 0 }, feet, running);
    // Weak waits 1.5 s after the last look input.
    expect(runSideways(camera, feet, 80, () => running)).toBe(0);
  });

  it('Strong follows sooner and faster than Weak', () => {
    const turn = (assist: 'weak' | 'strong') => {
      const { camera, feet } = settled();
      camera.settings.assist = assist;
      return Math.abs(runSideways(camera, feet, 30, () => running));
    };
    expect(turn('strong')).toBeGreaterThan(turn('weak') * 1.5);
  });

  it('look input always applies immediately and exactly', () => {
    const { camera, feet } = settled();
    const before = camera.yaw;
    camera.update(1 / 60, { yaw: 0.3, pitch: 0 }, feet, running);
    expect(camera.yaw).toBeCloseTo(before - 0.3, 6);
  });
});

describe('camera spring arm', () => {
  it('never extends past an obstacle, and eases back out once it clears', () => {
    let free = 100;
    const world = { sphereCastDistance: () => free } as unknown as Physics;
    const { camera, feet } = settled(world);
    expect(camera.distance).toBeCloseTo(4.9, 1);
    // A wall 1.5 m behind the pivot: the arm is inside it on the very same frame.
    free = 1.5;
    camera.update(1 / 60, noLook, feet, running);
    expect(camera.distance).toBeLessThanOrEqual(1.5);
    // The wall goes away: no jump back, a smooth return.
    free = 100;
    camera.update(1 / 60, noLook, feet, running);
    expect(camera.distance).toBeLessThan(1.8);
    for (let i = 0; i < 120; i++) camera.update(1 / 60, noLook, feet, running);
    expect(camera.distance).toBeGreaterThan(4.8);
  });
});

describe('camera framing', () => {
  it('aims above the pivot so Mara sits in the lower half of the frame', () => {
    const { camera, feet } = settled();
    camera.camera.updateMatrixWorld(true);
    const chest = new THREE.Vector3(feet.x, feet.y + 1.0, feet.z).project(camera.camera);
    expect(chest.y).toBeLessThan(-0.05);
  });
});

describe('camera framing in the air and in each mode (MOVEMENT_2_0 B5)', () => {
  /** Two cameras over the same flight: one told the vertical speed, one not. Returns the gap in
   * view direction (radians, + = the told camera looks further down) at every frame. */
  function flight(vys: number[]): number[] {
    const a = settled();
    const b = settled();
    const feet = new THREE.Vector3();
    const da = new THREE.Vector3();
    const db = new THREE.Vector3();
    return vys.map((vy) => {
      feet.y += vy / 60;
      const ctx: CameraContext = { grounded: false, speed: 0, mode: 'move', interacting: false, forwardInput: 0 };
      a.camera.update(1 / 60, noLook, feet, { ...ctx, verticalSpeed: vy });
      b.camera.update(1 / 60, noLook, feet, ctx);
      a.camera.camera.getWorldDirection(da);
      b.camera.camera.getWorldDirection(db);
      return Math.asin(db.y) - Math.asin(da.y);
    });
  }
  /** Vertical speed each frame of a fall from rest: gravity 26 m/s² x 1.35, capped at 26 m/s. */
  const fall = (seconds: number, v0 = 0) => Array.from({ length: Math.round(seconds * 60) }, (_, i) => Math.max(-26, v0 - 35.1 * (i / 60)));

  it('an ordinary jump never moves the aim', () => {
    // Up at 8.7 m/s (a 1.45 m jump), then back down to the take-off height.
    const vys: number[] = [];
    for (let v = 8.7; v > 0; v -= 26 / 60) vys.push(v);
    vys.push(...fall(0.29));
    const gaps = flight(vys);
    expect(Math.max(...gaps.map(Math.abs))).toBeLessThan(1e-6);
  });

  it('a long fall looks down toward the landing', () => {
    const gaps = flight(fall(1.0));
    // About 0.2 rad (11 degrees) further down by the end of a one-second fall (measured 0.199).
    expect(gaps[gaps.length - 1]).toBeGreaterThan(0.15);
    // And it eases in: no frame turns the view by more than 0.02 rad.
    for (let i = 1; i < gaps.length; i++) expect(Math.abs(gaps[i] - gaps[i - 1])).toBeLessThan(0.02);
  });

  it('swimming frames closer and lower; the swing and the slide stand back', () => {
    const frame = (mode: string, ridePose?: string) => {
      const { camera, feet } = settled();
      for (let i = 0; i < 240; i++) camera.update(1 / 60, noLook, feet, { grounded: true, speed: 0, mode, interacting: false, forwardInput: 0, ridePose });
      return { dist: camera.distance, height: camera.camera.position.y - feet.y };
    };
    const walk = frame('move');
    const swim = frame('swim');
    const swing = frame('ride', 'swing');
    const slide = frame('ride', 'slide');
    const ladder = frame('ride', 'ladder');
    expect(swim.dist).toBeLessThan(walk.dist - 0.4);
    expect(swim.height).toBeLessThan(walk.height - 0.5);
    expect(swing.dist).toBeGreaterThan(walk.dist + 1);
    expect(slide.dist).toBeGreaterThan(walk.dist + 0.5);
    // A ladder keeps the ordinary framing.
    expect(Math.abs(ladder.dist - walk.dist)).toBeLessThan(0.01);
  });
});
