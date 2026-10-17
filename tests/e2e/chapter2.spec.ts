import { test, expect, type Page } from '@playwright/test';

/**
 * Chapter Two, "The Warders' Green" (?chapter=2): the route from the cove to the playground, the
 * slide, the swing leap to the fallen sea wall, the ladder, the Watch in the lane and on the rim
 * (with ?watch=1), the ending, and the chapter select. Deterministic stepping as in engine.spec.ts.
 */

const errors: string[] = [];
async function boot(page: Page, query = ''): Promise<void> {
  errors.length = 0;
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => (m.type() === 'error' ? errors.push(m.text()) : undefined));
  await page.goto(`/?test=1&dev=1&chapter=2${query}`);
  await page.waitForFunction(() => (window as any).__GAME?.ready, null, { timeout: 120_000 });
}
type State = { feet: number[]; checkpoint: string; flags: string[]; objective: string; mode: string; falls: number; complete: boolean; chapter: number; autopilot: { state: string; message: string; log: string[] } | null };
const state = (page: Page) => page.evaluate(() => (window as any).__GAME.state() as State);
const step = (page: Page, n: number) => page.evaluate((k) => (window as any).__GAME.stepFast(k), n);

/** Sit on the swing from where Mara stands, pump in time with it until it is high, then leap. */
async function swingAndLeap(page: Page, pumpUntil: number): Promise<{ peak: number; theta: number; omega: number }> {
  return page.evaluate((until) => {
    const G = (window as any).__GAME;
    const g = G.game;
    const pg = g.level.playground;
    G.setPlayer(pg.swingSpot.x, pg.swingSpot.y, pg.swingSpot.z - 0.6, 0);
    G.setCamera(Math.PI, 0.3);
    G.stepFast(10);
    for (let i = 0; i < 40 && !pg.swing.settled; i++) G.stepFast(10);
    G.press('interact');
    G.stepFast(2);
    const sw = pg.swing;
    for (let t = 0; t < 60 * 20; t++) {
      const push = Math.abs(sw.omega) < 0.25 ? 1 : Math.sign(sw.omega);
      G.setInput({ moveX: 0, moveY: push, jumpHeld: false });
      G.stepFast(1);
      if (sw.peak >= until && sw.omega > 0 && sw.theta > 0.55) break;
      if (until < 0.5 && sw.peak >= until && sw.omega > 0 && sw.theta > 0.2) break;
    }
    const at = { peak: sw.peak, theta: sw.theta, omega: sw.omega };
    G.setInput({ moveX: 0, moveY: 1, jumpHeld: true });
    G.press('jump');
    G.stepFast(70);
    G.setInput(null);
    G.stepFast(20);
    return at;
  }, pumpUntil);
}

test('Chapter Two loads at dawn: its own checkpoints and objective; no errors', async ({ page }) => {
  await boot(page);
  await step(page, 30);
  const s = await state(page);
  expect(s.chapter).toBe(2);
  expect(s.checkpoint).toBe('cove');
  expect(s.objective).toBe('Climb up from the cove');
  const ids = await page.evaluate(() => (window as any).__GAME.game.level.checkpointIds as string[]);
  expect(ids).toEqual(['cove', 'lane', 'green', 'bowl', 'wall']);
  // The CC BY slide model loaded (not the stand-in).
  expect(await page.evaluate(() => !!(window as any).__GAME.game.scene.getObjectByName('Sketchfab_model') || (window as any).__GAME.game.level.playground.slide.length > 3)).toBe(true);
  expect(errors).toEqual([]);
});

test('the route: up the cove wall, through the gardens and the lane gate, onto the green, down the slide (autopilot)', async ({ page }) => {
  test.setTimeout(test.info().timeout * 2);
  await boot(page);
  await page.evaluate(() => (window as any).__GAME.autopilot());
  let s = await state(page);
  for (let i = 0; i < 60 && s.autopilot?.state === 'running'; i++) {
    await step(page, 60);
    s = await state(page);
  }
  console.log(s.autopilot?.log.join('\n'));
  expect(s.autopilot?.state, s.autopilot?.message).toBe('done');
  expect(s.falls).toBe(0);
  expect(s.checkpoint).toBe('bowl');
  for (const f of ['area.green', 'slide.ridden', 'bowl.reached']) expect(s.flags).toContain(f);
  expect(s.objective).toBe('Get up onto the fallen sea wall');
  expect(errors).toEqual([]);
});

