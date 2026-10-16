import { test, expect } from '@playwright/test';

/**
 * Sound wiring, in normal play (a real click unlocks audio, as in a browser): the CC0 samples
 * load, every music and ambience bed decodes (the long recordings are trimmed files), and the beds
 * follow the story: the title theme on the first click, the cell's after Begin, the hall's after
 * a checkpoint in the hall. Nobody listens here: this checks wiring and files, not mix or taste.
 */
test('samples load, beds decode, and the music follows the place', async ({ page }) => {
  test.setTimeout(test.info().timeout * 2);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?dev=1&intro=0&quality=low');
  await page.locator('[data-a="start"]').waitFor({ timeout: 120_000 });
  await page.mouse.click(5, 5);
  await expect.poll(() => page.evaluate(() => (window as any).__GAME.game.audio.currentMusic)).toBe('title');
  await page.locator('[data-a="start"]').click();
  await expect.poll(() => page.evaluate(() => (window as any).__GAME.game.audio.currentMusic)).toBe('cell');
  expect(await page.evaluate(() => (window as any).__GAME.game.audio.currentAmbience)).toBe('tomb');
  await expect.poll(() => page.evaluate(() => (window as any).__GAME.game.audio.samplesReady), { timeout: 30_000 }).toBe(true);
  const beds = await page.evaluate(async () => {
    const a = (window as any).__GAME.game.audio;
    const out: Record<string, number | null> = {};
    for (const n of ['title', 'workshop', 'cell', 'hall', 'ending', 'tomb', 'waves']) {
      const b = await a.bed(n);
      out[n] = b ? b.duration : null;
    }
    return out;
  });
  for (const [name, seconds] of Object.entries(beds)) expect(seconds, name).toBeGreaterThan(10);
  // The workshop's rain is generated, not recorded: an 8 s loop.
  const rain = await page.evaluate(async () => ((await (window as any).__GAME.game.audio.bed('rain')) as AudioBuffer | null)?.duration ?? null);
  expect(rain).toBeCloseTo(8, 1);
  await page.evaluate(() => (window as any).__GAME.teleport('route'));
  await expect.poll(() => page.evaluate(() => (window as any).__GAME.game.audio.currentMusic)).toBe('hall');
  expect(errors).toEqual([]);
});
