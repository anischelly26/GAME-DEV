import { test, expect, type Page } from '@playwright/test';

/**
 * Game feel (docs/MOVEMENT_2_0.md, Phase B) in the movement lab (?lab=1) and in the chapters:
 * air poses, squash and stretch, the head bump, the fall camera, footsteps by material, the swim
 * and skiff clips, and a scripted lap of the lab. The Watch is not in the lab; the chapter checks
 * run without it (no ?watch=1) because they only read the ground under Mara.
 */

const errors: string[] = [];
async function boot(page: Page, query: string): Promise<void> {
  errors.length = 0;
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => (m.type() === 'error' ? errors.push(m.text()) : undefined));
  await page.goto(`/?test=1&dev=1&${query}`);
  await page.waitForFunction(() => (window as any).__GAME?.ready, null, { timeout: 120_000 });
}
type State = { feet: number[]; grounded: boolean; mode: string; falls: number; chapter: number; checkpoint: string; level: Record<string, unknown>; autopilot: { state: string; message: string; log: string[] } | null };
const state = (page: Page) => page.evaluate(() => (window as any).__GAME.state() as State);
const stepFast = (page: Page, n: number) => page.evaluate((k) => (window as any).__GAME.stepFast(k), n);

/** Step `n` frames with rendering (the avatar and camera update per frame); returns per-frame samples. */
function sample(page: Page, n: number, opts: { jumpAt?: number; poundAt?: number; move?: [number, number] } = {}) {
  return page.evaluate(
    ([frames, o]) => {
      const G = (window as any).__GAME;
      const g = G.game;
      const out: Array<{ y: number; vy: number; grounded: boolean; height: number; fallArms: number; flail: number; dirY: number }> = [];
      const d = new (G.THREE ?? (window as any).__THREE).Vector3();
      if (o.move) G.setInput({ moveX: o.move[0], moveY: o.move[1], jumpHeld: false });
      for (let i = 0; i < frames; i++) {
        if (o.jumpAt === i) {
          G.setInput({ moveX: o.move?.[0] ?? 0, moveY: o.move?.[1] ?? 0, jumpHeld: true });
          G.press('jump');
        }
        if (o.poundAt === i) G.press('pound');
        G.step(1);
        g.camera.camera.getWorldDirection(d);
        const f = g.avatar.feel;
        out.push({ y: g.player.feet.y, vy: g.player.velocity.y, grounded: g.player.grounded, height: f.height, fallArms: f.fallArms, flail: f.flail, dirY: d.y });
      }
      G.setInput(null);
      return out;
    },
    [n, opts] as [number, typeof opts],
  );
}

test('the movement lab loads: one checkpoint, its stations, no errors', async ({ page }) => {
  await boot(page, 'lab=1');
  await stepFast(page, 30);
  const s = await state(page);
  expect(s.chapter).toBe(0);
  expect(s.checkpoint).toBe('start');
  expect(s.grounded).toBe(true);
  expect(errors).toEqual([]);
});

test('a jump stretches on take-off, shows the fall in the arms, and squashes on landing', async ({ page }) => {
  await boot(page, 'lab=1');
  await page.evaluate(() => (window as any).__GAME.setPlayer(0, 0, -6, 0));
  await stepFast(page, 20);
  const frames = await sample(page, 75, { jumpAt: 2 });
  const takeoff = frames.slice(2, 12);
  expect(Math.max(...takeoff.map((f) => f.height))).toBeGreaterThan(1.06);
  // The arms come up once she is falling.
  const falling = frames.filter((f) => !f.grounded && f.vy < -3);
  expect(falling.length).toBeGreaterThan(3);
  expect(Math.max(...falling.map((f) => f.fallArms))).toBeGreaterThan(0.4);
  // An ordinary jump never windmills.
  expect(Math.max(...frames.map((f) => f.flail))).toBeLessThan(0.05);
  const landed = frames.findIndex((f, i) => i > 10 && f.grounded);
  expect(landed).toBeGreaterThan(10);
  expect(Math.min(...frames.slice(landed, landed + 8).map((f) => f.height))).toBeLessThan(0.98);
  // Back to her normal shape within half a second.
  expect(Math.abs(frames[frames.length - 1].height - 1)).toBeLessThan(0.01);
});