test('the slide: onto the chute from the platform, a ride down, a hop off the end into the playground', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    const G = (window as any).__GAME;
    const g = G.game;
    G.teleport('green');
    G.setPlayer(0, 0, 21.0, 0);
    G.setCamera(Math.PI, 0.3);
    let rode = false;
    let lowest = 99;
    for (let i = 0; i < 60 * 5; i++) {
      G.setInput({ moveX: 0, moveY: i < 120 ? 1 : 0, jumpHeld: false });
      G.stepFast(1);
      if (g.player.mode === 'ride') {
        rode = true;
        lowest = Math.min(lowest, g.player.feet.y);
      }
    }
    G.setInput(null);
    return { rode, lowest, feet: g.player.feet.toArray(), mode: g.player.mode, grounded: g.player.grounded };
  });
  expect(r.rode).toBe(true);
  expect(r.mode).toBe('move');
  expect(r.grounded).toBe(true);
  // Down on the playground floor, past the end of the chute.
  expect(r.feet[1]).toBeLessThan(-2.2);
  expect(r.feet[2]).toBeGreaterThan(27);
  expect((await state(page)).checkpoint).toBe('bowl');
});

test('the swing: pumped high, a leap at the top of a forward swing catches the fallen sea wall', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => (window as any).__GAME.teleport('bowl'));
  const at = await swingAndLeap(page, 1.1);
  expect(at.peak).toBeGreaterThan(1.05);
  const s = await state(page);
  expect(s.flags).toContain('wall.reached');
  expect(s.checkpoint).toBe('wall');
  expect(s.feet[1]).toBeGreaterThan(-0.2);
  expect(errors).toEqual([]);
});

test('the swing: a leap from a low swing falls short (the wall is out of a double jump`s reach)', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => (window as any).__GAME.teleport('bowl'));
  await swingAndLeap(page, 0.35);
  await step(page, 60);
  const s = await state(page);
  expect(s.flags).not.toContain('wall.reached');
  expect(s.feet[1]).toBeLessThan(-2.0);
  // Even a double jump from the floor does not reach the top of the fallen section.
  const best = await page.evaluate(() => {
    const G = (window as any).__GAME;
    const g = G.game;
    G.setPlayer(0, -2.4, 39.0, 0);
    G.setCamera(Math.PI, 0.3);
    G.stepFast(10);
    G.setInput({ moveX: 0, moveY: 1, jumpHeld: true });
    G.press('jump');
    G.stepFast(18);
    G.press('jump');
    let top = -99;
    for (let i = 0; i < 90; i++) {
      G.stepFast(1);
      top = Math.max(top, g.player.feet.y);
    }
    G.setInput(null);
    return { top, flags: g.progression.list() };
  });
  expect(best.flags).not.toContain('wall.reached');
});

test('the ladder takes Mara from the playground back up to the slide platform', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    const G = (window as any).__GAME;
    const g = G.game;
    const pg = g.level.playground;
    G.teleport('bowl');
    G.setPlayer(pg.ladderFoot.x + 0.9, pg.ladderFoot.y, pg.ladderFoot.z + 0.6, Math.PI);
    G.stepFast(10);
    const focused = g.interactions.focused?.id;
    G.press('interact');
    G.stepFast(3);
    const riding = g.player.mode === 'ride';
    G.stepFast(60 * 3);
    return { focused, riding, mode: g.player.mode, feet: g.player.feet.toArray() };
  });
  expect(r.focused).toBe('ladder');
  expect(r.riding).toBe(true);
  expect(r.mode).toBe('move');
  expect(Math.abs(r.feet[1])).toBeLessThan(0.1);
});

test('the lane Watch: the hedges hide Mara; in the open lane it gets her (back to the lane checkpoint)', async ({ page }) => {
  await boot(page, '&watch=1');
  const r = await page.evaluate(() => {
    const G = (window as any).__GAME;
    const g = G.game;
    const w = g.level.laneWatch;
    G.teleport('lane');
    w.reset(10, 1);
    w.graceT = 0;
    G.setPlayer(-3.4, 0, -6.5, 0);
    let maxSus = 0;
    for (let i = 0; i < 60 * 6; i++) {
      G.stepFast(1);
      maxSus = Math.max(maxSus, w.suspicion);
    }
    w.reset(8, 1);
    w.graceT = 0;
    const wp = w.position();
    G.setPlayer(0.9, 0, wp.z + 4, Math.PI);
    const c0 = w.catches;
    let caughtAt = -1;
    for (let i = 0; i < 60 * 8; i++) {
      G.stepFast(1);
      if (w.catches > c0) {
        caughtAt = i;
        break;
      }
    }
    G.stepFast(10);
    return { maxSus, caughtAt, cp: g.checkpoints.current.id, feet: g.player.feet.toArray() };
  });
  expect(r.maxSus).toBe(0);
  expect(r.caughtAt).toBeGreaterThan(0);
  const cp = await page.evaluate(() => (window as any).__GAME.game.checkpoints.get('lane').feet.toArray() as number[]);
  expect(Math.hypot(r.feet[0] - cp[0], r.feet[2] - cp[2])).toBeLessThan(0.5);
  expect(errors).toEqual([]);
});

