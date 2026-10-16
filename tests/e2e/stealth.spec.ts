import { test, expect, type Page } from '@playwright/test';

/**
 * The Watch: a sentry automaton patrolling the engine collar's deck (stealth). Automated runs leave
 * it off unless `?watch=1`; these checks turn it on. Same deterministic stepping as engine.spec.ts.
 */

const errors: string[] = [];
async function boot(page: Page, watch = true): Promise<void> {
  errors.length = 0;
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => (m.type() === 'error' ? errors.push(m.text()) : undefined));
  await page.goto(watch ? '/?test=1&dev=1&watch=1' : '/?test=1&dev=1');
  await page.waitForFunction(() => (window as any).__GAME?.ready, null, { timeout: 120_000 });
  await page.evaluate(() => {
    const w = window as any;
    w.__lines = [];
    w.__sfx = [];
    w.__GAME.game.events.on('line', (l: { speaker: string; text: string }) => w.__lines.push(`${l.speaker}: ${l.text}`));
    w.__GAME.game.events.on('sfx', (e: { name: string }) => w.__sfx.push(e.name));
  });
}
const step = (page: Page, n: number) => page.evaluate((k) => (window as any).__GAME.stepFast(k), n);
type Sentry = { state: string; suspicion: number; angle: number; catches: number; stuns: number; enabled: boolean; visible: boolean; pos: number[] };
const sentry = (page: Page) =>
  page.evaluate(() => {
    const s = (window as any).__GAME.game.level.engine.sentry;
    return { state: s.state, suspicion: s.suspicion, angle: s.angle, catches: s.catches, stuns: s.stuns, enabled: s.enabled, visible: s.group.visible, pos: s.position().toArray() } as Sentry;
  });

/** At the engine gantry with the collar braked and held at boarding height. */
async function collarHeld(page: Page): Promise<void> {
  await page.evaluate(() => (window as any).__GAME.teleport('engine'));
  await page.evaluate(() => (window as any).__GAME.game.interactions.get('brake').interact());
  for (let i = 0; i < 20 && (await page.evaluate(() => (window as any).__GAME.game.level.engine.collar.mode)) !== 'held'; i++) await step(page, 30);
  expect(await page.evaluate(() => (window as any).__GAME.game.level.engine.collar.mode)).toBe('held');
}

/**
 * Put the sentry at `angleFromGap` round the ring from the boarding gap, travelling `dir`, and Mara
 * on the deck `ahead` metres along the ring in front of it (negative: behind it), `lift` above it.
 */
async function stage(page: Page, angleFromGap: number, dir: number, ahead: number, lift = 0.05): Promise<void> {
  await page.evaluate(
    ([a, d, ahead, lift]) => {
      const G = (window as any).__GAME;
      const e = G.game.level.engine;
      const s = e.sentry;
      s.reset(e.sentryGap + a);
      s.graceT = 0;
      s.dir = d;
      s.place();
      const r = s.ring.radius;
      const at = s.angle + (d * ahead) / r;
      G.setPlayer(Math.sin(at) * r, e.collar.deckY + lift, Math.cos(at) * r, 0);
    },
    [angleFromGap, dir, ahead, lift],
  );
}

test('off by default in automated runs: no sentry on the collar', async ({ page }) => {
  await boot(page, false);
  await page.evaluate(() => (window as any).__GAME.teleport('engine'));
  await step(page, 60);
  const s = await sentry(page);
  expect(s.enabled).toBe(false);
  expect(s.visible).toBe(false);
  expect(errors).toEqual([]);
});

