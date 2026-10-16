import { test, expect, type Page } from '@playwright/test';

/**
 * Movement 2.0: the ground dash (roll) and sprint, and Ivo's steam kicker (double jump, air dash,
 * ground pound). Deterministic stepping with virtual input through the real input pipeline.
 */

type Snap = { feet: number[]; grounded: boolean; vy: number; speed: number; pound: string; dashT: number; steam: boolean; airJumps: number; airDashes: number };

async function boot(page: Page): Promise<void> {
  await page.goto('/?test=1&dev=1');
  await page.waitForFunction(() => (window as any).__GAME?.ready, null, { timeout: 120_000 });
}
const snap = (page: Page) =>
  page.evaluate(() => {
    const p = (window as any).__GAME.game.player;
    return { feet: p.feet.toArray(), grounded: p.grounded, vy: p.velocity.y, speed: p.speed, pound: p.pound, dashT: p.dashT, steam: p.steam, airJumps: p.airJumps, airDashes: p.airDashes } as Snap;
  });
const step = (page: Page, n: number) => page.evaluate((k) => (window as any).__GAME.stepFast(k), n);
const input = (page: Page, v: { moveX?: number; moveY?: number; jumpHeld?: boolean; dashHeld?: boolean } | null) =>
  page.evaluate((x) => ((window as any).__GAME.game.input.virtual = x ? { moveX: 0, moveY: 0, jumpHeld: false, ...x } : null), v);
const press = (page: Page, a: 'jump' | 'interact' | 'dash' | 'pound') => page.evaluate((x) => (window as any).__GAME.press(x), a);

/** Stand on open ground on tier one (the "route" checkpoint, which implies the kicker). */
async function onTierOne(page: Page): Promise<void> {
  await page.evaluate(() => (window as any).__GAME.teleport('route'));
  await step(page, 30);
}

/** Highest the feet reach above `y0` over `steps` single steps, pressing jump at the given steps. */
async function jumpProfile(page: Page, presses: number[], steps = 90): Promise<{ apex: number; landed: boolean }> {
  return page.evaluate(
    ([pressAt, n]) => {
      const g = (window as any).__GAME;
      const p = g.game.player;
      const y0 = p.feet.y;
      let apex = 0;
      for (let i = 0; i < n; i++) {
        if (pressAt.includes(i)) g.press('jump');
        g.game.input.virtual = { moveX: 0, moveY: 0, jumpHeld: true };
        g.stepFast(1);
        apex = Math.max(apex, p.feet.y - y0);
      }
      g.game.input.virtual = null;
      return { apex, landed: p.grounded };
    },
    [presses, steps] as [number[], number],
  );
}

test.describe('ground dash and sprint (always available)', () => {
  test('a dash is a quick burst, and holding it keeps a sprint', async ({ page }) => {
    await boot(page);
    await onTierOne(page);
    // A clear straight run: tier one, side 1, along its length, camera behind.
    const r = await page.evaluate(() => {
      const g = (window as any).__GAME;
      const e = g.game.level.engine;
      const p = g.game.player;
      const t = e.debugTangent(1);
      const a = e.debugPoint(1, 10.6, 0.04, 0);
      const facing = Math.atan2(t[0], t[2]);
      g.setPlayer(a[0], a[1], a[2], facing);
      g.setCamera(facing + Math.PI, 0.35);
      g.stepFast(10);
      g.game.input.virtual = { moveX: 0, moveY: 1, jumpHeld: false, dashHeld: true };
      g.stepFast(4);
      g.press('dash');
      g.stepFast(3);
      const burst = p.speed;
      const dashing = p.dashT > 0;
      g.stepFast(14); // the dash (0.18 s) and the settle onto sprint speed
      const sprint = p.speed;
      const sprinting = p.sprinting;
      g.game.input.virtual = { moveX: 0, moveY: 1, jumpHeld: false, dashHeld: false };
      g.stepFast(10);
      const run = p.speed;
      g.game.input.virtual = null;
      return { burst, dashing, sprint, sprinting, run, grounded: p.grounded };
    });
    expect(r.dashing).toBe(true);
    expect(r.burst).toBeGreaterThan(9.5);
    expect(r.sprinting).toBe(true);
    expect(r.sprint).toBeGreaterThan(7.2);
    expect(r.sprint).toBeLessThan(7.6);
    expect(r.run).toBeLessThan(5.7);
    expect(r.grounded).toBe(true);
  });
});

