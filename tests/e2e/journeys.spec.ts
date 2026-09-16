// WHAT: The six journeys of BUILD_PLAN §13.2 — start, move, undo, resign,
//       resume, picker.
// HOW:  Each drives the built site the way a player would: menu, board clicks
//       projected through the live camera, and the panels' own text as the
//       assertion.
// WHY:  These are a regression net, not a description of a new design. They
//       are written against the layout as it stands TODAY and must be green
//       before §13.3 moves a line of CSS, or the rewrite has nothing holding
//       it. Three of them exist because their bug reached a shipped build:
//       resume (the saved game rebuilt the wrong board), and start/resign
//       (the computers played on behind the menu).

import { test, expect } from './fixtures';
import { bootBoard, clickSquare, startGame, tapControl } from './board';

test.describe('the six journeys', () => {
  test('start a game', async ({ page }) => {
    await bootBoard(page);
    await startGame(page);

    // The menu is gone and the game is waiting on the player, not on itself.
    await expect(page.getByRole('dialog', { name: 'MapChess menu' })).toBeHidden();
    await expect(page.locator('.status-bar')).toContainText('White to move');
    await expect(page.locator('.record')).toContainText('No moves yet.');
  });

  test('play a move', async ({ page }) => {
    await bootBoard(page);
    await startGame(page);

    await clickSquare(page, 'e2');
    await clickSquare(page, 'e4');

    await expect(page.locator('.record')).toContainText('e4');
    await expect(page.locator('.status-bar')).toContainText('Black to move');
  });

  test('undo it', async ({ page }) => {
    await bootBoard(page);
    await startGame(page);

    await clickSquare(page, 'e2');
    await clickSquare(page, 'e4');
    await expect(page.locator('.record')).toContainText('e4');

    await tapControl(page, 'Take back your last move');

    await expect(page.locator('.record')).toContainText('No moves yet.');
    await expect(page.locator('.status-bar')).toContainText('White to move');
  });

  test('resign', async ({ page }) => {
    await bootBoard(page);
    await startGame(page, 'Play White');

    // Deliberately two presses: a blocking confirm() would freeze the render
    // loop, so the button arms itself and says "Sure?" instead.
    await tapControl(page, 'Resign');
    await expect(page.locator('.controls__confirm')).toBeVisible();
    await tapControl(page, 'Resign');

    await expect(page.locator('.gameover')).toBeVisible();
    await expect(page.locator('.gameover')).toContainText('resign', { ignoreCase: true });
  });

  test('resume after a reload', async ({ page }) => {
    await bootBoard(page);
    await startGame(page);

    await clickSquare(page, 'e2');
    await clickSquare(page, 'e4');
    await expect(page.locator('.record')).toContainText('e4');

    await page.reload();
    await bootBoard(page);

    // The bug this journey exists for: a resumed game has to rebuild the same
    // board, not the default one, and come back with its moves intact.
    const menu = page.getByRole('dialog', { name: 'MapChess menu' });
    const resume = menu.getByRole('button', { name: 'Resume game' });
    await expect(resume).toBeEnabled();
    await resume.click();

    await expect(menu).toBeHidden();
    await expect(page.locator('.record')).toContainText('e4');
  });

  test('open the picker', async ({ page }) => {
    await bootBoard(page);
    await startGame(page);

    await tapControl(page, 'Choose a place on the map');

    const picker = page.locator('.area-picker');
    await expect(picker).toBeVisible();
    await expect(page.getByLabel('Search a place')).toBeVisible();
  });
});
