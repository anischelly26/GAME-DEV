import { describe, expect, it } from 'vitest';
import { FEEL, SquashSpring, airPose, landingSquash, landingTier } from '../../src/player/feel';

/** Run the spring for `seconds` at 60 fps; returns the highest and lowest height seen. */
function run(spring: SquashSpring, seconds: number, dt = 1 / 60): { max: number; min: number } {
  let max = spring.height;
  let min = spring.height;
  for (let t = 0; t < seconds; t += dt) {
    spring.update(dt);
    max = Math.max(max, spring.height);
    min = Math.min(min, spring.height);
  }
  return { max, min };
}

describe('air poses', () => {
  it('rising, apex and falling always add up to the whole body', () => {
    for (let vy = -30; vy <= 15; vy += 0.25) {
      for (const t of [0, 0.3, 1]) {
        const p = airPose(vy, t);
        expect(p.rise + p.apex + p.fall).toBeCloseTo(1, 6);
        for (const w of [p.rise, p.apex, p.fall, p.flail]) {
          expect(w).toBeGreaterThanOrEqual(0);
          expect(w).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('reads the arc: rising after take-off, apex at the top, falling after', () => {
    expect(airPose(8, 0).rise).toBe(1);
    expect(airPose(0, 0).apex).toBe(1);
    expect(airPose(-6, 0.2).fall).toBe(1);
  });

  it('blends smoothly: no weight jumps more than 0.1 per 0.1 m/s', () => {
    let prev = airPose(10, 0);
    for (let vy = 9.9; vy >= -10; vy -= 0.1) {
      const p = airPose(vy, 0);
      expect(Math.abs(p.rise - prev.rise)).toBeLessThan(0.1);
      expect(Math.abs(p.fall - prev.fall)).toBeLessThan(0.1);
      prev = p;
    }
  });

  it('windmills only on a long, fast fall', () => {
    expect(airPose(-15, 0.1).flail).toBe(0); // fast but just started
    expect(airPose(-4, 2).flail).toBe(0); // long but slow (a drifting fall)
    expect(airPose(-15, 1.2).flail).toBe(1);
  });
});

describe('landings', () => {
  it('tiers by impact speed', () => {
    expect(landingTier(2)).toBe('none');
    expect(landingTier(5)).toBe('soft');
    expect(landingTier(10)).toBe('normal');
    expect(landingTier(14)).toBe('heavy');
  });

  it('squashes more for harder landings, never past the limit', () => {
    expect(landingSquash(2)).toBe(0);
    expect(landingSquash(6)).toBeGreaterThan(0);
    expect(landingSquash(12)).toBeGreaterThan(landingSquash(6));
    expect(landingSquash(40)).toBe(FEEL.squashMax);
  });
});

describe('squash and stretch spring', () => {
  it('a take-off kick peaks at the requested stretch, then settles', () => {
    const s = new SquashSpring();
    s.pop(FEEL.takeoffStretch);
    const { max } = run(s, 0.15);
    expect(max).toBeGreaterThan(1 + FEEL.takeoffStretch * 0.9);
    expect(max).toBeLessThan(1 + FEEL.takeoffStretch * 1.1);
    run(s, 0.6);
    expect(s.atRest).toBe(true);
  });

  it('overshoots once, a little (a toy, not jelly)', () => {
    const s = new SquashSpring();
    s.pop(-0.15);
    const first = run(s, 0.07);
    expect(first.min).toBeLessThan(0.87);
    const after = run(s, 0.2);
    // The rebound is under a third of the squash.
    expect(after.max - 1).toBeGreaterThan(0);
    expect(after.max - 1).toBeLessThan(0.05);
  });

  it('keeps her volume', () => {
    const s = new SquashSpring();
    s.pop(-0.2);
    for (let i = 0; i < 20; i++) {
      s.update(1 / 60);
      expect(s.height * s.width * s.width).toBeCloseTo(1, 6);
    }
  });

  it('never leaves the limits, however hard the kicks pile up', () => {
    const s = new SquashSpring();
    for (let i = 0; i < 5; i++) s.pop(-0.2);
    const a = run(s, 1);
    expect(a.min).toBeGreaterThanOrEqual(FEEL.minHeight - 1e-9);
    for (let i = 0; i < 5; i++) s.pop(0.2);
    const b = run(s, 1);
    expect(b.max).toBeLessThanOrEqual(FEEL.maxHeight + 1e-9);
  });

  it('is the same at 30 and 150 fps', () => {
    const a = new SquashSpring();
    const b = new SquashSpring();
    a.pop(-0.15);
    b.pop(-0.15);
    for (let i = 0; i < 3; i++) a.update(1 / 30);
    for (let i = 0; i < 15; i++) b.update(1 / 150);
    expect(Math.abs(a.height - b.height)).toBeLessThan(0.01);
  });
});
