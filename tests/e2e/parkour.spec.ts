import { test, expect, type Page } from '@playwright/test';

/**
 * Parkour readability and tolerance: the tier-one route's vault, ledge catch and first gap must
 * work from imperfect approach angles, not only from the autopilot's square lines, and the drop
 * shadow must mark the landing surface while airborne. Deterministic stepping with steered input.
 */

type State = { feet: number[]; grounded: boolean; mode: string; falls: number };
const T1 = 0;

async function boot(page: Page): Promise<void> {
  await page.goto('/?test=1&dev=1');
  await page.waitForFunction(() => (window as any).__GAME?.ready, null, { timeout: 120_000 });
  await page.evaluate(() => (window as any).__GAME.teleport('route'));
}
const state = (page: Page) => page.evaluate(() => (window as any).__GAME.state() as State);
const step = (page: Page, n: number) => page.evaluate((k) => (window as any).__GAME.stepFast(k), n);
/** World point on route side k at apothem a and fraction f, as [x, y, z]. */
const pt = (page: Page, k: number, a: number, f: number, y = T1) =>
  page.evaluate(([kk, aa, ff, yy]) => (window as any).__GAME.game.level.engine.debugPoint(kk, aa, ff, yy) as number[], [k, a, f, y]);
/** Unit tangent of side k (direction of increasing f). */
const tangent = (page: Page, k: number) => page.evaluate((kk) => (window as any).__GAME.game.level.engine.debugTangent(kk) as number[], k);

const rotY = (v: number[], deg: number) => {
  const a = (deg * Math.PI) / 180;
  return [v[0] * Math.cos(a) + v[2] * Math.sin(a), 0, -v[0] * Math.sin(a) + v[2] * Math.cos(a)];
};

/** Hold a world-space direction on the stick (converted through the current camera yaw). */
function hold(page: Page, dir: number[], jumpHeld = false) {
  return page.evaluate(
    ([d, j]) => {
      const g = (window as any).__GAME;
      const yaw = g.game.camera.yaw;
      const fx = -Math.sin(yaw);
      const fz = -Math.cos(yaw);
      const rx = Math.cos(yaw);
      const rz = -Math.sin(yaw);
      const len = Math.hypot(d[0], d[2]);
      g.setInput({ moveX: (d[0] * rx + d[2] * rz) / len, moveY: (d[0] * fx + d[2] * fz) / len, jumpHeld: j });
    },
    [dir, jumpHeld] as [number[], boolean],
  );
}

/**
 * Run from `start` along `dir`; press jump once the feet are `jumpAt` metres short of `plane`
 * (measured along `normal`), keep holding the direction, then settle. Returns the modes seen.
 */
async function runAndJump(page: Page, start: number[], dir: number[], plane: number[], normal: number[], jumpAt: number, settleSteps = 150): Promise<{ modes: Set<string>; end: State; airShadow: number[] }> {
  const facing = Math.atan2(dir[0], dir[2]);
  await page.evaluate(([s, f]) => (window as any).__GAME.setPlayer(s[0], s[1], s[2], f), [start, facing] as [number[], number]);
  await page.evaluate((f) => (window as any).__GAME.setCamera(f + Math.PI, 0.35), facing);
  await step(page, 10);
  const modes = new Set<string>();
  const airShadow: number[] = [];
  let jumped = false;
  for (let i = 0; i < 240; i++) {
    await hold(page, dir, jumped);
    await step(page, 2);
    const s = await state(page);
    modes.add(s.mode);
    const dist = (plane[0] - s.feet[0]) * normal[0] + (plane[2] - s.feet[2]) * normal[2];
    if (!jumped && dist < jumpAt) {
      await page.evaluate(() => (window as any).__GAME.press('jump'));
      jumped = true;
    }
    if (jumped && !s.grounded) {
      const gy = await page.evaluate(() => (window as any).__GAME.game.dropShadow.groundY as number | null);
      if (gy !== null) airShadow.push(gy);
    }
    if (jumped && i > 30 && s.grounded && s.mode === 'move') break;
  }
  await page.evaluate(() => (window as any).__GAME.setInput({ moveX: 0, moveY: 0, jumpHeld: false }));
  await step(page, settleSteps);
  return { modes, end: await state(page), airShadow };
}

test.describe('imperfect approach angles', () => {
  for (const angle of [0, 25, -40]) {
    test(`vault the barrier beam ${angle} degrees off square`, async ({ page }) => {
      await boot(page);
      const t = await tangent(page, 3);
      const centre = await pt(page, 3, 10.7, 0.5);
      const dir = rotY(t, angle);
      const start = [centre[0] - dir[0] * 2.6, centre[1], centre[2] - dir[2] * 2.6];
      const r = await runAndJump(page, start, dir, centre, t, 0.95);
      expect(r.modes.has('vault'), `modes: ${[...r.modes].join(',')}`).toBe(true);
      // Ended beyond the barrier on the walkway, no fall.
      const past = (r.end.feet[0] - centre[0]) * t[0] + (r.end.feet[2] - centre[2]) * t[2];
      expect(past).toBeGreaterThan(0.3);
      expect(r.end.feet[1]).toBeCloseTo(T1, 1);
      expect(r.end.falls).toBe(0);
    });
  }

  // The gantry's end face meets the hall wall on one side, so angled approaches come from the hall side.
  for (const angle of [0, -20, -35, -45]) {
    test(`catch and climb the gantry edge ${angle} degrees off square`, async ({ page }) => {
      await boot(page);
      const t = await tangent(page, 4);
      // The catch edge is the gantry's end face (fraction 0.12 at apothem 11.7), 2.0 m up.
      const edge = await pt(page, 4, 11.7, 0.12);
      const dir = rotY(t, angle);
      const start = [edge[0] - dir[0] * 2.2, edge[1], edge[2] - dir[2] * 2.2];
      const r = await runAndJump(page, start, dir, edge, t, 1.1, 90);
      expect(r.modes.has('hang') || r.modes.has('climb'), `modes: ${[...r.modes].join(',')}`).toBe(true);
      expect(r.end.feet[1]).toBeGreaterThan(T1 + 1.9);
      expect(r.end.falls).toBe(0);
    });
  }

  for (const angle of [0, 20, -20]) {
    test(`jump the first gap ${angle} degrees off square, with the drop shadow on the landing`, async ({ page }) => {
      await boot(page);
      const t = await tangent(page, 2);
      const edge = await pt(page, 2, 10.7, 0.27);
      const dir = rotY(t, angle);
      const start = [edge[0] - dir[0] * 3.0, edge[1], edge[2] - dir[2] * 3.0];
      const r = await runAndJump(page, start, dir, edge, t, 0.25);
      const past = (r.end.feet[0] - edge[0]) * t[0] + (r.end.feet[2] - edge[2]) * t[2];
      expect(past).toBeGreaterThan(1.9);
      expect(r.end.feet[1]).toBeCloseTo(T1, 1);
      expect(r.end.falls).toBe(0);
      // While airborne the shadow sits on a floor below her: over the gap that is the next tier
      // down or the walkway she lands on, never the railing tops in mid-air.
      expect(r.airShadow.length).toBeGreaterThan(5);
      expect(r.airShadow[r.airShadow.length - 1]).toBeCloseTo(T1, 1);
    });
  }
});