test('it patrols the collar deck, sees Mara in its lamp, raises the alarm and returns her to the gantry', async ({ page }) => {
  await boot(page);
  await collarHeld(page);
  // On its round: it moves along the deck.
  const a0 = (await sentry(page)).angle;
  await step(page, 60);
  const moved = await sentry(page);
  expect(moved.state === 'patrol' || moved.state === 'look').toBe(true);
  expect(Math.abs(moved.angle - a0)).toBeGreaterThan(0.1);
  expect(Math.abs(moved.pos[1] - (await page.evaluate(() => (window as any).__GAME.game.level.engine.collar.deckY)))).toBeLessThan(0.01);

  // Mara 2.5 m in front of it on the deck. Its lamp sweeps side to side, so it may take a moment to
  // find her; once it has, suspicion fills in about a second, then the alarm.
  await stage(page, 0.8, -1, 2.5);
  const detect = await page.evaluate(() => {
    const G = (window as any).__GAME;
    const s = G.game.level.engine.sentry;
    let firstSuspicious = -1;
    for (let i = 0; i < 60 * 8; i++) {
      G.stepFast(1);
      if (firstSuspicious < 0 && s.suspicion > 0.05) firstSuspicious = i;
      if (s.state === 'alert') return { alertAt: i, firstSuspicious };
    }
    return { alertAt: -1, firstSuspicious };
  });
  expect(detect.firstSuspicious).toBeGreaterThanOrEqual(0);
  // Fair warning: more than half a second between the "?" and the "!".
  expect((detect.alertAt - detect.firstSuspicious) / 60).toBeGreaterThan(0.6);
  expect((detect.alertAt - detect.firstSuspicious) / 60).toBeLessThan(1.5);
  expect(await page.evaluate(() => (window as any).__sfx as string[])).toContain('watchAlert');

  // It closes in and catches her: back to the engine gantry checkpoint, the sentry back on its round.
  const before = (await sentry(page)).catches;
  for (let i = 0; i < 20 && (await sentry(page)).catches === before; i++) await step(page, 6);
  const after = await sentry(page);
  expect(after.catches).toBe(before + 1);
  expect(after.state).toBe('patrol');
  const st = await page.evaluate(() => (window as any).__GAME.state());
  const cp = await page.evaluate(() => (window as any).__GAME.game.checkpoints.get('engine').feet.toArray() as number[]);
  expect(st.checkpoint).toBe('engine');
  expect(Math.hypot(st.feet[0] - cp[0], st.feet[2] - cp[2])).toBeLessThan(0.5);
  await step(page, 30);
  const lines = await page.evaluate(() => (window as any).__lines as string[]);
  expect(lines).toContain('Watch: Inmate out of bounds. Halt!');
  expect(lines).toContain('Watch: Inmate returned to the gantry.');
  expect(await page.evaluate(() => (window as any).__sfx as string[])).toContain('watchCatch');
  // A catch is not a fall.
  expect(st.falls).toBe(0);
  expect(errors).toEqual([]);
});

test('the engine column blocks its sight; out of its cone it sees nothing', async ({ page }) => {
  await boot(page);
  await collarHeld(page);
  const r = await page.evaluate(() => {
    const G = (window as any).__GAME;
    const g = G.game;
    const e = g.level.engine;
    const s = e.sentry;
    s.reset(e.sentryGap + 0.8);
    s.dir = 1;
    s.place();
    const R = s.ring.radius;
    const deck = e.collar.deckY;
    const chestAt = (dA: number) => {
      const a = s.angle + dA;
      return new (s.position().constructor)(Math.sin(a) * R, deck + 1.0, Math.cos(a) * R);
    };
    /** Turn its head to face `chest` (if it can) and ask whether it sees it. */
    const sees = (chest: any) => {
      const eye = s.position().setY(deck + 1.42);
      const to = chest.clone().sub(eye).setY(0).normalize();
      let best = { yaw: 0, err: Infinity };
      for (let yaw = -Math.PI; yaw <= Math.PI; yaw += 0.01) {
        s.headYaw = yaw;
        const f = s.facing();
        const err = Math.acos(Math.max(-1, Math.min(1, f.x * to.x + f.z * to.z)));
        if (err < best.err) best = { yaw, err };
      }
      s.headYaw = best.yaw;
      return { inCone: best.err < 0.05, sees: s.canSee(chest, g.player.collider) as boolean, dist: chest.distanceTo(eye) as number };
    };
    // 40 degrees round the ring: a clear chord. 120 degrees: the chord passes through the column.
    const clear = sees(chestAt(0.7));
    const hidden = sees(chestAt(2.1));
    s.headYaw = 0;
    // Straight behind it, close: outside the cone.
    const behind = s.canSee(chestAt(-0.3), g.player.collider) as boolean;
    return { clear, hidden, behind };
  });
  expect(r.clear.inCone).toBe(true);
  expect(r.clear.sees).toBe(true);
  expect(r.hidden.inCone).toBe(true);
  expect(r.hidden.dist).toBeLessThan(7.5);
  expect(r.hidden.sees).toBe(false);
  expect(r.behind).toBe(false);
  expect(errors).toEqual([]);
});

