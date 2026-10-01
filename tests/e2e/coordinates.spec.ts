// WHAT: The board's coordinates round its edge.
// HOW:  Reads the coordinates group off the live scene — what is shown, and
//       which letters are lit — rather than judging a screenshot.
// WHY:  The coaching says "play e4". These are how a beginner finds e4, so they
//       are on unless turned off, and the square a player picks up lights its
//       own letter and number, which is how the system is learned.

import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

import { bootBoard, clickSquare, startGame, tapControl } from './board';

async function coordinates(page: Page): Promise<{ shown: boolean; count: number; lit: string[] }> {
  return page.evaluate(() => {
    let shown = false;
    let count = 0;
    const lit: string[] = [];
    /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access,
       @typescript-eslint/no-unsafe-call */
    (window.__mapchess?.stage as any).scene.traverse((node: any) => {
      if (node.name !== 'coordinates') return;
      shown = node.visible === true;
      for (const child of node.children as any[]) {
        count += 1;
        if (child.userData.lit === true) lit.push(child.userData.coordinate as string);
      }
    });
    /* eslint-enable */
    return { shown, count, lit: lit.sort() };
  });
}

test.describe('board coordinates', () => {
  test('are on from the start, a to h and 1 to 8', async ({ page }) => {
    await bootBoard(page);
    await startGame(page);
    const c = await coordinates(page);
    expect(c.shown).toBe(true);
    expect(c.count).toBe(16);
    expect(c.lit).toEqual([]);
  });

  test("light the picked-up piece's letter and number", async ({ page }) => {
    await bootBoard(page);
    await startGame(page);
    await clickSquare(page, 'e2');
    // Move the pointer off the board, so what is lit is the selection, not the hover.
    await page.mouse.move(2, 2);
    await expect.poll(async () => (await coordinates(page)).lit).toEqual(['2', 'e']);

    // Put it down again and nothing stays lit.
    await clickSquare(page, 'e2');
    await page.mouse.move(2, 2);
    await expect.poll(async () => (await coordinates(page)).lit).toEqual([]);
  });

  test('turn off, and stay off', async ({ page }) => {
    await bootBoard(page);
    await startGame(page);
    await tapControl(page, 'Hide the board coordinates');
    expect((await coordinates(page)).shown).toBe(false);

    // Remembered, like the other view switches.
    await bootBoard(page);
    expect((await coordinates(page)).shown).toBe(false);
  });
});
