// WHAT: Which pieces stand on the board: the original set, an era's set, or a
//       preview of one still being made.
// HOW:  Asks the running board which set each piece came from — every model
//       carries its set in userData — rather than guessing from a screenshot.
// WHY:  Two promises, both invisible until broken. A half-made set must never
//       reach a player: an ANZAC pawn beside a medieval knight is a work in
//       progress, not a board. And the person making the set must be able to
//       see it on real ground as each figure is finished, with the gaps filled
//       so the preview is still a game.

import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

import { bootBoard, startGame, tapControl } from './board';

/** The set the first piece of this colour and type on the board came from. */
async function setOf(page: Page, color: 'white' | 'black', type: string): Promise<string | null> {
  return page.evaluate(
    ([c, t]) => {
      const app = window.__mapchess;
      if (app === undefined) return null;
      let found: string | null = null;
      /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access,
         @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment */
      (app.stage as any).scene.traverse((node: any) => {
        const piece = node.userData?.piece;
        if (found === null && piece?.color === c && piece?.type === t) {
          found = (node.userData.set as string | undefined) ?? 'procedural';
        }
      });
      /* eslint-enable */
      return found;
    },
    [color, type] as const,
  );
}

test.describe('piece sets', () => {
  test('keeps a half-made set away from players, even on its own battlefield', async ({ page }) => {
    await bootBoard(page);
    await startGame(page);
    await tapControl(page, 'Famous fields');
    await page.locator('.area-bar__list-item', { hasText: 'Anzac Cove' }).click();

    // The WW1 set has two pieces of twelve, so Gallipoli is still medieval.
    expect(await page.evaluate(() => window.__mapchess?.pieceSet())).toBe('medieval');
    await expect.poll(() => setOf(page, 'white', 'pawn'), { timeout: 30_000 }).toBe('medieval');
  });

  test('previews an unfinished set, filling its gaps from the original', async ({ page }) => {
    await bootBoard(page, '/?pieces=ww1');
    await startGame(page);

    expect(await page.evaluate(() => window.__mapchess?.pieceSet())).toBe('ww1');
    // The figures that exist are the new ones...
    await expect.poll(() => setOf(page, 'white', 'pawn'), { timeout: 30_000 }).toBe('ww1');
    await expect.poll(() => setOf(page, 'black', 'pawn'), { timeout: 30_000 }).toBe('ww1');
    // ...and the rest of the board is still a full game.
    expect(await setOf(page, 'white', 'knight')).toBe('medieval');
    expect(await setOf(page, 'black', 'king')).toBe('medieval');
  });

  test('never squeezes a figure to make it fit', async ({ page }) => {
    await bootBoard(page, '/?pieces=ww1');
    await startGame(page);
    await expect.poll(() => setOf(page, 'white', 'rook'), { timeout: 30_000 }).toBe('ww1');

    /*
      The WW1 rooks are wider than a square allows at rook height, and their
      author chose their shape over their height. So they are scaled by one
      factor on every axis: a model squeezed on one axis is somebody's work
      quietly changed.
    */
    const scales = await page.evaluate(() => {
      const out: number[][] = [];
      /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access,
         @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment */
      (window.__mapchess?.stage as any).scene.traverse((node: any) => {
        const p = node.userData?.piece;
        if (p?.type === 'rook' && node.userData.set === 'ww1') {
          const s = node.children[0].scale as { x: number; y: number; z: number };
          out.push([s.x, s.y, s.z]);
        }
      });
      /* eslint-enable */
      return out;
    });
    expect(scales.length).toBeGreaterThan(0);
    for (const [x, y, z] of scales) {
      expect(x).toBeCloseTo(y ?? 0, 9);
      expect(z).toBeCloseTo(y ?? 0, 9);
    }
  });
});
