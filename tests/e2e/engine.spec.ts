import { test, expect, type Page } from '@playwright/test';

/**
 * Executable checks for the second increment: the parkour practice route and The Breathing Engine.
 * Same deterministic stepping as slice.spec.ts.
 */

type State = {
  gameState: string;
  feet: number[];
  grounded: boolean;
  mode: string;
  flags: string[];
  objective: string;
  checkpoint: string;
  falls: number;
  complete: boolean;
  focused: string | null;
  autopilot: { state: string; step: number; total: number; message: string; log: string[] } | null;
};

const errors: string[] = [];
async function boot(page: Page): Promise<void> {
  errors.length = 0;
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => (m.type() === 'error' ? errors.push(m.text()) : undefined));
  await page.goto('/?test=1&dev=1');
  await page.waitForFunction(() => (window as any).__GAME?.ready, null, { timeout: 120_000 });
}
const state = (page: Page) => page.evaluate(() => (window as any).__GAME.state() as State);
const step = (page: Page, n: number) => page.evaluate((k) => (window as any).__GAME.stepFast(k), n);
const level = (page: Page, expr: string) => page.evaluate(expr);
async function stepUntil(page: Page, pred: (s: State) => boolean, maxSteps: number, chunk = 30): Promise<State> {
  let s = await state(page);
  for (let i = 0; i < maxSteps && !pred(s); i += chunk) {
    await step(page, chunk);
    s = await state(page);
  }
  return s;
}

test('increment route: drops, gap, vault, ledge catch, shuttle, collar, split feed, ram, exit (autopilot)', async ({ page }) => {
  test.setTimeout(test.info().timeout * 2);
  await boot(page);
  // Start at the lookout with the reveal already done, then run only the increment's part of the route.
  await page.evaluate(() => (window as any).__GAME.teleport('route'));
  await page.evaluate(() => (window as any).__GAME.teleport('lookout'));
  await step(page, 5);
  await page.evaluate(() => (window as any).__GAME.autopilot('engine'));
  const s = await stepUntil(page, (x) => x.autopilot?.state !== 'running', 60 * 300, 60);
  console.log(s.autopilot?.log.join('\n'));
  expect(s.autopilot?.state, s.autopilot?.message).toBe('done');
  expect(s.falls).toBe(0);
  for (const f of ['collar.braked', 'collar.ridden', 'ram.caught', 'steam.redirected', 'ram.primed', 'ram.released', 'exit.reached', 'engine.finished']) expect(s.flags).toContain(f);
  expect(s.complete).toBe(true);
  expect(errors).toEqual([]);
});

test('steam curtain pushes Mara back without harm until the bypass is closed', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => (window as any).__GAME.teleport('engine-top'));
  const curtain = await level(page, '__GAME.game.level.engine.curtainProbe()') as { from: number[]; past: number[] };
  await page.evaluate((f) => (window as any).__GAME.setPlayer(f[0], f[1], f[2], 0), curtain.from);
  // Walk straight at the curtain for two seconds.
  await page.evaluate((c) => {
    const g = (window as any).__GAME;
    const yaw = g.game.camera.yaw;
    const dx = c.past[0] - c.from[0];
    const dz = c.past[2] - c.from[2];
    const len = Math.hypot(dx, dz);
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    g.setInput({ moveX: (dx * rx + dz * rz) / len, moveY: (dx * fx + dz * fz) / len, jumpHeld: false });
  }, curtain);
  await step(page, 120);
  const blocked = await state(page);
  // Progress along the walk direction, measured from the start point.
  const along = (f: number[]) => {
    const dx = curtain.past[0] - curtain.from[0];
    const dz = curtain.past[2] - curtain.from[2];
    const len = Math.hypot(dx, dz);
    return ((f[0] - curtain.from[0]) * dx + (f[2] - curtain.from[2]) * dz) / len;
  };
  // The curtain sits about 0.94 m along the walk; the push keeps Mara short of it.
  expect(along(blocked.feet)).toBeLessThan(0.9);
  expect(blocked.falls).toBe(0);
  // Send the feed to the ram, start again from the same point: the same walk now passes the curtain.
  await page.evaluate(() => (window as any).__GAME.game.interactions.get('feed-diverter').interact());
  await step(page, 60);
  await page.evaluate((f) => (window as any).__GAME.setPlayer(f[0], f[1], f[2], 0), curtain.from);
  await step(page, 50);
  const passed = await state(page);
  expect(along(passed.feet)).toBeGreaterThan(1.5);
  expect(passed.flags).toContain('steam.redirected');
});

test('the collar is reversible: brake, ride up, ride down', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => (window as any).__GAME.teleport('engine'));
  const mode = () => level(page, '__GAME.game.level.engine.collar.mode') as Promise<string>;
  expect(await mode()).toBe('cycling');
  await page.evaluate(() => (window as any).__GAME.game.interactions.get('brake').interact());
  for (let i = 0; i < 20 && (await mode()) !== 'held'; i++) await step(page, 30);
  expect(await mode()).toBe('held');
  await page.evaluate(() => (window as any).__GAME.game.interactions.get('deck-lever').interact());
  for (let i = 0; i < 20 && (await mode()) !== 'top'; i++) await step(page, 30);
  expect(await mode()).toBe('top');
  await page.evaluate(() => (window as any).__GAME.game.interactions.get('brake').interact());
  for (let i = 0; i < 20 && (await mode()) !== 'held'; i++) await step(page, 30);
  expect(await mode()).toBe('held');
});

