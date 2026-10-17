import { test, expect, type Page } from '@playwright/test';

/**
 * Chapter Three, "The Low Tide" (?chapter=3): swimming, the steam skiff, the bar that only the
 * surge lets it cross, docking at the lighthouse, the climb to the gallery, the ending, and the Watch
 * on its patrol boat (with ?watch=1). Deterministic stepping as in engine.spec.ts.
 */

const errors: string[] = [];
async function boot(page: Page, query = ''): Promise<void> {
  errors.length = 0;
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => (m.type() === 'error' ? errors.push(m.text()) : undefined));
  await page.goto(`/?test=1&dev=1&chapter=3${query}`);
  await page.waitForFunction(() => (window as any).__GAME?.ready, null, { timeout: 120_000 });
}
type State = { feet: number[]; checkpoint: string; flags: string[]; objective: string; mode: string; falls: number; complete: boolean; chapter: number; autopilot: { state: string; message: string; log: string[] } | null };
const state = (page: Page) => page.evaluate(() => (window as any).__GAME.state() as State);
const step = (page: Page, n: number) => page.evaluate((k) => (window as any).__GAME.stepFast(k), n);

/** Steer the skiff toward (x, z) with the camera behind it; stop near it, or after `n` steps. */
function drive(page: Page, x: number, z: number, n: number, stopOnBump = false) {
  return page.evaluate(
    ([tx, tz, steps, stop]) => {
      const G = (window as any).__GAME;
      const s = G.game.level.skiff;
      const b0 = s.bumps;
      let i = 0;
      for (; i < steps; i++) {
        G.setCamera(Math.atan2(tx - s.pos.x, tz - s.pos.z) + Math.PI, 0.35);
        G.setInput({ moveX: 0, moveY: 1, jumpHeld: false });
        G.stepFast(1);
        if (Math.hypot(tx - s.pos.x, tz - s.pos.z) < 2) break;
        if (stop && s.bumps > b0) break;
      }
      G.setInput(null);
      return { i, x: s.pos.x, z: s.pos.z, bumps: s.bumps - b0, aground: s.aground as boolean };
    },
    [x, z, n, stopOnBump] as [number, number, number, boolean],
  );
}

/** Step until the sea is at low water, between surges. */
const toLowWater = (page: Page) =>
  page.evaluate(() => {
    const G = (window as any).__GAME;
    const L = G.game.level;
    for (let i = 0; i < 60 * 10 && L.coast.level > 0.02; i++) G.stepFast(1);
    for (let i = 0; i < 60 && L.coast.level <= 0.02; i++) G.stepFast(1);
    for (let i = 0; i < 60 * 10 && L.coast.level > 0.02; i++) G.stepFast(1);
  });