test('the 10 m drop: windmilling arms, the camera looks down, a big squash, no fall respawn', async ({ page }) => {
  await boot(page, 'lab=1');
  // On the top landing of the ramp tower (x 8.5..11.5, z 22.8..26.8, 10 m up), near its east
  // edge, facing east with the camera behind her; then walk off it.
  await page.evaluate(() => (window as any).__GAME.setPlayer(11.0, 10, 25, Math.PI / 2));
  await page.evaluate(() => (window as any).__GAME.setCamera(-Math.PI / 2, 0.3));
  await stepFast(page, 20);
  expect((await state(page)).feet[1]).toBeCloseTo(10, 1);
  const frames = await sample(page, 110, { move: [0, 1] });
  const air = frames.filter((f) => !f.grounded);
  expect(air.length).toBeGreaterThan(30);
  expect(Math.max(...air.map((f) => f.flail))).toBeGreaterThan(0.5);
  // The view tips down during the fall (direction's y falls), more than 0.1 rad below where it began.
  const before = Math.asin(frames[0].dirY);
  const lowest = Math.min(...air.map((f) => Math.asin(f.dirY)));
  expect(before - lowest).toBeGreaterThan(0.1);
  // Landed: grounded on the yard floor (she is briefly 'grounded' as she slides over the edge).
  const landed = frames.findIndex((f) => f.grounded && f.y < 0.5);
  expect(landed).toBeGreaterThan(0);
  expect(Math.min(...frames.slice(landed, landed + 8).map((f) => f.height))).toBeLessThan(0.85);
  const s = await state(page);
  expect(s.feet[1]).toBeLessThan(0.1);
  expect(s.falls).toBe(0);
  expect((s.level as { maxImpact: number }).maxImpact).toBeGreaterThan(20);
});

test('jumping under the low beam bumps her head; the same jump in the open does not', async ({ page }) => {
  await boot(page, 'lab=1');
  await page.evaluate(() => {
    const w = window as any;
    w.__bumps = 0;
    w.__GAME.game.events.on('bump', () => w.__bumps++);
  });
  await page.evaluate(() => (window as any).__GAME.setPlayer(0, 0, -6, 0));
  await stepFast(page, 20);
  await sample(page, 50, { jumpAt: 1 });
  expect(await page.evaluate(() => (window as any).__bumps)).toBe(0);
  await page.evaluate(() => (window as any).__GAME.setPlayer(5.5, 0, -4.5, 0));
  await stepFast(page, 20);
  const frames = await sample(page, 50, { jumpAt: 1 });
  expect(await page.evaluate(() => (window as any).__bumps)).toBe(1);
  // She stops rising at the beam: her feet never get above 2.1 - 1.5 m.
  expect(Math.max(...frames.map((f) => f.y))).toBeLessThan(0.65);
});

