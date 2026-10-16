import { test, expect, type Page } from '@playwright/test';

/**
 * Chapter One's opening (the workshop the night before, then Mara wakes up in the cell) and its
 * skip. Automated runs normally start with the opening off; `?intro=1` turns it on.
 */

type GameState = {
  gameState: string;
  feet: number[];
  grounded: boolean;
  objective: string;
  checkpoint: string;
};

const errors: string[] = [];

async function boot(page: Page): Promise<void> {
  errors.length = 0;
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/?test=1&dev=1&intro=1');
  await page.waitForFunction(() => (window as any).__GAME?.ready, null, { timeout: 120_000 });
  await page.evaluate(() => {
    const w = window as any;
    w.__lines = [];
    w.__GAME.game.events.on('line', (l: { text: string }) => w.__lines.push(l.text));
  });
}

const state = (page: Page) => page.evaluate(() => (window as any).__GAME.state() as GameState);
/** Fixed steps, then one render frame (which poses the avatar). */
const step = (page: Page, n: number) => page.evaluate((k) => (window as any).__GAME.stepFast(k), n);
const frozen = (page: Page) => page.evaluate(() => (window as any).__GAME.game.player.frozen as boolean);
const storyText = (page: Page) => page.evaluate(() => (window as any).__GAME.game.hud.storyText as string);
const inShot = (page: Page) => page.evaluate(() => (window as any).__GAME.game.camera.inShot as boolean);
const lines = (page: Page) => page.evaluate(() => (window as any).__lines as string[]);
/** Height of Mara's pelvis above her feet: about 0.1 m lying down, about 0.5 m sitting, about 0.9 m standing. */
const pelvisHeight = (page: Page) =>
  page.evaluate(() => {
    const g = (window as any).__GAME.game;
    const pelvis = g.avatar.root.getObjectByName('pelvis');
    return pelvis.matrixWorld.elements[13] - g.player.feet.y;
  });
/** The workshop set is struck and the cell's borrowed lights, the moon and the sky light are back. */
const breakwaterRestored = (page: Page) =>
  page.evaluate(() => {
    const g = (window as any).__GAME.game;
    const level = g.level;
    return {
      workshopVisible: level.workshop.visible as boolean,
      lampHome: level.cellLamp.light.parent === level.cellLamp.group,
      environment: g.scene.environmentIntensity as number,
      letterbox: g.hud.letterboxed as boolean,
    };
  });
const cellSpawn = (page: Page) => page.evaluate(() => (window as any).__GAME.game.checkpoints.get('cell').feet.toArray() as number[]);

test('the opening: the workshop the night before, Mara wakes on the cell floor, then control returns', async ({ page }) => {
  test.setTimeout(test.info().timeout * 2);
  await boot(page);
  await step(page, 3);
  expect(await frozen(page)).toBe(true);
  expect(await storyText(page)).toContain('Saltmere');
  expect((await state(page)).objective).toBe('');
  // Saltmere: sitting at her bench in the workshop, far from the prison.
  expect((await state(page)).feet[2]).toBeGreaterThan(300);
  const sitting = await pelvisHeight(page);
  expect(sitting).toBeGreaterThan(0.3);
  expect(sitting).toBeLessThan(0.8);
  expect((await breakwaterRestored(page)).letterbox).toBe(true);
  await expect(page.locator('.skip')).not.toHaveClass(/hidden/);

  const cards = new Set<string>();
  let lockedSteps = 3;
  let wokeOnCellFloor = false;
  while ((await frozen(page)) && lockedSteps < 60 * 50) {
    const t = await storyText(page);
    if (t) cards.add(t);
    const s = await state(page);
    if (s.feet[2] < 100 && (await pelvisHeight(page)) < 0.35) wokeOnCellFloor = true;
    await step(page, 20);
    lockedSteps += 20;
  }
  // The story reached every beat: the workshop, the refusal, waking up, the chapter title.
  const seen = [...cards].join(' | ');
  expect(seen).toContain('keeps the tide engines of Saltmere running');
  expect(seen).toContain('flood diversion');
  expect(seen).toContain('stayed up to prove the plan was wrong');
  expect(seen).toContain('She woke up somewhere else.');
  expect(seen).toContain('The Quiet Cell');
  expect(wokeOnCellFloor).toBe(true);
  const said = await lines(page);
  expect(said).toContain("Where... This isn't my workshop.");
  expect(said.some((t) => t.includes('Breakwater'))).toBe(true);
  // About 39 s of story, then the player has control.
  expect(lockedSteps / 60).toBeGreaterThan(37);
  expect(lockedSteps / 60).toBeLessThan(41);

  const s = await state(page);
  expect(s.objective).toBe('Open the service hatch');
  expect(s.checkpoint).toBe('cell');
  expect(await inShot(page)).toBe(false);
  expect(await breakwaterRestored(page)).toEqual({ workshopVisible: false, lampHome: true, environment: 0.95, letterbox: false });
  await step(page, 60);
  expect(await storyText(page)).toBe('');
  expect(await pelvisHeight(page)).toBeGreaterThan(0.75);
  expect(errors).toEqual([]);
});

test('skipping the opening ends in the same state as watching it', async ({ page }) => {
  await boot(page);
  await step(page, 30);
  expect(await frozen(page)).toBe(true);
  expect((await state(page)).feet[2]).toBeGreaterThan(300);
  await page.keyboard.press('Space');
  await step(page, 3);
  expect(await frozen(page)).toBe(false);
  expect(await inShot(page)).toBe(false);
  const s = await state(page);
  expect(s.objective).toBe('Open the service hatch');
  expect(s.checkpoint).toBe('cell');
  // Back at the cell spawn, and the skip press must not also have made Mara jump or move.
  const spawn = await cellSpawn(page);
  expect(s.grounded).toBe(true);
  expect(s.feet[0]).toBeCloseTo(spawn[0], 2);
  expect(s.feet[2]).toBeCloseTo(spawn[2], 2);
  expect(await breakwaterRestored(page)).toEqual({ workshopVisible: false, lampHome: true, environment: 0.95, letterbox: false });
  await step(page, 60);
  expect(await storyText(page)).toBe('');
  expect(await pelvisHeight(page)).toBeGreaterThan(0.75);
  await step(page, 60 * 6);
  // Skipped narration is dropped, not queued up; the gameplay line still plays once.
  const said = await lines(page);
  expect(said).not.toContain("Where... This isn't my workshop.");
  expect(said.filter((t) => t.includes('Fresh copper')).length).toBe(1);
  expect(errors).toEqual([]);
});
