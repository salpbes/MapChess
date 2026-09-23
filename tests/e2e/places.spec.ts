// WHAT: The places offered by name, and the two doors onto them.
// HOW:  Opens the list from the star beside the map button, checks a place
//       carries both a name and a line about the ground, chooses one and
//       watches the area change. Then opens the same list from the menu.
// WHY:  The hardest moment in this game is the first one — a map, a search box
//       and no idea where to go — and this list is the answer to it. Two things
//       are worth pinning: that every entry says something (a bare place name
//       is what this replaced, and it helped nobody), and that the list is ONE
//       list with two ways in. This app has already shipped a phone layout that
//       offered the same control twice.

import { test, expect } from './fixtures';

import { bootBoard, startGame, tapControl } from './board';

test.describe('places offered by name', () => {
  test('names the ground, not just the place', async ({ page }) => {
    await bootBoard(page);
    await startGame(page);
    await tapControl(page, 'Famous fields');

    const items = page.locator('.area-bar__list-item');
    expect(await items.count()).toBeGreaterThan(3);

    // Every one of them earns its row: a name AND why you would go there.
    for (const row of await items.all()) {
      await expect(row.locator('.area-bar__list-name')).not.toBeEmpty();
      await expect(row.locator('.area-bar__list-blurb')).not.toBeEmpty();
    }
  });

  test('takes you there when you choose one', async ({ page }) => {
    await bootBoard(page);
    await startGame(page);

    const summary = page.locator('.area-bar__summary');
    const before = await summary.textContent();

    await tapControl(page, 'Famous fields');
    // Not the first row, which might be where we already are.
    await page.locator('.area-bar__list-item').nth(1).click();

    await expect(summary).not.toHaveText(before ?? '', { timeout: 30_000 });
  });

  test('is reachable from the menu, and is the same list', async ({ page }) => {
    await bootBoard(page);
    await startGame(page);

    // Count the rows the star opens...
    await tapControl(page, 'Famous fields');
    const fromStar = await page.locator('.area-bar__list-item').count();
    await page.keyboard.press('Escape');

    // ...then the rows the menu opens. A second, different list would be a
    // second thing to keep in step, which is how duplicate controls start.
    await tapControl(page, 'Menu — new game, resume, change area');
    await page.getByRole('button', { name: 'Play on famous ground' }).click();
    await expect(page.locator('.area-bar__list-item').first()).toBeVisible();
    expect(await page.locator('.area-bar__list-item').count()).toBe(fromStar);
  });

  test('files the places under their eras', async ({ page }) => {
    await bootBoard(page);
    await startGame(page);
    await tapControl(page, 'Famous fields');

    // Scanned, not read: sections with headings a player looks for.
    const headings = page.locator('.area-bar__list-heading');
    await expect(headings.first()).toBeVisible();
    const labels = await headings.allTextContents();
    expect(labels).toEqual(
      expect.arrayContaining(['Ancient & medieval', 'First World War', 'Second World War']),
    );
    // A heading is not a choice: only the rows are buttons.
    expect(
      await page
        .locator('.area-bar__list-heading')
        .evaluateAll((els) => els.every((e) => e.tagName !== 'BUTTON')),
    ).toBe(true);
    await expect(page.getByRole('group', { name: 'Second World War' })).toContainText(
      'Monte Cassino',
    );
  });

  test('names the place as you arrive, then gets out of the way', async ({ page }) => {
    await bootBoard(page);
    await startGame(page);
    await tapControl(page, 'Famous fields');
    // Rievaulx ships with its data, so the whole arrival runs with no network.
    await page.locator('.area-bar__list-item', { hasText: 'Rievaulx' }).click();

    const title = page.locator('.place-title');
    await expect(title).toBeVisible({ timeout: 30_000 });
    await expect(title.locator('.place-title__name')).toHaveText('Rievaulx');

    // Heard as well as seen, through the app's one live region — not a second
    // one of its own, which would race the move announcements.
    await expect(page.locator('[aria-live="polite"]')).toHaveCount(1);
    await expect(page.locator('[aria-live="polite"]')).toContainText('Rievaulx');

    // It never stands between a player and the board.
    expect(await title.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');

    // And it leaves on its own, with nothing to dismiss.
    await expect(title).toBeHidden({ timeout: 10_000 });
  });
});
