// WHAT: §13.5 — the area picker driven the way a phone drives it.
// HOW:  Opens the picker over a fixture basemap, then drags the square with a
//       real touch sequence (CDP's own touch events, not a synthesised mouse)
//       and reads the coordinates back out of the panel.
// WHY:  The square's drag was bound to `mousedown`, which MapLibre raises for
//       a mouse and never for a finger — so on a phone every attempt to move
//       the square fell through to the map and panned it instead, which looks
//       exactly like a square that refuses to move. That shipped because this
//       screen had no test at all: the basemap was blocked, so the map never
//       loaded and there was nothing to drive.

import type { Page } from '@playwright/test';

import { test, expect } from './fixtures';
import { bootBoard, startGame, tapControl } from './board';

/** Where the picker's readout says the square currently is. */
async function readoutOf(page: Page): Promise<string> {
  return (await page.locator('.area-picker__readout').innerText()).trim();
}

test.describe('choosing a place', () => {
  test.beforeEach(async ({ page }) => {
    await bootBoard(page);
    await startGame(page);
    await tapControl(page, 'Choose a place on the map');
    await expect(page.locator('.area-picker')).toBeVisible();
    // The square is drawn once the style has loaded and the layers are added.
    await expect(page.locator('.area-picker__readout')).not.toBeEmpty();
  });

  test('the square moves under a finger', async ({ page }) => {
    test.skip(test.info().project.name !== 'phone', 'Touch emulation is on the phone project.');

    const before = await readoutOf(page);
    const map = await page.locator('.area-picker__map').boundingBox();
    expect(map).not.toBeNull();

    // The map is fitted to the square, so its centre is inside the square.
    const x = (map?.x ?? 0) + (map?.width ?? 0) / 2;
    const y = (map?.y ?? 0) + (map?.height ?? 0) / 2;

    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y }],
    });
    // In steps, because a drag is a stream of moves and one jump can be
    // mistaken for a tap by anything watching travel.
    for (const step of [0.25, 0.5, 0.75, 1]) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: x + 70 * step, y: y - 50 * step }],
      });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

    await expect
      .poll(async () => readoutOf(page), { message: 'the square never moved' })
      .not.toBe(before);
  });

  test('the square moves under a mouse', async ({ page }) => {
    test.skip(test.info().project.name !== 'desktop', 'The mouse path is the desktop project.');

    const before = await readoutOf(page);
    const map = await page.locator('.area-picker__map').boundingBox();
    const x = (map?.x ?? 0) + (map?.width ?? 0) / 2;
    const y = (map?.y ?? 0) + (map?.height ?? 0) / 2;

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 70, y - 50, { steps: 8 });
    await page.mouse.up();

    await expect
      .poll(async () => readoutOf(page), { message: 'the square never moved' })
      .not.toBe(before);
  });

  test('a failure offers a way out, not just a retry', async ({ page }) => {
    test.skip(test.info().project.name !== 'desktop', 'One viewport is enough for a dead end.');

    // Move the square off the fixture areas, so the app has to ask Overpass —
    // which the fence refuses, exactly as a timeout or an outage would.
    const map = await page.locator('.area-picker__map').boundingBox();
    const x = (map?.x ?? 0) + (map?.width ?? 0) / 2;
    const y = (map?.y ?? 0) + (map?.height ?? 0) / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 90, y - 60, { steps: 8 });
    await page.mouse.up();
    await page.getByRole('button', { name: 'Use this area' }).click();

    const status = page.locator('.datastatus');
    await expect(status).toContainText('Could not load', { timeout: 30_000 });

    /*
      "Try again" alone is a loop: an area that failed because it is too dense
      for the query will fail the same way next time, and the player is stuck
      on a board that will never build.
    */
    await expect(status.getByRole('button', { name: 'Try again' })).toBeVisible();
    const elsewhere = status.getByRole('button', { name: 'Choose another area' });
    await expect(elsewhere).toBeVisible();

    /*
      Once is bad luck: the service is shared and busy, and the message still
      reads as "try again". Twice is a pattern, and the app should stop
      implying the next press will be different.
    */
    const advice = page.locator('.datastatus__advice');
    await expect(advice).toBeHidden();

    await status.getByRole('button', { name: 'Try again' }).click();
    await expect(advice).toBeVisible({ timeout: 30_000 });
    await expect(advice).toContainText('twice');
    await expect(elsewhere).toHaveClass(/datastatus__retry--primary/);

    await elsewhere.click();
    await expect(page.locator('.area-picker')).toBeVisible();
  });

  test('rotation is a slider, not a twist', async ({ page }) => {
    // Two fingers already mean pinch-and-rotate to MapLibre, so the square's
    // own rotation gets a control it can keep rather than a gesture it would
    // have to steal.
    const slider = page.getByLabel('Board rotation in degrees');
    await expect(slider).toBeVisible();

    await slider.fill('45');
    await slider.dispatchEvent('input');

    await expect(page.locator('.area-picker__readout')).toContainText('45°');
  });
});
