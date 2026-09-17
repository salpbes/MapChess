// WHAT: What §13.4 can honestly prove in a headless browser: a real touch
//       sequence moves a piece, the canvas owns its own gestures, and the
//       things a thumb has to hit are big enough to hit.
// HOW:  Drives `page.touchscreen`, which dispatches genuine touch events —
//       Chromium synthesises pointer events with pointerType 'touch' from
//       them, so this exercises the same path a phone does, not a mouse in
//       disguise.
// WHY:  BUILD_PLAN §13.4 says plainly that touch has no seam and is verified
//       on real hardware or not at all. That is true of feel — whether a thumb
//       covers the piece it is moving — and this does not pretend otherwise.
//       It covers the part that IS mechanical, so a regression in the gesture
//       path is caught by the suite rather than by a player.

import { test, expect } from './fixtures';
import { bootBoard, notesTab, squarePoint, startGame } from './board';

test.describe('the board under a finger', () => {
  test.skip(
    () => test.info().project.name !== 'phone',
    'Touch emulation is only enabled on the phone project.',
  );

  test('the canvas keeps its own gestures', async ({ page }) => {
    await bootBoard(page);

    // Without this the browser claims drags and pinches for page scroll and
    // zoom, and an orbit never reaches OrbitControls at all.
    const touchAction = await page
      .locator('#world canvas')
      .evaluate((el) => getComputedStyle(el).touchAction);
    expect(touchAction).toBe('none');
  });

  test('a tap selects, and a second tap moves', async ({ page }) => {
    await bootBoard(page);
    await startGame(page);

    const from = await squarePoint(page, 'e2');
    await page.touchscreen.tap(from.x, from.y);

    // The identity card is behind a tab down here, so the bar carries the line
    // instead: Phase 10's reveal has to reach a phone player without being
    // gone looking for.
    await expect(page.locator('.sheet__peek')).toBeVisible();
    await expect(page.locator('.sheet__peek')).toContainText('·');

    const to = await squarePoint(page, 'e4');
    await page.touchscreen.tap(to.x, to.y);

    await notesTab(page, 'game').click();
    await expect(page.locator('.record')).toContainText('e4');
  });

  test('a tap that drifts a few pixels is still a tap', async ({ page }) => {
    await bootBoard(page);
    await startGame(page);

    // A finger rolls between contact and release. At the mouse's 6px tolerance
    // this was swallowed as an orbit and the board felt like it was ignoring
    // you; PointerInput allows a fingertip more room than a cursor.
    const from = await squarePoint(page, 'd2');
    const to = await squarePoint(page, 'd4');
    await page.touchscreen.tap(from.x + 4, from.y + 4);
    await page.touchscreen.tap(to.x - 4, to.y + 4);

    await notesTab(page, 'game').click();
    await expect(page.locator('.record')).toContainText('d4');
  });

  test('the tips button breathes while there is advice to be had', async ({ page }) => {
    await bootBoard(page);
    await startGame(page);

    /*
      The dock's hint button has pulsed since Phase 11, but below the
      breakpoint the dock is in the drawer and the button a player sees is the
      bar's. Nothing else in the bar moves, which is what makes this findable.
    */
    const tips = page.getByRole('button', { name: /^Tips/ });
    await expect(tips).toHaveClass(/sheet__button--waiting/);
  });

  test('what a thumb has to hit is big enough to hit', async ({ page }) => {
    await bootBoard(page);
    await startGame(page);

    await notesTab(page, 'game').click();

    // Every control on screen, not a sample: the icon row is where Phase 12's
    // last bug lived, and it is exactly the row that was sized for a mouse.
    const buttons = page.locator('.sheet__button, .sheet__tab, .dock button');
    const count = await buttons.count();
    expect(count).toBeGreaterThan(5);

    for (let i = 0; i < count; i += 1) {
      const button = buttons.nth(i);
      if (!(await button.isVisible())) continue;
      const box = await button.boundingBox();
      const label = (await button.getAttribute('aria-label')) ?? `button ${String(i)}`;
      expect(box?.height ?? 0, `${label} is too short for a thumb`).toBeGreaterThanOrEqual(44);
      expect(box?.width ?? 0, `${label} is too narrow for a thumb`).toBeGreaterThanOrEqual(44);
    }
  });
});
