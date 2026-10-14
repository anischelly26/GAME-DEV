import { describe, expect, it } from 'vitest';
import { PressureHatchLogic, LIFT_THRESHOLD, LIFT_TIME, enginePulse } from '../../src/gameplay/puzzles/PressureHatchLogic';

const settle = (logic: PressureHatchLogic, seconds: number, t0 = 0) => {
  let latched = false;
  for (let t = 0; t < seconds; t += 1 / 60) if (logic.update(1 / 60, enginePulse(t0 + t)) === 'latched') latched = true;
  return latched;
};

describe('pressure hatch puzzle', () => {
  it('starts with the bypass open, low pressure and the hatch closed', () => {
    const p = new PressureHatchLogic();
    expect(p.bypassOpen).toBe(true);
    expect(p.hatch).toBe('closed');
    settle(p, 10);
    expect(p.pressure).toBeLessThan(LIFT_THRESHOLD);
  });

  it('pulling the lever with the bypass open only hisses and changes nothing', () => {
    const p = new PressureHatchLogic();
    settle(p, 3);
    expect(p.pullLever()).toBe('hiss');
    expect(p.hatch).toBe('closed');
    expect(p.failedPulls).toBe(1);
    settle(p, 3);
    expect(p.hatch).toBe('closed');
  });

  it('closing the bypass raises pressure into the lift band within two seconds', () => {
    const p = new PressureHatchLogic();
    p.toggleValve();
    settle(p, 2);
    expect(p.inLiftBand).toBe(true);
  });

  it('valve then lever lifts and latches the hatch', () => {
    const p = new PressureHatchLogic();
    p.toggleValve();
    settle(p, 2);
    expect(p.pullLever()).toBe('lift');
    expect(p.hatch).toBe('lifting');
    expect(settle(p, LIFT_TIME + 0.1)).toBe(true);
    expect(p.hatch).toBe('latched');
  });

  it('reopening the valve after success cannot close the hatch again (no softlock)', () => {
    const p = new PressureHatchLogic();
    p.toggleValve();
    settle(p, 2);
    p.pullLever();
    settle(p, LIFT_TIME + 0.1);
    p.toggleValve();
    settle(p, 5);
    expect(p.bypassOpen).toBe(true);
    expect(p.hatch).toBe('latched');
    expect(p.pullLever()).toBe('already-open');
  });

  it('reopening the valve mid-lift still completes the lift', () => {
    const p = new PressureHatchLogic();
    p.toggleValve();
    settle(p, 2);
    p.pullLever();
    settle(p, 0.3);
    p.toggleValve();
    settle(p, LIFT_TIME);
    expect(p.hatch).toBe('latched');
  });

  it('reset restores the initial state', () => {
    const p = new PressureHatchLogic();
    p.toggleValve();
    settle(p, 2);
    p.pullLever();
    settle(p, LIFT_TIME + 0.1);
    p.reset();
    expect(p.bypassOpen).toBe(true);
    expect(p.hatch).toBe('closed');
    expect(p.pressure).toBeLessThan(LIFT_THRESHOLD);
    expect(p.failedPulls).toBe(0);
  });

  it('engine pulse stays within 0..1', () => {
    for (let t = 0; t < 20; t += 0.05) {
      const v = enginePulse(t);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
