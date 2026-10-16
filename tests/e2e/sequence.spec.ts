import { test, expect, type Page } from '@playwright/test';

/**
 * The route cannot be skipped with the steam kicker's moves. Each test tries a shortcut with the
 * real controller (run, jump, double jump, air dash) and checks that it fails:
 *
 *   - tier one and tier three only run one way round (collapses close the other way);
 *   - the exit gantry is out of reach without riding the ram (3.4 m, a double jump reaches 2.6 m);
 *   - the steam curtain cannot be jumped over;
 *   - the lookout's rope gate cannot be cleared before the reveal.
 */

const errors: string[] = [];

async function boot(page: Page): Promise<void> {
  errors.length = 0;
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?test=1&dev=1&quality=low');
  await page.waitForFunction(() => (window as any).__GAME?.ready, null, { timeout: 120_000 });
}

/**
 * Walk round the ring toward each side's middle in turn (apothem 10.4), steering with the camera.
 * Returns the sides reached before getting stuck for 1.5 s.
 */
const walkSides = (page: Page, sides: number[], y: number) =>
  page.evaluate(
    ({ sides, y }) => {
      const G = (window as any).__GAME;
      const reached: number[] = [];
      for (const k of sides) {
        const th = (k * 2 * Math.PI) / 18;
        const tx = Math.sin(th) * 10.4;
        const tz = Math.cos(th) * 10.4;
        let best = Infinity;
        let stuck = 0;
        let ok = false;
        for (let i = 0; i < 500; i++) {
          const f = G.game.player.feet;
          const d = Math.hypot(tx - f.x, tz - f.z);
          if (d < 0.9 && Math.abs(f.y - y) < 1) {
            ok = true;
            break;
          }
          if (d < best - 0.05) {
            best = d;
            stuck = 0;
          } else stuck++;
          if (stuck > 30) break;
          G.setCamera(Math.atan2(tx - f.x, tz - f.z) + Math.PI, 0.3);
          G.setInput({ moveX: 0, moveY: 1, jumpHeld: false });
          G.stepFast(3);
        }
        if (!ok) break;
        reached.push(k);
      }
      G.setInput(null);
      return reached;
    },
    { sides, y },
  );

/**
 * Run at `target` from `from`, jump at `jumpAt` metres along, then fire `moves` ('double' or
 * 'dash') 0.3 s apart. Returns where Mara ended up once she landed (or fell).
 */
const jumpChain = (page: Page, from: number[], target: number[], jumpAt: number, moves: string[]) =>
  page.evaluate(
    ({ from, target, jumpAt, moves }) => {
      const G = (window as any).__GAME;
      const dir = Math.atan2(target[0] - from[0], target[2] - from[2]);
      G.setPlayer(from[0], from[1] + 0.05, from[2], dir);
      G.stepFast(15);
      let jumped = false;
      let n = 0;
      let air = 0;
      let maxAlong = 0;
      const len = Math.hypot(target[0] - from[0], target[2] - from[2]);
      for (let i = 0; i < 300; i++) {
        const f = G.game.player.feet;
        const along = ((f.x - from[0]) * (target[0] - from[0]) + (f.z - from[2]) * (target[2] - from[2])) / len;
        maxAlong = Math.max(maxAlong, along);
        if (!jumped && along >= jumpAt) {
          G.setInput({ moveX: 0, moveY: 1, jumpHeld: true });
          G.press('jump');
          jumped = true;
        } else if (!jumped) G.setInput({ moveX: 0, moveY: 1, jumpHeld: false });
        if (jumped) air += 1 / 60;
        if (jumped && n < moves.length && air > 0.28 + n * 0.3) {
          G.press(moves[n] === 'double' ? 'jump' : 'dash');
          n++;
        }
        G.setCamera(dir + Math.PI, 0.3);
        G.stepFast(1);
        if (jumped && air > 0.4 && G.game.player.grounded) break;
        if (f.y < from[1] - 4) break;
      }
      G.setInput(null);
      const f = G.game.player.feet;
      return { feet: [f.x, f.y, f.z], maxAlong };
    },
    { from, target, jumpAt, moves },
  );