test('the rim Watch hears the swing, comes to look, and sees Mara still swinging', async ({ page }) => {
  await boot(page, '&watch=1');
  const r = await page.evaluate(() => {
    const G = (window as any).__GAME;
    const g = G.game;
    const rim = g.level.rimWatch;
    const pg = g.level.playground;
    G.teleport('bowl');
    rim.reset(4, -1);
    rim.graceT = 0;
    G.setPlayer(pg.swingSpot.x, pg.swingSpot.y, pg.swingSpot.z - 0.6, 0);
    G.setCamera(Math.PI, 0.3);
    G.stepFast(10);
    G.press('interact');
    G.stepFast(2);
    const sw = pg.swing;
    let heardAt = -1;
    let alertAt = -1;
    for (let t = 0; t < 60 * 12; t++) {
      const push = Math.abs(sw.omega) < 0.25 ? 1 : Math.sign(sw.omega);
      G.setInput({ moveX: 0, moveY: push, jumpHeld: false });
      G.stepFast(1);
      if (heardAt < 0 && rim.heard > 0) heardAt = t;
      if (rim.state === 'alert') {
        alertAt = t;
        break;
      }
    }
    G.setInput(null);
    return { heardAt, alertAt };
  });
  expect(r.heardAt).toBeGreaterThan(0);
  expect(r.alertAt).toBeGreaterThan(r.heardAt);
});

test('tall grass and the concrete pipe hide Mara from a Watch that would otherwise see her', async ({ page }) => {
  await boot(page, '&watch=1');
  const r = await page.evaluate(() => {
    const G = (window as any).__GAME;
    const g = G.game;
    const L = g.level;
    const w = L.rimWatch;
    G.teleport('bowl');
    const t = L.village.tallGrass.find((x: { y: number }) => x.y < -1);
    const inGrass = new (g.player.feet.constructor)((t.x0 + t.x1) / 2, t.y, (t.z0 + t.z1) / 2);
    const out = { hiddenInGrass: L.isHidden(inGrass), hiddenOnFloor: L.isHidden(new (g.player.feet.constructor)(0, -2.4, 30)) };
    const p = L.playground.tunnel;
    return { ...out, hiddenInPipe: L.isHidden(new (g.player.feet.constructor)((p.x0 + p.x1) / 2, -2.38, (p.z0 + p.z1) / 2)), watchRange: w.range };
  });
  expect(r.hiddenInGrass).toBe(true);
  expect(r.hiddenOnFloor).toBe(false);
  expect(r.hiddenInPipe).toBe(true);
});

test('the ending: across the yard to the causeway gate completes the chapter and offers Chapter Three', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    const G = (window as any).__GAME;
    G.teleport('wall');
    G.setCamera(Math.PI, 0.25);
    for (let i = 0; i < 60 * 8; i++) {
      G.setInput({ moveX: 0, moveY: 1, jumpHeld: false });
      G.stepFast(1);
      if (G.game.progression.has('green.finished')) break;
    }
    G.setInput(null);
  });
  await step(page, 60 * 9);
  const s = await state(page);
  expect(s.complete).toBe(true);
  await expect(page.locator('.screen .card h2')).toHaveText("The Warders' Green");
  await expect(page.locator('.screen [data-a="next"]')).toHaveText('Continue: Chapter Three');
  expect(errors).toEqual([]);
});

test('Chapter One is still the default, and its completion card offers Chapter Two', async ({ page }) => {
  errors.length = 0;
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?test=1&dev=1');
  await page.waitForFunction(() => (window as any).__GAME?.ready, null, { timeout: 120_000 });
  expect((await state(page)).chapter).toBe(1);
  await page.evaluate(() => (window as any).__GAME.game.complete({ title: 'Test', body: 'Test' }));
  await expect(page.locator('.screen [data-a="next"]')).toHaveText('Continue: Chapter Two');
  expect(errors).toEqual([]);
});

test('the title screen lists the other chapters and goes there', async ({ page }) => {
  await page.goto('/?dev=1&quality=low');
  await page.waitForSelector('.screen [data-chapter="3"]', { timeout: 120_000 });
  await expect(page.locator('.screen [data-chapter="3"]')).toHaveText('Chapter Three: The Low Tide');
  await page.waitForSelector('.screen [data-chapter="2"]', { timeout: 120_000 });
  await expect(page.locator('.screen [data-chapter="2"]')).toHaveText("Chapter Two: The Warders' Green");
  await page.locator('.screen [data-chapter="2"]').click();
  await page.waitForURL(/chapter=2/);
  await page.waitForSelector('.screen [data-chapter="1"]', { timeout: 120_000 });
  await expect(page.locator('.screen .card p').first()).toContainText("The Warders' Green");
  // The CC BY models are credited on the title screen.
  await expect(page.locator('.screen .card .credits')).toContainText('Katie Wolfe');
});
