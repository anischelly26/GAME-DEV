import { test, expect, type Page } from '@playwright/test';

/**
 * Input regression checks driven by real browser mouse and keyboard events (Playwright's page.mouse
 * and page.keyboard), addressing review findings R1 (look units/sensitivity), R2 (menu input
 * leaking into gameplay), R3 (hints) and R7 (cinematic lock/skip).
 *
 * Camera look is applied by the render loop, which keeps running in test mode, so these tests wait
 * for animation frames after mouse motion. The simulation itself is still stepped explicitly.
 */

const BASE = 0.0022; // radians per pixel at sensitivity 1 (BASE_RADIANS_PER_PIXEL)

async function boot(page: Page, query = '?test=1&dev=1'): Promise<void> {
  await page.goto(`/${query}`);
  await page.waitForFunction(() => (window as any).__GAME?.ready, null, { timeout: 120_000 });
}
const frames = (page: Page, n = 3) =>
  page.evaluate((k) => new Promise<void>((resolve) => {
    let left = k;
    const tick = () => (--left <= 0 ? resolve() : requestAnimationFrame(tick));
    requestAnimationFrame(tick);
  }), n);
const cam = (page: Page) => page.evaluate(() => ({ yaw: (window as any).__GAME.game.camera.yaw as number, pitch: (window as any).__GAME.game.camera.pitch as number }));
const state = (page: Page) => page.evaluate(() => (window as any).__GAME.state());
const step = (page: Page, n: number) => page.evaluate((k) => (window as any).__GAME.stepFast(k), n);

/** Drag-look with the right mouse button by (dx, dy) pixels in small real mouse moves. */
async function drag(page: Page, dx: number, dy: number): Promise<void> {
  await page.mouse.move(640, 360);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(640 + dx, 360 + dy, { steps: 10 });
  await page.mouse.up({ button: 'right' });
  await frames(page, 4);
}

async function setSensitivity(page: Page, value: number): Promise<void> {
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-s="sensitivity"]')).toBeVisible();
  await page.locator('[data-s="sensitivity"]').fill(String(value));
  await page.locator('[data-a="resume"]').click();
  await expect(page.locator('.screen')).toHaveClass(/hidden/);
}

test.describe('mouse look (R1)', () => {
  test('100 px of drag turns the camera by sensitivity x 0.0022 rad/px, at every setting', async ({ page }) => {
    await boot(page);
    await step(page, 10);
    for (const setting of [1, 0.2, 3]) {
      if (setting !== 1) await setSensitivity(page, setting);
      await page.evaluate(() => (window as any).__GAME.setCamera(0, 0.32));
      await frames(page);
      const before = await cam(page);
      await drag(page, 100, 0);
      const after = await cam(page);
      const expected = -100 * BASE * setting;
      expect(after.yaw - before.yaw, `yaw delta at sensitivity ${setting}`).toBeCloseTo(expected, 3);
    }
  });

  test('one pixel is a tiny change; vertical limits clamp; invert-Y flips', async ({ page }) => {
    await boot(page);
    await step(page, 10);
    await page.evaluate(() => (window as any).__GAME.setCamera(0, 0.32));
    await frames(page);
    let before = await cam(page);
    await drag(page, 1, 1);
    let after = await cam(page);
    expect(Math.abs(after.yaw - before.yaw)).toBeLessThan(0.005);
    expect(after.pitch - before.pitch).toBeCloseTo(BASE, 4);
    // Far down / far up hit the documented limits and stay there.
    await drag(page, 0, 2000);
    expect((await cam(page)).pitch).toBeCloseTo(1.2, 5);
    await drag(page, 0, -4000);
    expect((await cam(page)).pitch).toBeCloseTo(-0.6, 5);
    // Invert vertical look via the real settings UI.
    await page.evaluate(() => (window as any).__GAME.setCamera(0, 0.3));
    await page.keyboard.press('Escape');
    await page.locator('[data-s="invertY"]').check();
    await page.locator('[data-a="resume"]').click();
    await frames(page);
    before = await cam(page);
    await drag(page, 0, 100);
    after = await cam(page);
    expect(after.pitch - before.pitch).toBeCloseTo(-100 * BASE, 3);
  });

  test('pointer-locked look in normal play mode uses the same scale', async ({ page }) => {
    await boot(page, '?dev=1&quality=low');
    await page.locator('[data-a="start"]').click({ timeout: 120_000 });
    await frames(page, 6);
    const locked = await page.evaluate(() => !!document.pointerLockElement);
    test.skip(!locked, 'This browser refused pointer lock; drag-look is covered above.');
    await page.mouse.move(640, 360);
    await frames(page, 3);
    const before = await cam(page);
    await page.mouse.move(740, 360, { steps: 10 });
    await frames(page, 4);
    const after = await cam(page);
    expect(after.yaw - before.yaw).toBeCloseTo(-100 * BASE, 2);
  });
});