test('a fall from the upper route recovers at the upper gantry with the collar still up', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => (window as any).__GAME.teleport('engine-top'));
  const top = await state(page);
  // Step off into the shaft around the engine column.
  await page.evaluate((y) => (window as any).__GAME.setPlayer(-5.0, y + 0.5, -4.2, 0), top.feet[1]);
  const s = await stepUntil(page, (x) => x.falls > 0, 300, 10);
  expect(s.falls).toBe(1);
  await step(page, 30);
  const back = await state(page);
  expect(back.checkpoint).toBe('engine-top');
  expect(Math.abs(back.feet[1] - top.feet[1])).toBeLessThan(0.3);
  expect(await level(page, '__GAME.game.level.engine.collar.mode')).toBe('top');
});

// ---------------------------------------------------------------- the split feed (R8)

type Feed = { route: string; caught: boolean; ram: number; primed: boolean; straining: boolean; curtainOn: boolean; emptyRises: number };
const feed = (page: Page) =>
  page.evaluate(() => {
    const f = (window as any).__GAME.game.level.engine.feed;
    return { route: f.route, caught: f.caught, ram: f.ram, primed: f.primed, straining: f.straining, curtainOn: f.curtainOn, emptyRises: f.emptyRises } as Feed;
  });
const use = (page: Page, id: string) => page.evaluate((i) => (window as any).__GAME.game.interactions.get(i).interact(), id);
/** Stand Mara on the ram deck, facing its release lever. */
const standOnRam = (page: Page) =>
  page.evaluate(() => {
    const g = (window as any).__GAME;
    const e = g.game.level.engine;
    const deck = e.breachPiston.group.position;
    const lever = e.releaseAnchor;
    const facing = Math.atan2(lever.x - deck.x, lever.z - deck.z);
    g.setPlayer(deck.x, deck.y + 0.05, deck.z, facing);
  });

test('split feed: feeding the ram first sends it up empty; venting, catching and feeding again primes it', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    const w = window as any;
    w.__lines = [];
    w.__GAME.game.events.on('line', (l: { text: string }) => w.__lines.push(l.text));
  });
  await page.evaluate(() => (window as any).__GAME.teleport('engine-top'));
  await step(page, 10);
  let f = await feed(page);
  expect(f.curtainOn).toBe(true);
  expect(f.ram).toBe(0);
  // The natural first try: feed the ram. The steam stops, but the ram leaves without her.
  await use(page, 'feed-diverter');
  await step(page, 60 * 3);
  f = await feed(page);
  expect(f.curtainOn).toBe(false);
  expect(f.ram).toBe(1);
  expect(f.emptyRises).toBe(1);
  // Her remark queues behind the line about the steam stopping.
  await step(page, 60 * 5);
  expect(await page.evaluate(() => (window as any).__lines.some((t: string) => t.includes('Without me')))).toBe(true);
  // Recover entirely from the junction: vent (ram drops, steam returns), catch, feed the ram.
  await use(page, 'feed-diverter');
  await step(page, 60 * 3);
  f = await feed(page);
  expect(f.ram).toBe(0);
  expect(f.curtainOn).toBe(true);
  await use(page, 'ram-catch');
  await use(page, 'feed-diverter');
  await step(page, 60 * 4);
  f = await feed(page);
  expect(f.primed).toBe(true);
  expect(f.straining).toBe(true);
  expect(f.ram).toBe(0);
  expect(f.curtainOn).toBe(false);
  // Board the deck: the release is offered there, and pressing E (real key) carries her up.
  await standOnRam(page);
  await step(page, 20);
  expect((await state(page)).focused).toBe('ram-release');
  await page.keyboard.press('KeyE');
  await step(page, 60 * 3);
  f = await feed(page);
  expect(f.caught).toBe(false);
  expect(f.ram).toBe(1);
  const s = await state(page);
  expect(s.feet[1]).toBeGreaterThan(9.2 + 2.3);
  expect(s.flags).toContain('ram.released');
  expect(errors).toEqual([]);
});

test('split feed: catching the ram at the top holds it out of reach until freed', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => (window as any).__GAME.teleport('engine-top'));
  await use(page, 'feed-diverter');
  await step(page, 60 * 3);
  await use(page, 'ram-catch');
  await use(page, 'feed-diverter');
  await step(page, 60 * 3);
  let f = await feed(page);
  expect(f.ram).toBe(1);
  expect(f.curtainOn).toBe(true);
  expect(f.straining).toBe(true);
  await use(page, 'ram-catch');
  await step(page, 60 * 3);
  f = await feed(page);
  expect(f.ram).toBe(0);
  expect(f.caught).toBe(false);
});

test('split feed: the breach checkpoint reloads primed; a missed jump after riding recovers primed', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => (window as any).__GAME.teleport('breach'));
  await step(page, 10);
  let f = await feed(page);
  expect(f.primed).toBe(true);
  await standOnRam(page);
  await step(page, 20);
  await use(page, 'ram-release');
  await step(page, 60 * 3);
  expect((await feed(page)).ram).toBe(1);
  // Fall off the raised ram into the breach.
  await page.evaluate(() => {
    const e = (window as any).__GAME.game.level.engine;
    const c = e.exitCenter;
    (window as any).__GAME.setPlayer(c.x, c.y - 4, c.z, 0);
  });
  const s = await stepUntil(page, (x) => x.falls > 0 && x.grounded, 60 * 8);
  expect(s.falls).toBeGreaterThan(0);
  expect(s.checkpoint).toBe('breach');
  f = await feed(page);
  expect(f.primed).toBe(true);
  expect(f.ram).toBe(0);
});

test('restart resets the split feed', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => (window as any).__GAME.teleport('engine-top'));
  await use(page, 'ram-catch');
  await use(page, 'feed-diverter');
  await step(page, 30);
  await page.evaluate(() => (window as any).__GAME.restart());
  await step(page, 5);
  const f = await feed(page);
  expect(f).toMatchObject({ route: 'vent', caught: false, ram: 0, curtainOn: true });
});
