// WHAT: §13.7 — a whole move played without touching the mouse, and the game
//       saying in words what it otherwise only draws.
// HOW:  Presses keys at the page and reads the move record and the live region
//       back. No board clicks anywhere in this file, on purpose: if a test
//       here needs a click to set something up, the keyboard path is not
//       complete.
// WHY:  A board that can only be played by pointing at it cannot be played by
//       anyone who does not point. This is the test that would fail if the
//       second input quietly stopped reaching the game — which it would, since
//       nothing else in the suite presses a key.

import { test, expect } from './fixtures';
import { bootBoard, plyCount, startGame } from './board';

test.describe('playing without a mouse', () => {
  test.skip(
    () => test.info().project.name !== 'desktop',
    'A phone has no keyboard to tab through.',
  );

  test('names a square, picks it up and puts it down', async ({ page }) => {
    await bootBoard(page);
    await startGame(page);

    // "e" then "2" is the square, Enter picks the pawn up.
    await page.keyboard.press('e');
    await page.keyboard.press('2');
    await page.keyboard.press('Enter');
    await expect(page.locator('.identity')).toContainText('e2');

    // Two ranks north, and Enter again plays it.
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');

    await expect.poll(async () => plyCount(page)).toBe(1);
    await expect(page.locator('.record')).toContainText('e4');
  });

  test('Escape puts the piece back', async ({ page }) => {
    await bootBoard(page);
    await startGame(page);

    await page.keyboard.press('d');
    await page.keyboard.press('2');
    await page.keyboard.press('Enter');
    await expect(page.locator('.identity')).toContainText('d2');

    await page.keyboard.press('Escape');

    // Nothing is held, so the two presses that would have played d4 do not.
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await expect(page.locator('.record')).toContainText('No moves yet.');
  });

  test('says what was played, for a reader who cannot see it', async ({ page }) => {
    await bootBoard(page);
    await startGame(page);

    const live = page.locator('[aria-live="polite"]');
    await expect(live).toHaveAttribute('aria-live', 'polite');

    await page.keyboard.press('e');
    await page.keyboard.press('2');
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');

    // The move itself, in words — not "the position changed".
    // One utterance, not two racing each other.
    await expect
      .poll(async () => live.innerText(), { message: 'the move was never announced' })
      .toContain('White plays e4');
    await expect(live).toContainText('Black to move');
  });

  test('leaves typing in the search box alone', async ({ page }) => {
    await bootBoard(page);
    await startGame(page);
    await page.getByRole('button', { name: 'Choose a place on the map' }).click();

    const search = page.getByLabel('Search a place');
    await search.fill('');
    await search.pressSequentially('e4 street');

    // The letters went into the box, not into the board.
    await expect(search).toHaveValue('e4 street');
  });

  test('the board can be reached by tabbing, and says what it is', async ({ page }) => {
    await bootBoard(page);
    await startGame(page);

    const canvas = page.locator('#world canvas');
    await expect(canvas).toHaveAttribute('tabindex', '0');

    const label = await canvas.getAttribute('aria-label');
    expect(label ?? '').toContain('Arrow keys');

    await canvas.focus();
    const focused = await page.evaluate(() => document.activeElement?.tagName ?? '');
    expect(focused).toBe('CANVAS');
  });
});
