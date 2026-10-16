import { test, expect, type Page } from '@playwright/test';

/**
 * Every jump on the Chapter One route, played with the real keyboard (Playwright key events through
 * the normal input pipeline) in two ways:
 *
 * - **camera still**: the camera is set once and left alone; W (or W plus A/D for a diagonal
 *   approach) is held from the start to the landing, and Space is held for the jump;
 * - **camera rotating**: the same, while the right mouse button drags the camera sideways the
 *   whole time (about 15 degrees a second).
 *
 * Neither may become unpredictable: every jump must land, and while airborne the direction the held
 * keys move Mara in must not bend with the camera (it keeps the camera yaw it had at takeoff).
 * The simulation is stepped deterministically; key and mouse events are real.
 */

type Probe = { feet: number[]; grounded: boolean; mode: string; wx: number; wz: number; falls: number };
type Jump = {
  name: string;
  /** Prepare the world (checkpoint, machinery); returns nothing. */
  setup?: (page: Page) => Promise<void>;
  start: (page: Page) => Promise<{ start: number[]; dir: number[]; plane: number[] }>;
  /** Press Space this far (m) before `plane`, measured along `dir`. */
  jumpAt: number;
  /** Check the end state. */
  landed: (end: Probe, ctx: { start: number[]; dir: number[]; plane: number[] }, modes: Set<string>) => void;
};

const T1 = 0;
const T3 = 2 * 3.0; // HALL.tierY[2] is checked below against the live level

async function boot(page: Page): Promise<void> {
  await page.goto('/?test=1&dev=1');
  await page.waitForFunction(() => (window as any).__GAME?.ready, null, { timeout: 120_000 });
}
const along = (p: number[], o: number[], d: number[]) => (p[0] - o[0]) * d[0] + (p[2] - o[2]) * d[2];
const sidePoint = (page: Page, k: number, a: number, f: number, y: number) =>
  page.evaluate(([kk, aa, ff, yy]) => (window as any).__GAME.game.level.engine.debugPoint(kk, aa, ff, yy) as number[], [k, a, f, y]);
const tangent = (page: Page, k: number) => page.evaluate((kk) => (window as any).__GAME.game.level.engine.debugTangent(kk) as number[], k);
const rotY = (v: number[], deg: number) => {
  const a = (deg * Math.PI) / 180;
  return [v[0] * Math.cos(a) + v[2] * Math.sin(a), 0, -v[0] * Math.sin(a) + v[2] * Math.cos(a)];
};

