import { test, expect, type Page } from '@playwright/test';

/**
 * Secrets and toys: the five chalk "IV" marks (each found where it should be, the shelf one only
 * with a double jump, the hatch one only after a ground pound breaks its boards, one inside a cell
 * with bent bars), the steam whistle, the area titles, and the count on the end card.
 */

const errors: string[] = [];

async function boot(page: Page): Promise<void> {
  errors.length = 0;
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/?test=1&dev=1&quality=low');
  await page.waitForFunction(() => (window as any).__GAME?.ready, null, { timeout: 120_000 });
  await page.evaluate(() => {
    const w = window as any;
    w.__lines = [];
    w.__sfx = [];
    w.__GAME.game.events.on('line', (l: { text: string }) => w.__lines.push(l.text));
    w.__GAME.game.events.on('sfx', (s: { name: string }) => w.__sfx.push(s.name));
  });
}

const step = (page: Page, n: number) => page.evaluate((k) => (window as any).__GAME.stepFast(k), n);
const teleport = (page: Page, id: string) => page.evaluate((i) => (window as any).__GAME.teleport(i), id);
const setPlayer = (page: Page, p: number[], facing = 0) => page.evaluate(({ p, facing }) => (window as any).__GAME.setPlayer(p[0], p[1], p[2], facing), { p, facing });
const has = (page: Page, flag: string) => page.evaluate((f) => (window as any).__GAME.game.progression.has(f) as boolean, flag);
const feet = (page: Page) => page.evaluate(() => (window as any).__GAME.game.player.feet.toArray() as number[]);
const markAt = (page: Page, id: string) => page.evaluate((i) => (window as any).__GAME.game.level.marks.position(i).toArray() as number[], id);
const lines = (page: Page) => page.evaluate(() => (window as any).__lines as string[]);

/**
 * From `from`, facing `yaw`, jump (holding forward if `forward`), then `moves` ('double', 'pound')
 * at the given air times. Steps until Mara lands (or 4 s pass).
 */
const hop = (page: Page, from: number[], yaw: number, forward: boolean, moves: Array<[string, number]>) =>
  page.evaluate(
    ({ from, yaw, forward, moves }) => {
      const G = (window as any).__GAME;
      G.setPlayer(from[0], from[1] + 0.05, from[2], yaw);
      G.stepFast(15);
      G.setCamera(yaw + Math.PI, 0.3);
      let air = 0;
      let next = 0;
      G.setInput({ moveX: 0, moveY: forward ? 1 : 0, jumpHeld: true });
      G.press('jump');
      for (let i = 0; i < 240; i++) {
        if (next < moves.length && air >= moves[next][1]) {
          G.press(moves[next][0] === 'double' ? 'jump' : 'pound');
          next++;
        }
        G.setCamera(yaw + Math.PI, 0.3);
        G.stepFast(1);
        air += 1 / 60;
        if (air > 0.35 && G.game.player.grounded) break;
      }
      G.setInput(null);
      G.stepFast(10);
      return G.game.player.feet.toArray() as number[];
    },
    { from, yaw, forward, moves },
  );

test('the cell, lookout and bent-bar cell marks are found by going to them', async ({ page }) => {
  test.setTimeout(test.info().timeout * 2);
  await boot(page);
  // Mara's cell: beside the bunk, under the tally marks. Not from the spawn.
  await teleport(page, 'cell');
  await step(page, 30);
  expect(await has(page, 'mark.cell')).toBe(false);
  await setPlayer(page, [-1.05, 4.6, 31.45], -Math.PI / 2);
  await step(page, 10);
  expect(await has(page, 'mark.cell')).toBe(true);
  await expect(page.locator('.toast')).toContainText('1 of 5');
  // The lookout: low on the left wall, not from the way in.
  await teleport(page, 'lookout');
  await step(page, 30);
  expect(await has(page, 'mark.lookout')).toBe(false);
  await setPlayer(page, [-1.5, 4.6, 16.4], -Math.PI / 2);
  await step(page, 10);
  expect(await has(page, 'mark.lookout')).toBe(true);
  // Tier three: walk in through the bent bars to the back of the cell.
  await teleport(page, 'breach');
  await step(page, 10);
  const m = await markAt(page, 'open-cell');
  const th = (9 * 2 * Math.PI) / 18;
  const outside = [Math.sin(th) * 11.2 + Math.cos(th) * 0.2, 9.2, Math.cos(th) * 11.2 - Math.sin(th) * 0.2];
  await setPlayer(page, outside, th);
  await step(page, 10);
  await page.evaluate(
    ({ m }) => {
      const G = (window as any).__GAME;
      for (let i = 0; i < 180; i++) {
        const f = G.game.player.feet;
        if (Math.hypot(m[0] - f.x, m[2] - f.z) < 0.7) break;
        G.setCamera(Math.atan2(m[0] - f.x, m[2] - f.z) + Math.PI, 0.3);
        G.setInput({ moveX: 0, moveY: 1, jumpHeld: false });
        G.stepFast(2);
      }
      G.setInput(null);
    },
    { m },
  );
  const inside = await feet(page);
  // She walked in on the cell's own floor (tier three height), not through it.
  expect(inside[1]).toBeGreaterThan(9.0);
  expect(Math.hypot(inside[0], inside[2])).toBeGreaterThan(12.9);
  expect(await has(page, 'mark.open-cell')).toBe(true);
  expect(errors).toEqual([]);
});

