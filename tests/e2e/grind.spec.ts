import { test, expect, type Page } from '@playwright/test';

/**
 * The feed pipe from the lookout into the hall: stepping off the lookout onto it rides it down (a
 * grind), a jump leaves it with height and the kicker refilled, and the rope-and-scaffold way down
 * is still there beside it.
 */

const errors: string[] = [];

async function boot(page: Page): Promise<void> {
  errors.length = 0;
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/?test=1&dev=1&quality=low');
  await page.waitForFunction(() => (window as any).__GAME?.ready, null, { timeout: 120_000 });
  await page.evaluate(() => {
    const w = window as any;
    w.__grind = [];
    w.__GAME.game.events.on('grind', (g: { on: boolean }) => w.__grind.push(g.on));
    // The lookout after the reveal: the rope gate is down.
    w.__GAME.teleport('lookout');
    w.__GAME.game.progression.set('reveal.done');
    w.__GAME.game.level.engine.openRoute();
    w.__GAME.stepFast(5);
  });
}

/** Walk Mara toward the hall (-z) from `x` inside the lookout until she grinds, lands, or `seconds` pass. */
const walkOff = (page: Page, x: number, seconds: number, opts: { jumpAfter?: number } = {}) =>
  page.evaluate(
    ({ x, seconds, jumpAfter }) => {
      const G = (window as any).__GAME;
      const p = G.game.player;
      G.setPlayer(x, 4.65, 12.9, Math.PI);
      G.stepFast(10);
      let grindT = 0;
      let jumped: { vy: number; airJumps: number; airDashes: number } | null = null;
      let maxCamDist = 0;
      for (let i = 0; i < seconds * 60; i++) {
        if (p.mode !== 'grind') G.setCamera(0, 0.3);
        G.setInput(p.mode === 'grind' ? null : { moveX: 0, moveY: i < 50 ? 1 : 0, jumpHeld: false });
        if (p.mode === 'grind') {
          grindT += 1 / 60;
          maxCamDist = Math.max(maxCamDist, G.game.camera.distance);
          if (jumpAfter !== undefined && grindT >= jumpAfter && !jumped) {
            G.press('jump');
            G.stepFast(1);
            jumped = { vy: p.velocity.y, airJumps: p.airJumps, airDashes: p.airDashes };
            break;
          }
        }
        G.stepFast(1);
        if (grindT > 0 && p.mode === 'move' && p.grounded) break;
      }
      G.setInput(null);
      return { grindT, jumped, maxCamDist, mode: p.mode, grinds: p.grinds, feet: p.feet.toArray() as number[] };
    },
    { x, seconds, jumpAfter: opts.jumpAfter },
  );

test('walking off the lookout onto the feed pipe rides it down to tier one', async ({ page }) => {
  await boot(page);
  const r = await walkOff(page, 1.7, 10);
  // About 20 m of pipe at 5.5 to 12 m/s.
  expect(r.grinds).toBe(1);
  expect(r.grindT).toBeGreaterThan(2.0);
  expect(r.grindT).toBeLessThan(4.5);
  expect(await page.evaluate(() => (window as any).__grind)).toEqual([true, false]);
  // Off the end and down onto the tier-one walkway at side 1, short of the gap on side 2.
  const [x, y, z] = r.feet;
  expect(y).toBeLessThan(0.3);
  const r0 = Math.hypot(x, z);
  const angle = (Math.atan2(x, z) * 180) / Math.PI;
  expect(r0).toBeGreaterThan(9.2);
  expect(angle).toBeGreaterThan(10);
  expect(angle).toBeLessThan(30);
  // The camera stood back while she rode (the hall's arm is 5.6 m).
  expect(r.maxCamDist).toBeGreaterThan(5.9);
  expect(errors).toEqual([]);
});

test('a jump leaves the pipe with height, and the kicker is refilled', async ({ page }) => {
  await boot(page);
  // Spend the double jump before landing on the pipe.
  const r = await walkOff(page, 1.7, 6, { jumpAfter: 1.0 });
  expect(r.jumped).not.toBeNull();
  expect(r.jumped!.vy).toBeGreaterThan(5);
  expect(r.mode).toBe('move');
  expect(r.jumped!.airJumps).toBe(1);
  expect(r.jumped!.airDashes).toBe(1);
  expect(errors).toEqual([]);
});

test('stepping off the left of the gate still takes the scaffold way down', async ({ page }) => {
  await boot(page);
  const r = await walkOff(page, 0.75, 4);
  expect(r.grinds).toBe(0);
  expect(r.mode).toBe('move');
  expect(errors).toEqual([]);
});