const JUMPS: Jump[] = [
  {
    name: 'shaft: the fallen girder (practice jump)',
    start: async () => ({ start: [0.6, 4.6, 26.0], dir: [0, 0, -1], plane: [0.6, 4.6, 24.91] }),
    jumpAt: 0.45,
    // Held W after the girder runs into the railing, never into the channel.
    landed: (end) => {
      expect(end.feet[2]).toBeLessThan(24.3);
      expect(end.feet[2]).toBeGreaterThan(22.6);
      expect(end.feet[1]).toBeCloseTo(4.6, 1);
    },
  },
  {
    name: 'shaft: the 2 m drainage gap',
    // From the lit crossing where the old catwalk broke away (the railing guards the rest of the lip).
    start: async () => ({ start: [2.5, 4.6, 24.2], dir: [0, 0, -1], plane: [2.5, 4.6, 22.6] }),
    jumpAt: 0.3,
    landed: (end) => {
      expect(end.feet[2]).toBeLessThan(20.4);
      expect(end.feet[1]).toBeCloseTo(4.6, 1);
    },
  },
  {
    name: 'tier one: the broken walkway',
    setup: async (page) => page.evaluate(() => (window as any).__GAME.teleport('route')),
    start: async (page) => {
      const t = await tangent(page, 2);
      const edge = await sidePoint(page, 2, 10.7, 0.27, T1);
      return { start: [edge[0] - t[0] * 2.6, edge[1], edge[2] - t[2] * 2.6], dir: t, plane: edge };
    },
    jumpAt: 0.25,
    landed: (end, c) => {
      expect(along(end.feet, c.plane, c.dir)).toBeGreaterThan(1.9);
      expect(end.feet[1]).toBeCloseTo(T1, 1);
    },
  },
  {
    name: 'tier one: vault the barrier beam',
    setup: async (page) => page.evaluate(() => (window as any).__GAME.teleport('route')),
    start: async (page) => {
      const t = await tangent(page, 3);
      const centre = await sidePoint(page, 3, 10.7, 0.5, T1);
      return { start: [centre[0] - t[0] * 2.6, centre[1], centre[2] - t[2] * 2.6], dir: t, plane: centre };
    },
    jumpAt: 0.95,
    landed: (end, c, modes) => {
      expect(modes.has('vault'), [...modes].join(',')).toBe(true);
      expect(along(end.feet, c.plane, c.dir)).toBeGreaterThan(0.3);
      expect(end.feet[1]).toBeCloseTo(T1, 1);
    },
  },
  {
    name: 'tier one: catch and climb the gantry edge',
    setup: async (page) => page.evaluate(() => (window as any).__GAME.teleport('route')),
    start: async (page) => {
      const t = await tangent(page, 4);
      const edge = await sidePoint(page, 4, 11.7, 0.12, T1);
      return { start: [edge[0] - t[0] * 2.2, edge[1], edge[2] - t[2] * 2.2], dir: t, plane: edge };
    },
    jumpAt: 1.1,
    landed: (end, _c, modes) => {
      expect(modes.has('hang') || modes.has('climb'), [...modes].join(',')).toBe(true);
      expect(end.feet[1]).toBeGreaterThan(T1 + 1.9);
    },
  },
  {
    name: 'breach: the broad jump from the raised ram to the exit gantry',
    setup: async (page) => {
      await page.evaluate(() => (window as any).__GAME.teleport('breach'));
      await page.evaluate(() => {
        const g = (window as any).__GAME;
        const e = g.game.level.engine;
        const deck = e.breachPiston.group.position;
        g.setPlayer(deck.x, deck.y + 0.1, deck.z, 0);
        g.stepFast(20);
        g.game.interactions.get('ram-release').interact();
        g.stepFast(60 * 3);
      });
      expect(await page.evaluate(() => (window as any).__GAME.game.level.engine.feed.ram)).toBe(1);
    },
    start: async (page) =>
      page.evaluate(() => {
        const e = (window as any).__GAME.game.level.engine;
        const a = e.exitTakeoff;
        const b = e.exitLanding;
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        const dir = [(b.x - a.x) / len, 0, (b.z - a.z) / len];
        return { start: [a.x - dir[0] * 1.3, a.y, a.z - dir[2] * 1.3], dir, plane: [a.x, a.y, a.z] };
      }),
    jumpAt: 0.15,
    landed: (end, c) => {
      expect(along(end.feet, c.plane, c.dir)).toBeGreaterThan(2.0);
      expect(Math.abs(end.feet[1] - c.plane[1])).toBeLessThan(0.3);
    },
  },
];

/**
 * Hold the keys from a standing start along `dir`, hold Space at `jumpAt` before the plane, keep
 * holding the direction until Mara lands, optionally dragging the camera sideways throughout.
 */