test('the shelf mark needs a double jump', async ({ page }) => {
  await boot(page);
  await teleport(page, 'lookout');
  await step(page, 10);
  // A step back from the shelf (closer, her head clips its edge on the way up), facing the breach wall.
  const from = [2.85, 4.6, 20.2];
  const yaw = Math.PI;
  // A single jump falls short: she lands back on the far landing.
  let end = await hop(page, from, yaw, true, []);
  expect(end[1]).toBeLessThan(5.2);
  expect(await has(page, 'mark.shelf')).toBe(false);
  // A double jump at the top of the first carries her onto the shelf, and the mark is hers.
  end = await hop(page, from, yaw, true, [['double', 0.3]]);
  expect(end[1]).toBeGreaterThan(6.6);
  expect(await has(page, 'mark.shelf')).toBe(true);
  expect(errors).toEqual([]);
});

test('the boards break only to a ground pound, and the mark under them is found', async ({ page }) => {
  await boot(page);
  await teleport(page, 'route');
  await step(page, 10);
  const c = await page.evaluate(() => (window as any).__GAME.game.level.boards.centre.toArray() as number[]);
  // Walking on and jumping on the boards does nothing.
  await setPlayer(page, [c[0], c[1] + 0.2, c[2]], 0);
  await step(page, 30);
  await hop(page, [c[0], c[1] + 0.2, c[2]], 0, false, []);
  expect(await has(page, 'boards.broken')).toBe(false);
  expect(await has(page, 'mark.boards')).toBe(false);
  // Mara notices them.
  expect((await lines(page)).some((t) => t.includes('Boards nailed over a hatch'))).toBe(true);
  // Jump, and slam down on them.
  await hop(page, [c[0], c[1] + 0.2, c[2]], 0, false, [['pound', 0.32]]);
  await step(page, 30);
  expect(await has(page, 'boards.broken')).toBe(true);
  expect(await has(page, 'mark.boards')).toBe(true);
  expect(await page.evaluate(() => (window as any).__sfx as string[])).toContain('boardsBreak');
  expect(errors).toEqual([]);
});

test('the steam whistle blows, and has a word for the third pull', async ({ page }) => {
  await boot(page);
  // Let the level's opening lines (the horn, Mara on the copper pipe) play out first.
  await step(page, 60 * 9);
  await teleport(page, 'route');
  await step(page, 10);
  const pull = () => page.evaluate(() => (window as any).__GAME.game.interactions.get('whistle').interact());
  await pull();
  await step(page, 20);
  expect(await page.evaluate(() => (window as any).__sfx as string[])).toContain('whistle');
  // A second pull straight away does nothing: the whistle is still blowing.
  const before = await page.evaluate(() => ((window as any).__sfx as string[]).filter((n) => n === 'whistle').length);
  await pull();
  await step(page, 20);
  expect(await page.evaluate(() => ((window as any).__sfx as string[]).filter((n) => n === 'whistle').length)).toBe(before);
  await step(page, 60 * 3);
  expect(await lines(page)).toContain('...Sorry. I had to.');
  for (let i = 0; i < 2; i++) {
    await pull();
    await step(page, 60 * 2.5);
  }
  await step(page, 60 * 3);
  expect(await lines(page)).toContain('Unscheduled whistle. Pressure loss logged.');
  expect(errors).toEqual([]);
});

test('area titles, the end card count, and restart puts every secret back', async ({ page }) => {
  test.setTimeout(test.info().timeout * 2);
  await boot(page);
  const area = () => page.evaluate(() => (window as any).__GAME.game.hud.areaText as string);
  // Through the hatch: the shaft's title.
  await teleport(page, 'cell');
  await setPlayer(page, [0.4, 4.6, 25.0], Math.PI);
  await step(page, 5);
  expect(await area()).toContain('Maintenance Shaft');
  // The engine and the breach.
  await teleport(page, 'shuttle');
  await step(page, 5);
  const engineAt = await page.evaluate(() => (window as any).__GAME.game.checkpoints.get('engine').feet.toArray() as number[]);
  await setPlayer(page, engineAt, 0);
  await step(page, 5);
  expect(await area()).toContain('Breathing Engine');
  // Two marks, then the ending: the card counts them.
  await setPlayer(page, [-1.05, 4.6, 31.45], 0);
  await step(page, 5);
  await setPlayer(page, [-1.5, 4.6, 16.4], 0);
  await step(page, 5);
  await page.evaluate(() => (window as any).__GAME.teleport('exit'));
  await page.evaluate(() => (window as any).__GAME.game.level.finishEngine());
  await step(page, 60 * 23);
  await expect(page.locator('.screen .stats')).toContainText('2/5');
  await expect(page.locator('.screen .stats')).toContainText('chalk marks');
  // Restart: marks, boards and area titles are fresh.
  await page.evaluate(() => (window as any).__GAME.restart());
  await step(page, 5);
  expect(await page.evaluate(() => (window as any).__GAME.game.level.marks.foundCount)).toBe(0);
  expect(await has(page, 'area.shaft')).toBe(false);
  expect(await page.evaluate(() => (window as any).__GAME.game.level.boards.broken)).toBe(false);
  expect(errors).toEqual([]);
});
