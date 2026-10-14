import { test, expect, type Page } from '@playwright/test';

/**
 * Executable acceptance checks for the first playable slice ("The Quiet Cell").
 * The game runs in test mode: the simulation only advances when the test calls __GAME.step(),
 * so results are deterministic and independent of the machine's frame rate.
 */

type GameState = {
  gameState: string;
  feet: number[];
  grounded: boolean;
  flags: string[];
  objective: string;
  checkpoint: string;
  falls: number;
  complete: boolean;
  focused: string | null;
  prompt: string | null;
  level: { bypassOpen: boolean; pressure: number; hatch: string; failedPulls: number };
  autopilot: { state: string; step: number; total: number; message: string; log: string[] } | null;
};

const errors: string[] = [];

async function boot(page: Page, query = ''): Promise<void> {
  errors.length = 0;
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(`/?test=1&dev=1${query}`);
  await page.waitForFunction(() => (window as any).__GAME?.ready, null, { timeout: 120_000 });
}

const state = (page: Page) => page.evaluate(() => (window as any).__GAME.state() as GameState);
const step = (page: Page, n: number) => page.evaluate((k) => (window as any).__GAME.stepFast(k), n);

/** Step until `pred(state)` is true or `maxSteps` elapse (checked every `chunk` steps). */
async function stepUntil(page: Page, pred: (s: GameState) => boolean, maxSteps: number, chunk = 30): Promise<GameState> {
  let s = await state(page);
  for (let i = 0; i < maxSteps && !pred(s); i += chunk) {
    await step(page, chunk);
    s = await state(page);
  }
  return s;
}

test('boots, renders the cell and shows the objective', async ({ page }) => {
  await boot(page);
  await step(page, 120);
  const s = await state(page);
  expect(s.gameState).toBe('playing');
  expect(s.objective).toBe('Open the service hatch');
  expect(s.checkpoint).toBe('cell');
  expect(s.grounded).toBe(true);
  await expect(page.locator('.objective .text')).toHaveText('Open the service hatch');
  // The canvas must actually show the scene (not a black frame).
  const brightness = await page.evaluate(() => {
    const src = document.querySelector('canvas') as HTMLCanvasElement;
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 36;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(src, 0, 0, 64, 36);
    const d = ctx.getImageData(0, 0, 64, 36).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2];
    return sum / (d.length / 4) / 3;
  });
  expect(brightness).toBeGreaterThan(12);
  expect(errors).toEqual([]);
});

test('movement and jumping respond through the input pipeline', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => (window as any).__GAME.teleport('lookout'));
  // Clear lane: from the lookout rail toward the breach (+Z), camera behind.
  await page.evaluate(() => (window as any).__GAME.setPlayer(0.0, 4.6, 13.4, 0));
  await page.evaluate(() => (window as any).__GAME.setCamera(Math.PI, 0.3));
  await step(page, 10);
  const before = await state(page);
  // Camera behind the player, push the stick forward for half a second.
  await page.evaluate(() => (window as any).__GAME.setInput({ moveX: 0, moveY: 1, jumpHeld: false }));
  await step(page, 30);
  const moved = await state(page);
  const dist = Math.hypot(moved.feet[0] - before.feet[0], moved.feet[2] - before.feet[2]);
  expect(dist).toBeGreaterThan(1.5);
  // Releasing the stick stops the player quickly (no ice skating).
  await page.evaluate(() => (window as any).__GAME.setInput({ moveX: 0, moveY: 0, jumpHeld: false }));
  await step(page, 12);
  const s1 = await state(page);
  await step(page, 30);
  const s2 = await state(page);
  expect(Math.hypot(s2.feet[0] - s1.feet[0], s2.feet[2] - s1.feet[2])).toBeLessThan(0.05);
  // Jump: leaves the ground, rises, and lands again.
  const y0 = s2.feet[1];
  await page.evaluate(() => (window as any).__GAME.press('jump'));
  await page.evaluate(() => (window as any).__GAME.setInput({ moveX: 0, moveY: 0, jumpHeld: true }));
  let apex = y0;
  for (let i = 0; i < 50; i++) {
    await step(page, 1);
    apex = Math.max(apex, (await state(page)).feet[1]);
  }
  await page.evaluate(() => (window as any).__GAME.setInput(null));
  const landed = await stepUntil(page, (s) => s.grounded, 120, 5);
  expect(apex - y0).toBeGreaterThan(1.2);
  expect(landed.grounded).toBe(true);
  expect(errors).toEqual([]);
});

