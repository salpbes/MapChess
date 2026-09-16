// WHAT: The promises §13.3 makes about the shape of the page, at both widths.
// HOW:  Boots a real game and measures: what the page scrolls, how much of the
//       screen the HUD takes at rest, and whether the two buttons a player
//       needs without asking are on screen.
// WHY:  The six journeys prove the game still works at 390px; they do not
//       prove it is usable, because a journey clicks through whatever is in
//       front of it. Every regression Phase 12 shipped was a layout fault that
//       a behaviour test would have walked straight past.

import { test, expect } from './fixtures';
import { bootBoard, startGame, tapControl } from './board';

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

  test('the picker is mostly map', async ({ page }) => {
    await bootBoard(page);
    await startGame(page);
    await tapControl(page, 'Choose a place on the map');

    // The panel was a fixed 340px beside the map, so on a phone the one screen
    // whose whole job is choosing a place on a map showed 62px of map.
    const map = await page.locator('.area-picker__map').boundingBox();
    const panel = await page.locator('.area-picker__panel').boundingBox();
    const mapArea = (map?.width ?? 0) * (map?.height ?? 0);
    const panelArea = (panel?.width ?? 0) * (panel?.height ?? 0);

    expect(mapArea).toBeGreaterThan(panelArea);
    expect(map?.width ?? 0).toBeGreaterThan(280);
    expect(map?.height ?? 0).toBeGreaterThan(200);
  });

  test('every overlay fits a phone lying on its side', async ({ page }) => {
    // A landscape phone is not narrow, it is short — about 400px tall. The
    // menu ran past both edges there, putting "Back to the board", the one
    // control that gets you out, below the fold.
    await page.setViewportSize({ width: 844, height: 390 });
    await bootBoard(page);

    const menu = page.getByRole('dialog', { name: 'MapChess menu' });
    const exit = menu.getByRole('button', { name: 'Back to the board' });
    await expect(exit).toBeVisible();

    const box = await exit.boundingBox();
    expect(box).not.toBeNull();
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(390);

    // And it really does dismiss, rather than merely being on screen.
    await exit.click();
    await expect(menu).toBeHidden();
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