test('Chapter Three loads: its checkpoints, objective and the lighthouse; no errors', async ({ page }) => {
  await boot(page);
  await step(page, 30);
  const s = await state(page);
  expect(s.chapter).toBe(3);
  expect(s.checkpoint).toBe('slipway');
  expect(s.objective).toBe('Swim out to the skiff');
  expect(await page.evaluate(() => (window as any).__GAME.game.level.checkpointIds)).toEqual(['slipway', 'skiff', 'bar', 'lagoon', 'stairs']);
  // The lighthouse scan loaded (its meshes are the only ones this large).
  expect(
    await page.evaluate(() => {
      let n = 0;
      (window as any).__GAME.game.scene.traverse((o: any) => {
        if (o.isMesh && o.geometry?.attributes?.position?.count > 15000) n++;
      });
      return n;
    }),
  ).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('swimming: down the slipway into the sea, out onto the sandbar, on to the skiff and aboard (autopilot)', async ({ page }) => {
  test.setTimeout(test.info().timeout * 2);
  await boot(page);
  await page.evaluate(() => (window as any).__GAME.autopilot('swim'));
  let s = await state(page);
  const modes = new Set<string>();
  for (let i = 0; i < 80 && s.autopilot?.state === 'running'; i++) {
    await step(page, 30);
    s = await state(page);
    modes.add(s.mode);
  }
  console.log(s.autopilot?.log.join('\n'));
  expect(s.autopilot?.state, s.autopilot?.message).toBe('done');
  expect(modes.has('swim')).toBe(true);
  expect(await page.evaluate(() => (window as any).__GAME.game.player.swims)).toBeGreaterThan(0);
  expect(s.flags).toContain('skiff.boarded');
  expect(s.mode).toBe('ride');
  expect(s.checkpoint).toBe('skiff');
  expect(s.falls).toBe(0);
  expect(errors).toEqual([]);
});

test('the bar: aground at low water; over it on the surge, into the lagoon', async ({ page }) => {
  test.setTimeout(test.info().timeout * 2);
  await boot(page);
  await page.evaluate(() => (window as any).__GAME.teleport('bar'));
  await step(page, 5);
  expect((await state(page)).mode).toBe('ride');
  await toLowWater(page);
  const low = await drive(page, 24, 76, 60 * 3, true);
  expect(low.bumps).toBeGreaterThan(0);
  expect(low.z).toBeLessThan(70);
  expect((await state(page)).flags).not.toContain('lagoon.reached');
  // Back at the bar checkpoint (outside it, pointing in): wait for the engine's breath, then go.
  await page.evaluate(() => (window as any).__GAME.teleport('bar'));
  await step(page, 5);
  await page.evaluate(() => {
    const G = (window as any).__GAME;
    const L = G.game.level;
    for (let i = 0; i < 60 * 10 && L.coast.level > 0.02; i++) G.stepFast(1);
    for (let i = 0; i < 60 * 10 && L.coast.level < 0.05; i++) G.stepFast(1);
  });
  const over = await drive(page, 24, 78, 60 * 6);
  expect(over.z).toBeGreaterThan(74);
  expect((await state(page)).flags).toContain('lagoon.reached');
  expect(errors).toEqual([]);
});

test('docking at the lighthouse and climbing the three flights to the gallery door ends the chapter', async ({ page }) => {
  test.setTimeout(test.info().timeout * 2);
  await boot(page);
  await page.evaluate(() => (window as any).__GAME.teleport('lagoon'));
  await step(page, 5);
  const foot = await page.evaluate(() => (window as any).__GAME.game.level.coast.stairFoot.toArray() as number[]);
  await drive(page, foot[0], foot[2] - 2, 60 * 12);
  const dock = await page.evaluate(() => {
    const G = (window as any).__GAME;
    const g = G.game;
    G.stepFast(20);
    const focused = g.interactions.focused?.id;
    G.press('interact');
    G.stepFast(5);
    return { focused, mode: g.player.mode, cp: g.checkpoints.current.id };
  });
  expect(dock.focused).toBe('stairs');
  expect(dock.mode).toBe('move');
  expect(dock.cp).toBe('stairs');
  const climb = await page.evaluate(() => {
    const G = (window as any).__GAME;
    const g = G.game;
    const T = (window as any).__THREE;
    const lw = (x: number, y: number, z: number) => new T.Vector3(24 + (x - 0.4), y - 3.6, 100 + (z - 0.5));
    const path = [lw(0.4, 4.2, -6.9), lw(-0.4, 4.2, -6.9), lw(-0.4, 6.2, -10.8), lw(0.4, 6.2, -10.8), lw(0.4, 8.2, -6.6), g.level.coast.door];
    const heights: number[] = [];
    for (const p of path) {
      for (let i = 0; i < 240; i++) {
        const f = g.player.feet;
        const d = Math.hypot(p.x - f.x, p.z - f.z);
        if (d < 0.35) break;
        G.setCamera(Math.atan2(p.x - f.x, p.z - f.z) + Math.PI, 0.3);
        G.setInput({ moveX: 0, moveY: Math.min(1, d), jumpHeld: false });
        G.stepFast(1);
      }
      heights.push(g.player.feet.y);
    }
    G.setInput(null);
    return heights;
  });
  // Lower landing, half landing, gallery.
  expect(climb[0]).toBeGreaterThan(0.4);
  expect(climb[2]).toBeGreaterThan(2.4);
  expect(climb[4]).toBeGreaterThan(4.4);
  await step(page, 60 * 10);
  const s = await state(page);
  expect(s.flags).toContain('tide.finished');
  expect(s.complete).toBe(true);
  await expect(page.locator('.screen .card h2')).toHaveText('The Low Tide');
  expect(errors).toEqual([]);
});

test('the Watch boat hears the engine, spots the skiff and the catch puts Mara back aboard', async ({ page }) => {
  await boot(page, '&watch=1');
  const r = await page.evaluate(() => {
    const G = (window as any).__GAME;
    const g = G.game;
    const L = g.level;
    const w = L.patrol;
    G.teleport('lagoon');
    G.stepFast(5);
    w.reset(w.track.at(Math.PI + 0.5), -1);
    w.graceT = 0;
    let heard = -1;
    let alert = -1;
    for (let i = 0; i < 60 * 6; i++) {
      // Idle the engine at half throttle in a slow circle, in the open.
      G.setCamera(i * 0.01, 0.35);
      G.setInput({ moveX: 0, moveY: 0.5, jumpHeld: false });
      G.stepFast(1);
      if (heard < 0 && w.heard > 0) heard = i;
      if (alert < 0 && w.state === 'alert') alert = i;
      if (alert >= 0 && i > alert + 120) break;
    }
    G.setInput(null);
    // Now sit still in its lamp until it gets her.
    const c0 = w.catches;
    for (let i = 0; i < 60 * 8 && w.catches === c0; i++) G.stepFast(1);
    G.stepFast(5);
    return { heard, alert, caught: w.catches > c0, mode: g.player.mode, cp: g.checkpoints.current.id };
  });
  expect(r.heard).toBeGreaterThanOrEqual(0);
  expect(r.alert).toBeGreaterThan(0);
  expect(r.caught).toBe(true);
  expect(r.cp).toBe('lagoon');
  expect(r.mode).toBe('ride');
  expect(errors).toEqual([]);
});

test('Chapter Two offers Chapter Three; the title screen lists it', async ({ page }) => {
  errors.length = 0;
  await page.goto('/?test=1&dev=1&chapter=2');
  await page.waitForFunction(() => (window as any).__GAME?.ready, null, { timeout: 120_000 });
  await page.evaluate(() => (window as any).__GAME.game.complete({ title: 'Test', body: 'Test' }));
  await expect(page.locator('.screen [data-a="next"]')).toHaveText('Continue: Chapter Three');
});