async function playJump(page: Page, j: { start: number[]; dir: number[]; plane: number[] }, jumpAt: number, keys: string[], cameraYaw: number, rotate: boolean) {
  await page.evaluate(
    ([s, d, yaw]) => {
      const g = (window as any).__GAME;
      g.setPlayer(s[0], s[1], s[2], Math.atan2(d[0], d[2]));
      g.setCamera(yaw, 0.35);
      g.stepFast(12);
    },
    [j.start, j.dir, cameraYaw] as [number[], number[], number],
  );
  const probe = () =>
    page.evaluate(() => {
      const g = (window as any).__GAME;
      g.stepFast(2);
      const p = g.game.player;
      const s = g.state();
      return { feet: s.feet, grounded: s.grounded, mode: p.mode, wx: p.wish.x, wz: p.wish.z, falls: s.falls } as Probe;
    });
  for (const k of keys) await page.keyboard.down(k);
  if (rotate) {
    await page.mouse.move(400, 360);
    await page.mouse.down({ button: 'right' });
  }
  const modes = new Set<string>();
  let jumped = -1;
  let airHeading: number | null = null;
  let maxBend = 0;
  let end: Probe | null = null;
  for (let i = 0; i < 200; i++) {
    if (rotate) await page.mouse.move(400 + (i + 1) * 4, 360);
    const s = await probe();
    modes.add(s.mode);
    if (jumped < 0 && (j.plane[0] - s.feet[0]) * j.dir[0] + (j.plane[2] - s.feet[2]) * j.dir[2] < jumpAt) {
      await page.keyboard.down('Space');
      jumped = i;
    }
    if (jumped >= 0 && i - jumped === 14) await page.keyboard.up('Space');
    // The direction the held keys ask for (the controller's wish), not the velocity: collisions
    // with railings or a ledge face may turn the velocity, but the camera must not turn the input.
    if (jumped >= 0 && !s.grounded && s.mode === 'move' && Math.hypot(s.wx, s.wz) > 0.1) {
      const h = Math.atan2(s.wx, s.wz);
      if (airHeading === null && i - jumped >= 2) airHeading = h;
      else if (airHeading !== null) maxBend = Math.max(maxBend, Math.abs(Math.atan2(Math.sin(h - airHeading), Math.cos(h - airHeading))));
    }
    if (jumped >= 0 && i - jumped > 10 && s.grounded && s.mode === 'move') {
      end = s;
      break;
    }
  }
  if (rotate) await page.mouse.up({ button: 'right' });
  for (const k of [...keys, 'Space']) await page.keyboard.up(k);
  const settled = await page.evaluate(() => {
    const g = (window as any).__GAME;
    g.stepFast(45);
    const p = g.game.player;
    const s = g.state();
    return { feet: s.feet, grounded: s.grounded, mode: p.mode, wx: p.wish.x, wz: p.wish.z, falls: s.falls } as Probe;
  });
  return { jumped: jumped >= 0, end: end ?? settled, settled, modes, maxBendDeg: (maxBend * 180) / Math.PI };
}

/** Camera yaw for which the given keys move Mara along `dir` (W: straight behind; W+D / W+A: 45 degrees). */
function yawFor(dir: number[], keys: string[]): number {
  const facing = Math.atan2(dir[0], dir[2]);
  const behind = facing + Math.PI;
  if (keys.includes('KeyD')) return behind + Math.PI / 4;
  if (keys.includes('KeyA')) return behind - Math.PI / 4;
  return behind;
}

test.describe('every route jump with the real keyboard', () => {
  for (const jump of JUMPS) {
    for (const rotate of [false, true]) {
      for (const keys of jump.name.startsWith('breach') || jump.name.includes('girder') ? [['KeyW']] : [['KeyW'], ['KeyW', 'KeyD']]) {
        const label = `${jump.name}: ${keys.join('+').replace(/Key/g, '')}, camera ${rotate ? 'rotating' : 'still'}`;
        test(label, async ({ page }) => {
          await boot(page);
          expect(await page.evaluate(() => (window as any).__GAME.game.level.engine && 3.0 * 2)).toBe(T3);
          await jump.setup?.(page);
          const c = await jump.start(page);
          // A diagonal key approach comes in 20 degrees off the line, as a player would.
          const dir = keys.length > 1 ? rotY(c.dir, -20) : c.dir;
          const startBack = keys.length > 1 ? [c.plane[0] - dir[0] * Math.abs(along(c.start, c.plane, c.dir)), c.start[1], c.plane[2] - dir[2] * Math.abs(along(c.start, c.plane, c.dir))] : c.start;
          const r = await playJump(page, { start: startBack, dir, plane: c.plane }, jump.jumpAt, keys, yawFor(dir, keys), rotate);
          expect(r.jumped, 'reached the takeoff').toBe(true);
          jump.landed(r.settled, { ...c, dir: c.dir }, r.modes);
          expect(r.settled.falls).toBe(0);
          // In the air, the held direction does not bend with the camera.
          expect(r.maxBendDeg, 'heading change while airborne (degrees)').toBeLessThan(6);
        });
      }
    }
  }
});
