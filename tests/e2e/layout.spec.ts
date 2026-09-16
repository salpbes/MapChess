// WHAT: The promises §13.3 makes about the shape of the page, at both widths.
// HOW:  Boots a real game and measures: what the page scrolls, how much of the
//       screen the HUD takes at rest, and whether the two buttons a player
//       needs without asking are on screen.
// WHY:  The six journeys prove the game still works at 390px; they do not
//       prove it is usable, because a journey clicks through whatever is in
//       front of it. Every regression Phase 12 shipped was a layout fault that
//       a behaviour test would have walked straight past.

import { test, expect } from './fixtures';
import { bootBoard, startGame } from './board';

test.describe('the shape of the page', () => {
  test('never scrolls sideways', async ({ page }) => {
    await bootBoard(page);
    await startGame(page);

    const { scrollWidth, innerWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
  });

  test('keeps the board clear at rest, and the way out and the way in on screen', async ({
    page,
  }) => {
    await bootBoard(page);
    await startGame(page);

    const phone = test.info().project.name === 'phone';
    const sheetBody = page.locator('.sheet__body');
    const menu = page.getByRole('button', { name: 'Menu — new game, resume, change area' });

    if (!phone) {
      // Above the breakpoint the drawer does not exist: the panels are the
      // columns they always were, and its chrome never paints.
      await expect(page.locator('.sheet__chrome')).toBeHidden();
      await expect(page.locator('.column')).toBeVisible();
      await expect(page.locator('.briefing')).toBeVisible();
      return;
    }

    // The gazetteer is something you ask for, so at rest it is not on the board.
    await expect(sheetBody).toBeHidden();

    // What is on the board at rest is the bar, and it stays out of the way.
    const bar = page.locator('.sheet__chrome');
    await expect(bar).toBeVisible();
    const box = await bar.boundingBox();
    const height = await page.evaluate(() => window.innerHeight);
    expect(box?.height ?? height).toBeLessThan(height * 0.2);

    // The way out of the game, and the reason a beginner can play it at all.
    await expect(menu).toBeVisible();
    await expect(page.getByRole('button', { name: /^Tips/ })).toBeVisible();
  });

  test('opens the gazetteer already unfolded', async ({ page }) => {
    test.skip(test.info().project.name !== 'phone', 'The drawer only exists below the breakpoint.');

    await bootBoard(page);
    await startGame(page);

    await page.locator('.sheet__tab', { hasText: 'The field' }).click();

    // Arriving at a collapsed panel would make the reader ask twice for one
    // thing: the tab IS the request to read it.
    await expect(page.locator('.briefing__body')).toBeVisible();
    await expect(page.locator('.briefing')).toContainText('Ground');
  });
});