test('lever before closing the bypass only hisses; the puzzle state is unchanged', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => (window as any).__GAME.setPlayer(1.75, 4.6, 27.95, Math.PI));
  const s = await stepUntil(page, (x) => x.focused === 'lever', 60, 5);
  expect(s.prompt).toBe('Pull hatch lever');
  await page.evaluate(() => (window as any).__GAME.press('interact'));
  await step(page, 90);
  const after = await state(page);
  expect(after.level.failedPulls).toBe(1);
  expect(after.level.hatch).toBe('closed');
  expect(after.flags).toContain('lever.tried');
  expect(after.flags).not.toContain('hatch.open');
});

test('full route: puzzle, practice jump, gap, lookout and completion (autopilot, real physics)', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => (window as any).__GAME.autopilot());
  const s = await stepUntil(page, (x) => x.autopilot?.state !== 'running', 60 * 120, 60);
  console.log(s.autopilot?.log.join('\n'));
  expect(s.autopilot?.state, s.autopilot?.message).toBe('done');
  expect(s.complete).toBe(true);
  expect(s.falls).toBe(0);
  for (const f of ['clue.read', 'lever.tried', 'valve.closed', 'hatch.open', 'gap.crossed', 'lookout.reached', 'lookout.lit', 'reveal.done']) {
    expect(s.flags).toContain(f);
  }
  await expect(page.locator('.screen .card h2')).toHaveText('Out of the Quiet Cell');
  expect(errors).toEqual([]);
});

test('falling into the channel recovers at the landing with the hatch still open', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => (window as any).__GAME.teleport('landing'));
  await step(page, 5);
  // Walk off the edge into the drainage channel.
  await page.evaluate(() => (window as any).__GAME.setPlayer(0.5, 4.6, 22.0, Math.PI));
  const s = await stepUntil(page, (x) => x.falls > 0, 300, 10);
  expect(s.falls).toBe(1);
  await step(page, 20);
  const back = await state(page);
  expect(back.checkpoint).toBe('landing');
  expect(back.feet[2]).toBeGreaterThan(24);
  expect(back.feet[1]).toBeGreaterThan(4.5);
  expect(back.level.hatch).toBe('latched');
  expect(back.flags).toContain('hatch.open');
});

test('restart after completion gives a fresh puzzle', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => (window as any).__GAME.autopilot());
  await stepUntil(page, (x) => x.autopilot?.state !== 'running', 60 * 120, 60);
  await page.locator('.screen button[data-a="restart"]').click();
  await step(page, 30);
  const s = await state(page);
  expect(s.complete).toBe(false);
  expect(s.checkpoint).toBe('cell');
  expect(s.level.hatch).toBe('closed');
  expect(s.level.bypassOpen).toBe(true);
  expect(s.flags).toEqual([]);
  expect(s.feet[2]).toBeGreaterThan(28);
  expect(s.objective).toBe('Open the service hatch');
});

test('pause freezes the simulation and resume continues', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => (window as any).__GAME.teleport('landing'));
  await page.evaluate(() => (window as any).__GAME.pause());
  await page.evaluate(() => (window as any).__GAME.setInput({ moveX: 0, moveY: 1, jumpHeld: false }));
  const a = await state(page);
  await step(page, 30);
  const b = await state(page);
  expect(b.gameState).toBe('paused');
  expect(b.feet).toEqual(a.feet);
  await expect(page.locator('.screen .card h2')).toHaveText('The Quiet Cell');
  await page.evaluate(() => (window as any).__GAME.resume());
  await step(page, 30);
  const c = await state(page);
  expect(c.gameState).toBe('playing');
  expect(c.feet).not.toEqual(b.feet);
});

test('measure jump capability (reported, used to validate level dimensions)', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => (window as any).__GAME.teleport('landing'));
  // Long flat run on the far landing + lookout is short; use the landing toward the girder sideways.
  await page.evaluate(() => (window as any).__GAME.setPlayer(-3.3, 4.6, 23.5, Math.PI / 2));
  await page.evaluate(() => (window as any).__GAME.setCamera(-Math.PI / 2, 0.3));
  await step(page, 10);
  await page.evaluate(() => (window as any).__GAME.setInput({ moveX: 0, moveY: 1, jumpHeld: false }));
  await step(page, 18);
  const start = await state(page);
  await page.evaluate(() => (window as any).__GAME.press('jump'));
  await page.evaluate(() => (window as any).__GAME.setInput({ moveX: 0, moveY: 1, jumpHeld: true }));
  let apex = start.feet[1];
  let s = start;
  for (let i = 0; i < 80; i++) {
    await step(page, 1);
    s = await state(page);
    apex = Math.max(apex, s.feet[1]);
    if (i > 5 && s.grounded) break;
  }
  const distance = Math.hypot(s.feet[0] - start.feet[0], s.feet[2] - start.feet[2]);
  console.log(`running jump: horizontal ${distance.toFixed(2)} m, apex ${(apex - start.feet[1]).toFixed(2)} m`);
  expect(distance).toBeGreaterThan(3.0);
});