test.describe("Ivo's steam kicker", () => {
  test('before the kit: no double jump or air dash; picking it up enables them', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => (window as any).__GAME.teleport('landing'));
    await step(page, 20);
    expect((await snap(page)).steam).toBe(false);
    const single = await jumpProfile(page, [0, 22]);
    expect(single.apex).toBeLessThan(1.6);
    // Pick up the kit through the real interaction.
    await page.evaluate(() => (window as any).__GAME.setPlayer(2.3, 4.6, 26.05, Math.PI / 2));
    await step(page, 10);
    expect((await page.evaluate(() => (window as any).__GAME.state())).prompt).toBe('Pick up the tool roll');
    await press(page, 'interact');
    await step(page, 90);
    const st = await page.evaluate(() => (window as any).__GAME.state());
    expect(st.flags).toContain('kicker.taken');
    expect((await snap(page)).steam).toBe(true);
    expect(await page.locator('.ability').getAttribute('class')).not.toContain('hidden');
  });

  test('double jump: about 1.1 m more height, once per airtime, refilled on landing', async ({ page }) => {
    await boot(page);
    await onTierOne(page);
    const one = await jumpProfile(page, [0]);
    expect(one.apex).toBeGreaterThan(1.3);
    expect(one.apex).toBeLessThan(1.6);
    const two = await jumpProfile(page, [0, 24], 110);
    expect(two.apex).toBeGreaterThan(2.3);
    expect(two.landed).toBe(true);
    // A third press in the same airtime does nothing.
    const three = await jumpProfile(page, [0, 24, 46], 120);
    expect(three.apex).toBeLessThan(two.apex + 0.05);
    // Refilled after landing: the next double jump works again.
    const again = await jumpProfile(page, [0, 24], 110);
    expect(again.apex).toBeGreaterThan(2.3);
  });

  test('air dash: a horizontal burst that holds height, once per airtime', async ({ page }) => {
    await boot(page);
    await onTierOne(page);
    const r = await page.evaluate(() => {
      const g = (window as any).__GAME;
      const p = g.game.player;
      const out: { dx: number; dy: number; second: number } = { dx: 0, dy: 0, second: 0 };
      g.press('jump');
      g.game.input.virtual = { moveX: 0, moveY: 0, jumpHeld: true };
      g.stepFast(20);
      const a = p.feet.clone();
      g.press('dash');
      g.stepFast(12); // the dash lasts 0.2 s
      out.dx = Math.hypot(p.feet.x - a.x, p.feet.z - a.z);
      out.dy = Math.abs(p.feet.y - a.y);
      g.press('dash');
      g.stepFast(2);
      out.second = p.dashT;
      g.game.input.virtual = null;
      g.stepFast(90);
      return out;
    });
    expect(r.dx).toBeGreaterThan(2.0);
    expect(r.dy).toBeLessThan(0.15);
    expect(r.second).toBe(0);
  });

  test('ground pound: hover, slam at speed, an impact event where it lands; not right above the floor', async ({ page }) => {
    await boot(page);
    await onTierOne(page);
    await page.evaluate(() => {
      const w = window as any;
      w.__pounds = [];
      w.__GAME.game.events.on('groundPound', (p: unknown) => w.__pounds.push(p));
    });
    // Too low: pressed straight after takeoff, nothing happens.
    await press(page, 'jump');
    await step(page, 2);
    await press(page, 'pound');
    await step(page, 2);
    expect((await snap(page)).pound).toBe('none');
    await step(page, 80);
    // From near the apex: hover, then a fast fall.
    await press(page, 'jump');
    await input(page, { jumpHeld: true });
    await step(page, 22);
    await press(page, 'pound');
    await step(page, 3);
    expect((await snap(page)).pound).toBe('hover');
    // The wind-up holds height for about 0.16 s, then the slam.
    const fall = await page.evaluate(() => {
      const g = (window as any).__GAME;
      const p = g.game.player;
      for (let i = 0; i < 20; i++) {
        g.stepFast(1);
        if (p.pound === 'fall') return { pound: p.pound, vy: p.velocity.y };
      }
      return { pound: p.pound, vy: p.velocity.y };
    });
    expect(fall.pound).toBe('fall');
    expect(fall.vy).toBeLessThan(-20);
    await step(page, 40);
    await input(page, null);
    const pounds = await page.evaluate(() => (window as any).__pounds.length);
    expect(pounds).toBe(1);
    expect((await snap(page)).grounded).toBe(true);
  });

  test('teleports and respawns cancel a dash or a pound and refill the air moves', async ({ page }) => {
    await boot(page);
    await onTierOne(page);
    await press(page, 'jump');
    await input(page, { jumpHeld: true });
    await step(page, 22);
    await press(page, 'pound');
    await step(page, 4);
    await page.evaluate(() => (window as any).__GAME.teleport('route'));
    await input(page, null);
    await step(page, 5);
    const s = await snap(page);
    expect(s.pound).toBe('none');
    expect(s.dashT).toBe(0);
    expect(s.airJumps).toBe(1);
    expect(s.airDashes).toBe(1);
  });
});