test.describe('menu input never leaks into gameplay (R2)', () => {
  test('Space, E and Enter pressed while paused do nothing after Resume', async ({ page }) => {
    await boot(page);
    // Stand at the hatch lever, so a leaked E/Enter would pull it.
    await page.evaluate(() => (window as any).__GAME.setPlayer(1.75, 4.6, 27.95, Math.PI));
    await step(page, 30);
    const s0 = await state(page);
    expect(s0.focused).toBe('lever');
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-a="resume"]')).toBeVisible();
    // Move focus off the Resume button so the keys reach the page, not the button.
    await page.locator('.screen .card h2').click();
    for (const key of ['Space', 'KeyE', 'Enter', 'KeyF']) await page.keyboard.press(key);
    await page.locator('[data-a="resume"]').click();
    await step(page, 30);
    const s1 = await state(page);
    expect(s1.feet[1]).toBeCloseTo(s0.feet[1], 2);
    expect(s1.grounded).toBe(true);
    expect(s1.level.failedPulls).toBe(0);
    expect(s1.flags).not.toContain('lever.tried');
  });

  test('Space that activates the focused Resume button does not also jump', async ({ page }) => {
    await boot(page);
    await step(page, 30);
    const s0 = await state(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-a="resume"]')).toBeFocused();
    await page.keyboard.press('Space');
    await expect(page.locator('.screen')).toHaveClass(/hidden/);
    await step(page, 30);
    const s1 = await state(page);
    expect(s1.gameState).toBe('playing');
    expect(s1.feet[1]).toBeCloseTo(s0.feet[1], 2);
  });

  test('pausing mid-jump and resuming continues that jump without a new one', async ({ page }) => {
    await boot(page);
    await step(page, 30);
    await page.evaluate(() => {
      const w = window as any;
      w.__jumps = 0;
      w.__GAME.game.events.on('jump', () => w.__jumps++);
    });
    await page.keyboard.down('Space');
    await step(page, 8);
    await page.keyboard.press('Escape');
    await page.keyboard.up('Space');
    await page.locator('.screen .card h2').click();
    await page.keyboard.press('Space');
    await page.locator('[data-a="resume"]').click();
    await step(page, 90);
    expect(await page.evaluate(() => (window as any).__jumps)).toBe(1);
    expect((await state(page)).grounded).toBe(true);
  });
});