test('a ground pound beside it knocks it out; it sees nothing until it comes round', async ({ page }) => {
  await boot(page);
  await collarHeld(page);
  // Just behind it (out of its lamp), in the air.
  await stage(page, 0.8, 1, -0.9, 2.4);
  await step(page, 4);
  await page.evaluate(() => (window as any).__GAME.press('pound'));
  for (let i = 0; i < 12 && !(await page.evaluate(() => (window as any).__GAME.game.player.grounded)); i++) await step(page, 5);
  await step(page, 2);
  const s = await sentry(page);
  expect(s.stuns).toBe(1);
  expect(s.state).toBe('stunned');
  expect(await page.evaluate(() => (window as any).__sfx as string[])).toContain('watchStun');
  // Knocked out: Mara can stand right in front of it.
  await page.evaluate(() => {
    const G = (window as any).__GAME;
    const s = G.game.level.engine.sentry;
    const r = s.ring.radius;
    const at = s.angle + (s.dir * 1.6) / r;
    G.setPlayer(Math.sin(at) * r, G.game.level.engine.collar.deckY + 0.05, Math.cos(at) * r, 0);
  });
  await step(page, 60 * 3);
  const out = await sentry(page);
  expect(out.state).toBe('stunned');
  expect(out.suspicion).toBe(0);
  // About six seconds later it comes round, sees her and grows suspicious.
  await step(page, 60 * 3 + 30);
  const back = await sentry(page);
  expect(back.state === 'patrol' || back.state === 'alert').toBe(true);
  expect(back.suspicion).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('out of sight for long enough, it searches and then goes back to its round', async ({ page }) => {
  await boot(page);
  await collarHeld(page);
  await stage(page, 0.8, -1, 2.5);
  for (let i = 0; i < 32 && (await sentry(page)).state !== 'alert'; i++) await step(page, 15);
  expect((await sentry(page)).state).toBe('alert');
  // Mara slips off the deck back to the gantry, out of its reach.
  await page.evaluate(() => {
    const G = (window as any).__GAME;
    const cp = G.game.checkpoints.get('engine').feet;
    G.setPlayer(cp.x, cp.y, cp.z, 0);
  });
  const seen = new Set<string>();
  for (let i = 0; i < 40; i++) {
    await step(page, 15);
    const s = await sentry(page);
    seen.add(s.state);
    if (s.state === 'patrol' && seen.has('search')) break;
  }
  expect(seen.has('search')).toBe(true);
  const s = await sentry(page);
  expect(s.state).toBe('patrol');
  expect(s.catches).toBe(0);
  expect(errors).toEqual([]);
});

test('sneaking aboard behind it: brake, board as it passes, ride up unseen', async ({ page }) => {
  test.setTimeout(test.info().timeout * 2);
  await boot(page);
  await collarHeld(page);
  // It has just passed the boarding gap, heading away; Mara steps aboard behind it at the lever.
  await page.evaluate(() => {
    const G = (window as any).__GAME;
    const e = G.game.level.engine;
    const s = e.sentry;
    s.reset(e.sentryGap);
    s.graceT = 0;
    // Away from the deck lever, which sits just round from the gap.
    const lever = e.deckLeverAnchor;
    const leverAngle = Math.atan2(lever.x, lever.z);
    s.dir = Math.sin(leverAngle - e.sentryGap) > 0 ? -1 : 1;
    s.angle = e.sentryGap + s.dir * 0.35;
    s.place();
  });
  await step(page, 30);
  await page.evaluate(() => {
    const G = (window as any).__GAME;
    const e = G.game.level.engine;
    const lever = e.deckLeverAnchor;
    const r = Math.hypot(lever.x, lever.z) + 0.6;
    const a = Math.atan2(lever.x, lever.z);
    G.setPlayer(Math.sin(a) * r, e.collar.deckY + 0.05, Math.cos(a) * r, 0);
  });
  await step(page, 10);
  await page.evaluate(() => (window as any).__GAME.game.interactions.get('deck-lever').interact());
  const mode = () => page.evaluate(() => (window as any).__GAME.game.level.engine.collar.mode as string);
  for (let i = 0; i < 30 && (await mode()) !== 'top'; i++) await step(page, 30);
  expect(await mode()).toBe('top');
  const s = await sentry(page);
  expect(s.catches).toBe(0);
  expect(s.state === 'patrol' || s.state === 'look').toBe(true);
  // She rode up with the collar.
  const feetY = await page.evaluate(() => (window as any).__GAME.game.player.feet.y);
  const deckY = await page.evaluate(() => (window as any).__GAME.game.level.engine.collar.deckY);
  expect(Math.abs(feetY - deckY)).toBeLessThan(0.2);
  expect(errors).toEqual([]);
});
