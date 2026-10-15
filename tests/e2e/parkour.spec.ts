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
/** World point on route side k at apothem a and fraction f, as [x, y, z]. */
const pt = (page: Page, k: number, a: number, f: number, y = T1) =>
  page.evaluate(([kk, aa, ff, yy]) => (window as any).__GAME.game.level.engine.debugPoint(kk, aa, ff, yy) as number[], [k, a, f, y]);
/** Unit tangent of side k (direction of increasing f). */
const tangent = (page: Page, k: number) => page.evaluate((kk) => (window as any).__GAME.game.level.engine.debugTangent(kk) as number[], k);

const rotY = (v: number[], deg: number) => {
  const a = (deg * Math.PI) / 180;
  return [v[0] * Math.cos(a) + v[2] * Math.sin(a), 0, -v[0] * Math.sin(a) + v[2] * Math.cos(a)];
};

/**
 * Run from `start` along `dir` (stick input converted through the live camera yaw); press jump once
 * the feet are `jumpAt` metres short of `plane` (measured along `normal`), keep holding the
 * direction, then settle. The whole loop runs inside the page in one call, so it does not wait on
 * rendered frames (software rendering takes seconds per frame). The drop shadow is updated each
 * step with the live physics state, exactly as the render loop would.
 */
async function runAndJump(page: Page, start: number[], dir: number[], plane: number[], normal: number[], jumpAt: number, settleSteps = 150): Promise<{ modes: Set<string>; end: State; airShadow: number[] }> {
  const r = await page.evaluate(
    ([start, dir, plane, normal, jumpAt, settleSteps]) => {
      const g = (window as any).__GAME;
      const game = g.game;
      const facing = Math.atan2(dir[0], dir[2]);
      g.setPlayer(start[0], start[1], start[2], facing);
      g.setCamera(facing + Math.PI, 0.35);
      g.stepFast(10);
      const len = Math.hypot(dir[0], dir[2]);
      const modes: string[] = [];
      const airShadow: number[] = [];
      let jumped = false;
      for (let i = 0; i < 240; i++) {
        const yaw = game.camera.yaw;
        const fx = -Math.sin(yaw);
        const fz = -Math.cos(yaw);
        const rx = Math.cos(yaw);
        const rz = -Math.sin(yaw);
        g.setInput({ moveX: (dir[0] * rx + dir[2] * rz) / len, moveY: (dir[0] * fx + dir[2] * fz) / len, jumpHeld: jumped });
        g.stepFast(2);
        const s = g.state();
        if (!modes.includes(s.mode)) modes.push(s.mode);
        const dist = (plane[0] - s.feet[0]) * normal[0] + (plane[2] - s.feet[2]) * normal[2];
        if (!jumped && dist < jumpAt) {
          g.press('jump');
          jumped = true;
        }
        if (jumped && !s.grounded) {
          game.dropShadow.update(game.physics, game.player.feet, game.player.grounded, game.player.collider, true);
          if (game.dropShadow.groundY !== null) airShadow.push(game.dropShadow.groundY);
        }
        if (jumped && i > 30 && s.grounded && s.mode === 'move') break;
      }
      g.setInput({ moveX: 0, moveY: 0, jumpHeld: false });
      g.stepFast(settleSteps);
      return { modes, end: g.state(), airShadow };
    },
    [start, dir, plane, normal, jumpAt, settleSteps] as [number[], number[], number[], number[], number, number],
  );
  return { modes: new Set(r.modes), end: r.end as State, airShadow: r.airShadow };
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
