// WHAT: A capture on the real board — the taken piece falls and is gone, the
//       ground throws up its dust, the move sounds like the ground it lands
//       on — and a player who has asked for less motion sees the piece simply
//       go, as it always did.
// HOW:  A frame watcher counts the dust in the scene on every frame, so a
//       burst that lives less than a second cannot slip between two polls.
// WHY:  The unit tests pin the fall's direction and its end on a toy scene;
//       this is the same effect on the board the game actually builds, where
//       the victim has to leave the pieces' bookkeeping before the attacker
//       arrives on its square, and the audio graph has to be one the browser
//       accepts.

import type { Page } from '@playwright/test';

import { test, expect } from './fixtures';
import { bootBoard, notesTab, playMoves, startGame, tapControl } from './board';

/** Starts counting, every frame, the most dust there has been in the scene at once. */
async function watchDust(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __dust: number };
    w.__dust = 0;
    const look = (): void => {
      let bursts = 0;
      window.__mapchess?.stage.scene.traverse((o) => {
        if (o.name === 'capture-burst') bursts += 1;
      });
      w.__dust = Math.max(w.__dust, bursts);
      requestAnimationFrame(look);
    };
    requestAnimationFrame(look);
  });
}

const dustSeen = (page: Page) =>
  page.evaluate(() => (window as unknown as { __dust: number }).__dust);

/** What the pieces group holds: the 32 pieces, a falling victim, its dust. */
const inPieces = (page: Page) =>
  page.evaluate(() => {
    let group: { children: unknown[] } | null = null;
    window.__mapchess?.stage.scene.traverse((o) => {
      if (o.name === 'pieces') group = o;
    });
    return (group as { children: unknown[] } | null)?.children.length ?? -1;
  });

test.describe('captures', () => {
  test('knock the taken piece over, throw up the ground, and clear away', async ({ page }) => {
    const faults: string[] = [];
    page.on('pageerror', (e) => faults.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error' && !m.text().includes('ERR_BLOCKED_BY_CLIENT'))
        faults.push(m.text());
    });
    await bootBoard(page);
    await startGame(page);
    await tapControl(page, 'Turn the sound on');
    // On a phone the sound is in the drawer, which covers the board until it is shut.
    const drawer = notesTab(page, 'game');
    if ((await drawer.getAttribute('aria-expanded').catch(() => null)) === 'true') {
      await drawer.click();
    }
    await playMoves(page, [
      ['e2', 'e4'],
      ['d7', 'd5'],
    ]);
    expect(await inPieces(page)).toBe(32);

    await watchDust(page);
    await playMoves(page, [['e4', 'd5']]);
    await expect.poll(() => dustSeen(page)).toBeGreaterThan(0);
    // The victim falls and sinks, and then it and its dust are gone.
    await expect.poll(() => inPieces(page)).toBe(31);
    expect(faults, faults.join('\n')).toEqual([]);
  });

  test('simply take the piece for a player who has asked for less motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await bootBoard(page);
    await startGame(page);
    await playMoves(page, [
      ['e2', 'e4'],
      ['d7', 'd5'],
    ]);
    await watchDust(page);
    await playMoves(page, [['e4', 'd5']]);
    expect(await inPieces(page)).toBe(31);
    await page.waitForTimeout(500);
    expect(await dustSeen(page)).toBe(0);
  });
});
