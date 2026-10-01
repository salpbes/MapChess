// WHAT: Trees on and around the board, where the map says there is a wood.
// HOW:  Rievaulx, a wooded valley that ships with its data, so the whole run
//       needs no network. Reads the live scene for the trees and the board's
//       coordinates for proof that a click landed.
// WHY:  Scenery that looks right is only half of it. It must never come between
//       a player and a square, and it must be possible to turn off.

import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

import { bootBoard, clickSquare, startGame, tapControl } from './board';

async function trees(page: Page): Promise<{ count: number; shown: boolean }> {
  return page.evaluate(() => {
    let count = 0;
    let shown = false;
    /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access,
       @typescript-eslint/no-unsafe-call */
    (window.__mapchess?.stage as any).scene.traverse((node: any) => {
      if (node.name === 'trees') shown = node.visible === true;
      if (typeof node.name === 'string' && node.name.startsWith('trees-'))
        count += node.count as number;
    });
    /* eslint-enable */
    return { count, shown };
  });
}

async function goToRievaulx(page: Page): Promise<void> {
  await bootBoard(page);
  await startGame(page);
  await tapControl(page, 'Famous fields');
  await page.locator('.area-bar__list-item', { hasText: 'Rievaulx' }).click();
  await page.locator('.place-title').waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator('.place-title').waitFor({ state: 'hidden', timeout: 15_000 });
}

test.describe('scenery', () => {
  test('grows a wood where the map has one', async ({ page }) => {
    await goToRievaulx(page);
    await expect
      .poll(async () => (await trees(page)).count, { timeout: 30_000 })
      .toBeGreaterThan(500);
    expect((await trees(page)).shown).toBe(true);
  });

  test('never stands between a player and a square', async ({ page }) => {
    await goToRievaulx(page);
    await expect
      .poll(async () => (await trees(page)).count, { timeout: 30_000 })
      .toBeGreaterThan(500);
    // e2 sits among the trees at Rievaulx; the click must still pick the pawn
    // up, which lights its letter and number.
    await clickSquare(page, 'e2');
    await page.mouse.move(2, 2);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const lit: string[] = [];
          /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access,
             @typescript-eslint/no-unsafe-call */
          (window.__mapchess?.stage as any).scene.traverse((n: any) => {
            if (n.userData?.lit === true) lit.push(n.userData.coordinate as string);
          });
          /* eslint-enable */
          return lit.sort();
        }),
      )
      .toEqual(['2', 'e']);
  });

  test('turns off, and stays off', async ({ page }) => {
    await goToRievaulx(page);
    await tapControl(page, 'Hide the trees');
    expect((await trees(page)).shown).toBe(false);

    await bootBoard(page);
    expect((await trees(page)).shown).toBe(false);
  });
});
