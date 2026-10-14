import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { EventBus, type GameEvents } from '../../src/core/Events';
import { Checkpoints, Progression, Triggers, boxVolume } from '../../src/gameplay/Progression';

const cp = (id: string, order: number) => ({ id, order, label: id, feet: new THREE.Vector3(), facing: 0, impliesFlags: [] });

describe('progression flags', () => {
  it('sets flags once and emits events', () => {
    const events = new EventBus<GameEvents>();
    const seen: string[] = [];
    events.on('flag', ({ flag }) => seen.push(flag));
    const p = new Progression(events);
    expect(p.set('hatch.open')).toBe(true);
    expect(p.set('hatch.open')).toBe(false);
    expect(p.has('hatch.open')).toBe(true);
    expect(seen).toEqual(['hatch.open']);
  });

  it('reset clears everything for a fresh run', () => {
    const p = new Progression(new EventBus<GameEvents>());
    p.set('a');
    p.falls = 3;
    p.complete = true;
    p.reset();
    expect(p.list()).toEqual([]);
    expect(p.falls).toBe(0);
    expect(p.complete).toBe(false);
  });
});

describe('checkpoints', () => {
  it('only moves forward', () => {
    const c = new Checkpoints(new EventBus<GameEvents>());
    c.register(cp('cell', 0));
    c.register(cp('landing', 1));
    c.register(cp('lookout', 2));
    expect(c.current?.id).toBe('cell');
    expect(c.reach('lookout')).toBe(true);
    expect(c.reach('landing')).toBe(false);
    expect(c.current?.id).toBe('lookout');
  });

  it('force allows restarts and dev teleports', () => {
    const c = new Checkpoints(new EventBus<GameEvents>());
    c.register(cp('cell', 0));
    c.register(cp('landing', 1));
    c.reach('landing');
    c.force('cell');
    expect(c.current?.id).toBe('cell');
  });
});

describe('triggers', () => {
  it('fire once on enter and can be re-armed', () => {
    const t = new Triggers();
    let count = 0;
    t.add({ id: 'x', contains: boxVolume({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 }), onEnter: () => count++ });
    const inside = new THREE.Vector3(0.5, 0.5, 0.5);
    const outside = new THREE.Vector3(5, 5, 5);
    t.update(inside);
    t.update(outside);
    t.update(inside);
    expect(count).toBe(1);
    t.rearm();
    t.update(inside);
    expect(count).toBe(2);
  });
});