test.describe('lookout reveal pacing (R7)', () => {
  async function lightLookout(page: Page): Promise<void> {
    await page.evaluate(() => (window as any).__GAME.teleport('lookout'));
    await page.evaluate(() => (window as any).__GAME.setPlayer(-0.45, 4.6, 13.5, Math.PI));
    await step(page, 20);
    await page.keyboard.press('KeyE');
    await step(page, 2);
  }

  test('control is held for at most 3.5 s, and pause does not break the lock', async ({ page }) => {
    await boot(page);
    await lightLookout(page);
    expect((await state(page)).flags).toContain('lookout.lit');
    const frozen = () => page.evaluate(() => (window as any).__GAME.game.player.frozen as boolean);
    let locked = 0;
    for (let i = 0; i < 600; i++) {
      if (i === 60) {
        // Pause and resume during the cinematic: control must stay locked.
        await page.keyboard.press('Escape');
        await page.locator('[data-a="resume"]').click();
        expect(await frozen()).toBe(true);
      }
      await step(page, 1);
      if (await frozen()) locked++;
      else if (i > 30) break;
    }
    expect(locked / 60).toBeLessThanOrEqual(3.5);
    const s = await state(page);
    expect(s.flags).toContain('reveal.done');
    expect(s.objective).toBe('Follow the service lights down into the hall');
    expect(await page.evaluate(() => (window as any).__GAME.game.level.engine.routeOpen)).toBe(true);
  });

  test('Space skips the reveal into the same valid state, without duplicated lines', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      const w = window as any;
      w.__lines = [];
      w.__GAME.game.events.on('line', (l: { text: string }) => w.__lines.push(l.text));
    });
    await lightLookout(page);
    await step(page, 25);
    expect(await page.evaluate(() => (window as any).__GAME.game.player.frozen)).toBe(true);
    await expect(page.locator('.skip')).not.toHaveClass(/hidden/);
    await page.keyboard.press('Space');
    await step(page, 3);
    const s = await state(page);
    expect(await page.evaluate(() => (window as any).__GAME.game.player.frozen)).toBe(false);
    expect(await page.evaluate(() => (window as any).__GAME.game.camera.inShot)).toBe(false);
    expect(s.flags).toContain('reveal.done');
    expect(s.checkpoint).toBe('lookout');
    expect(s.objective).toBe('Follow the service lights down into the hall');
    expect(await page.evaluate(() => (window as any).__GAME.game.level.engine.routeOpen)).toBe(true);
    // The skip press must not also have made Mara jump.
    expect(s.grounded).toBe(true);
    await step(page, 60 * 12);
    const lines: string[] = await page.evaluate(() => (window as any).__lines);
    expect(lines.filter((t) => t.includes('Follow the service lights')).length).toBe(1);
    expect(lines.filter((t) => t === 'Who is this?').length).toBe(1);
  });
});

test.describe('hints (R3)', () => {
  test('five idle minutes never reveal or repeat the solution; requested hints escalate', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      const w = window as any;
      w.__lines = [];
      w.__GAME.game.events.on('line', (l: { text: string }) => w.__lines.push(l.text));
    });
    await step(page, 60 * 300);
    let lines: string[] = await page.evaluate(() => (window as any).__lines);
    expect(lines.some((t) => t.includes('Shut the bypass'))).toBe(false);
    expect(lines.filter((t) => t.includes('scratched a diagram')).length).toBeLessThanOrEqual(1);
    // Ask for hints through the real pause menu until the explicit one arrives.
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Escape');
      await page.locator('[data-a="hint"]').click();
      await step(page, 60 * 6);
    }
    lines = await page.evaluate(() => (window as any).__lines);
    expect(lines.filter((t) => t.includes('Shut the bypass')).length).toBe(1);
  });
});

test.describe('real keyboard movement in normal play', () => {
  test('holding W in real time moves Mara', async ({ page }) => {
    await boot(page, '?dev=1&quality=low');
    await page.locator('[data-a="start"]').click({ timeout: 120_000 });
    await frames(page, 10);
    // A real-time check needs real frames: under software rendering (seconds per frame) 0.7 s of
    // holding W is less than one frame, so the result would say nothing about the controls.
    const frameMs = await page.evaluate(
      () =>
        new Promise<number>((res) => {
          const t0 = performance.now();
          requestAnimationFrame(() => requestAnimationFrame(() => res((performance.now() - t0) / 2)));
        }),
    );
    test.skip(frameMs > 150, `Frame time ${Math.round(frameMs)} ms is too slow for a real-time movement check (software rendering).`);
    const before = await state(page);
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(700);
    await page.keyboard.up('KeyW');
    await frames(page, 3);
    const after = await state(page);
    const moved = Math.hypot(after.feet[0] - before.feet[0], after.feet[2] - before.feet[2]);
    expect(moved).toBeGreaterThan(0.8);
  });
});