test('tier one runs one way: the long way round to the engine is closed', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => (window as any).__GAME.teleport('route'));
  await page.evaluate(() => (window as any).__GAME.stepFast(20));
  // Left from the scaffold: side 0, then side 17 is a short dead end before the collapse.
  const left = await walkSides(page, [0, 17, 16, 15], 0);
  expect(left).not.toContain(16);
  expect(await page.evaluate(() => (window as any).__GAME.game.checkpoints.current.id)).toBe('route');
  // And from the engine gantry the ring does not continue past side 7.
  await page.evaluate(() => (window as any).__GAME.teleport('engine'));
  await page.evaluate(() => (window as any).__GAME.stepFast(20));
  const on = await walkSides(page, [8, 9], 0);
  expect(on).not.toContain(9);
  expect(errors).toEqual([]);
});

test('tier three runs one way: no walking round to the far side of the breach', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => (window as any).__GAME.teleport('engine-top'));
  await page.evaluate(() => (window as any).__GAME.stepFast(20));
  const back = await walkSides(page, [6, 5, 4], 9.2);
  expect(back).not.toContain(5);
  expect(errors).toEqual([]);
});

test('the exit gantry cannot be reached without riding the ram', async ({ page }) => {
  await boot(page);
  const plans = [['double'], ['double', 'dash'], ['dash', 'double']];
  for (const f of [0.5, 0.74]) {
    for (const moves of plans) {
      await page.evaluate(() => (window as any).__GAME.teleport('breach'));
      await page.evaluate(() => (window as any).__GAME.stepFast(10));
      const { from, target } = await page.evaluate((frac) => {
        const e = (window as any).__GAME.game.level.engine;
        const c = e.exitCenter;
        const th = (9 * 2 * Math.PI) / 18;
        const a = 10.6;
        const half = a * Math.tan(Math.PI / 18);
        const u = -half + 2 * half * frac;
        const sx = Math.sin(th) * a + Math.cos(th) * u;
        const sz = Math.cos(th) * a - Math.sin(th) * u;
        const d = Math.atan2(c.x - sx, c.z - sz);
        return { from: [sx - Math.sin(d) * 2.4, 9.2, sz - Math.cos(d) * 2.4], target: [c.x, c.y, c.z] };
      }, f);
      await jumpChain(page, from, target, 2.2, moves);
      expect(await page.evaluate(() => (window as any).__GAME.game.progression.has('exit.reached')), `${f} ${moves.join('+')}`).toBe(false);
    }
  }
  expect(errors).toEqual([]);
});

test('the steam curtain cannot be jumped over', async ({ page }) => {
  await boot(page);
  for (const moves of [['double'], ['double', 'dash'], ['dash', 'double']]) {
    await page.evaluate(() => (window as any).__GAME.teleport('engine-top'));
    await page.evaluate(() => (window as any).__GAME.stepFast(10));
    const probe = await page.evaluate(() => (window as any).__GAME.game.level.engine.curtainProbe() as { from: number[]; past: number[] });
    expect(await page.evaluate(() => (window as any).__GAME.game.level.engine.feed.curtainOn)).toBe(true);
    const len = Math.hypot(probe.past[0] - probe.from[0], probe.past[2] - probe.from[2]);
    const r = await jumpChain(page, probe.from, probe.past, 0.6, moves);
    // Never got past the curtain (it sits a little past half way from `from` to `past`).
    expect(r.maxAlong, moves.join('+')).toBeLessThan(len * 0.8);
  }
  expect(errors).toEqual([]);
});

test('the lookout rope gate cannot be cleared before the reveal', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => (window as any).__GAME.teleport('lookout'));
  await page.evaluate(() => (window as any).__GAME.stepFast(10));
  expect(await page.evaluate(() => (window as any).__GAME.game.progression.has('reveal.done'))).toBe(false);
  for (const moves of [['double'], ['double', 'dash']]) {
    // From inside the lookout, straight at the rope gate (x 0.65..2.15 at the front edge).
    await jumpChain(page, [1.4, 4.6, 15.4], [1.4, 4.6, 10.0], 1.6, moves);
    const feet = await page.evaluate(() => (window as any).__GAME.game.player.feet.toArray() as number[]);
    expect(feet[2], moves.join('+')).toBeGreaterThan(12.4);
    expect(feet[1]).toBeGreaterThan(4.4);
  }
  expect(errors).toEqual([]);
});
