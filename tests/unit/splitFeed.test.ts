import { describe, expect, it } from 'vitest';
import { RAM_TRAVEL_TIME, SplitFeedLogic } from '../../src/gameplay/puzzles/SplitFeedLogic';

const run = (l: SplitFeedLogic, seconds: number, rider = false) => {
  for (let t = 0; t < seconds; t += 1 / 60) l.step(1 / 60, rider);
};

describe('split feed (breach ram and steam curtain)', () => {
  it('starts venting: curtain on, ram down and free', () => {
    const l = new SplitFeedLogic();
    expect(l.curtainOn).toBe(true);
    expect(l.ram).toBe(0);
    expect(l.caught).toBe(false);
    run(l, 5);
    expect(l.ram).toBe(0);
  });

  it('the natural mistake: feeding the ram first sends it up empty and stops the curtain', () => {
    const l = new SplitFeedLogic();
    l.toggleRoute();
    expect(l.curtainOn).toBe(false);
    run(l, RAM_TRAVEL_TIME + 0.2);
    expect(l.ram).toBe(1);
    expect(l.emptyRises).toBe(1);
    // It holds up there while fed; venting brings it back down.
    run(l, 5);
    expect(l.ram).toBe(1);
    l.toggleRoute();
    run(l, RAM_TRAVEL_TIME + 0.2);
    expect(l.ram).toBe(0);
    expect(l.curtainOn).toBe(true);
  });

  it('catch while down, then feed: the ram strains but waits; the deck release carries the rider up', () => {
    const l = new SplitFeedLogic();
    l.toggleCatch();
    l.toggleRoute();
    expect(l.curtainOn).toBe(false);
    expect(l.straining).toBe(true);
    expect(l.primed).toBe(true);
    run(l, 10);
    expect(l.ram).toBe(0);
    expect(l.release()).toBe(true);
    run(l, RAM_TRAVEL_TIME + 0.2, true);
    expect(l.ram).toBe(1);
    expect(l.emptyRises).toBe(0);
    expect(l.height).toBe(1);
  });

  it('catching the ram at the top holds it there even when venting; freeing it recovers', () => {
    const l = new SplitFeedLogic();
    l.toggleRoute();
    run(l, RAM_TRAVEL_TIME + 0.2);
    l.toggleCatch();
    l.toggleRoute();
    run(l, 5);
    expect(l.ram).toBe(1);
    expect(l.straining).toBe(true);
    l.toggleCatch();
    run(l, RAM_TRAVEL_TIME + 0.2);
    expect(l.ram).toBe(0);
    // From here the correct order still works.
    l.toggleCatch();
    l.toggleRoute();
    expect(l.primed).toBe(true);
  });

  it('a catch set mid-travel stops the ram where it is', () => {
    const l = new SplitFeedLogic();
    l.toggleRoute();
    run(l, RAM_TRAVEL_TIME / 2);
    l.toggleCatch();
    const held = l.ram;
    expect(held).toBeGreaterThan(0.3);
    expect(held).toBeLessThan(0.7);
    run(l, 3);
    expect(l.ram).toBe(held);
  });

  it('the deck release does nothing when the catch is already free', () => {
    const l = new SplitFeedLogic();
    expect(l.release()).toBe(false);
  });

  it('reset restores the initial state', () => {
    const l = new SplitFeedLogic();
    l.toggleCatch();
    l.toggleRoute();
    l.release();
    run(l, 3);
    l.reset();
    expect(l.route).toBe('vent');
    expect(l.caught).toBe(false);
    expect(l.ram).toBe(0);
    expect(l.routeChanges).toBe(0);
  });
});