test('footsteps by material: each lab pad, the green lane and lawn, the sand bar', async ({ page }) => {
  await boot(page, 'lab=1');
  const surfaces = await page.evaluate(() => {
    const G = (window as any).__GAME;
    const out: string[] = [];
    for (let i = 0; i < 7; i++) {
      G.setPlayer((i - 3) * 4, 0.1, -11.5, 0);
      G.stepFast(15);
      out.push(G.game.groundSurface());
    }
    return out;
  });
  expect(surfaces).toEqual(['stone', 'metal', 'wood', 'grass', 'gravel', 'sand', 'water']);

  await boot(page, 'chapter=2');
  const green = await page.evaluate(() => {
    const G = (window as any).__GAME;
    const at = (x: number, z: number) => {
      G.setPlayer(x, 0.1, z, 0);
      G.stepFast(15);
      return G.game.groundSurface();
    };
    G.teleport('cove');
    G.stepFast(15);
    const cove = G.game.groundSurface();
    return { cove, lane: at(0, -20), lawn: at(-12, 12), yard: at(0, 50) };
  });
  expect(green).toEqual({ cove: 'gravel', lane: 'gravel', lawn: 'grass', yard: 'stone' });

  await boot(page, 'chapter=3');
  const coast = await page.evaluate(() => {
    const G = (window as any).__GAME;
    G.teleport('slipway');
    G.stepFast(15);
    const slipway = G.game.groundSurface();
    // The first sandbar's crest (dry at low water); the seabed is tagged sand whatever the tide.
    G.setPlayer(1, 2, 13, 0);
    G.stepFast(40);
    const p = G.game.player;
    return { slipway, bar: p.grounded ? G.game.physics.taggedSurface(p.groundCollider?.handle) : 'airborne' };
  });
  expect(coast).toEqual({ slipway: 'stone', bar: 'sand' });
  expect(errors).toEqual([]);
});

test('swimming uses the swim clips: treading water at rest, the crawl when moving', async ({ page }) => {
  await boot(page, 'lab=1');
  await page.evaluate(() => (window as any).__GAME.setPlayer(0, -1.0, 41, 0));
  await stepFast(page, 30);
  expect((await state(page)).mode).toBe('swim');
  const still = await page.evaluate(() => {
    const G = (window as any).__GAME;
    G.step(40);
    const a = G.game.avatar.actions;
    return { idle: a.get('swimIdle')?.getEffectiveWeight() ?? -1, fwd: a.get('swimFwd')?.getEffectiveWeight() ?? -1, walk: a.get('walk').getEffectiveWeight() };
  });
  expect(still.idle).toBeGreaterThan(0.7);
  expect(still.walk).toBeLessThan(0.01);
  const moving = await page.evaluate(() => {
    const G = (window as any).__GAME;
    G.setInput({ moveX: 0, moveY: 1, jumpHeld: false });
    G.step(60);
    G.setInput(null);
    const a = G.game.avatar.actions;
    return { idle: a.get('swimIdle').getEffectiveWeight(), fwd: a.get('swimFwd').getEffectiveWeight(), speed: G.game.player.speed };
  });
  expect(moving.speed).toBeGreaterThan(1.5);
  expect(moving.fwd).toBeGreaterThan(0.7);
});

test('aboard the skiff Mara steers it (the driving clip), Chapter Three', async ({ page }) => {
  await boot(page, 'chapter=3');
  await page.evaluate(() => (window as any).__GAME.teleport('skiff'));
  const clip = await page.evaluate(() => {
    const G = (window as any).__GAME;
    G.step(30);
    return { mode: G.game.player.mode, pose: G.game.player.ride?.pose ?? null, shot: G.game.avatar.oneShot?.name ?? null };
  });
  expect(clip).toEqual({ mode: 'ride', pose: 'boat', shot: 'drive' });
});

test('the pound plate lights under a ground pound', async ({ page }) => {
  await boot(page, 'lab=1');
  await page.evaluate(() => (window as any).__GAME.setPlayer(2, 3, 26, 0));
  await sample(page, 6);
  await sample(page, 60, { poundAt: 0 });
  expect(((await state(page)).level as { plateHits: number }).plateHits).toBe(1);
});

test('a scripted lap of the lab: the gaps, the vaults and the tower with its 10 m drop', async ({ page }) => {
  test.setTimeout(240_000);
  await boot(page, 'lab=1');
  await page.evaluate(() => (window as any).__GAME.autopilot());
  let s = await state(page);
  for (let i = 0; i < 300 && s.autopilot?.state === 'running'; i++) {
    await stepFast(page, 60);
    s = await state(page);
  }
  expect(s.autopilot?.state, `${s.autopilot?.message}\n${s.autopilot?.log.join('\n')}`).toBe('done');
  expect(s.falls).toBe(0);
  expect((s.level as { maxImpact: number }).maxImpact).toBeGreaterThan(20);
  expect(errors).toEqual([]);
});
