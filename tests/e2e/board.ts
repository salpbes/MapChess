// WHAT: The moves a journey needs: boot the app, start a game, click a square.
// HOW:  A square's screen position is projected through the *live* camera via
//       the `window.__mapchess` handle, then clicked with the mouse.
// WHY:  The board is a WebGL canvas, so there is no selector for e2 — and
//       hard-coded pixel coordinates would break the first time the default
//       camera angle moved, which is exactly the kind of false failure that
//       teaches people to ignore a suite. Asking the running app where e2 is
//       keeps the journeys about behaviour.

import type { Page } from '@playwright/test';

import type { Square } from '@domain/board/Square';

import { expect } from './fixtures';

/** A point on the page, in CSS pixels. */
export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * Opens the built site and waits until the board is the real one: terrain and
 * features loaded, so BoardComposer has already swapped the flat starting
 * layout for the warped one. Clicking before that hits squares which are about
 * to move.
 */
export async function bootBoard(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('dialog', { name: 'MapChess menu' })).toBeVisible();

  await page.waitForFunction(
    () => {
      const app = window.__mapchess;
      if (app === undefined) return false;
      return app.heightField() !== null && app.features() !== null;
    },
    undefined,
    { timeout: 30_000 },
  );
}

export type Side = 'Play White' | 'Play Black' | 'Hot-seat (no computer)';

/**
 * Starts a game from the menu. Hot-seat is the default for journeys about the
 * board itself: it keeps Stockfish out of the assertion, so a test that fails
 * has failed for the reason it is named after and not because the engine was
 * still thinking.
 */
export async function startGame(page: Page, side: Side = 'Hot-seat (no computer)'): Promise<void> {
  const menu = page.getByRole('dialog', { name: 'MapChess menu' });
  await expect(menu).toBeVisible();
  await menu.getByLabel('Which side to play').selectOption({ label: side });
  await menu.getByRole('button', { name: 'New game', exact: true }).click();
  await expect(menu).toBeHidden();
}

/** Where a square's centre currently sits on screen. */
export async function squarePoint(page: Page, square: Square): Promise<ScreenPoint> {
  return page.evaluate((name) => {
    const app = window.__mapchess;
    if (app === undefined) throw new Error('window.__mapchess is not set; is this the built app?');

    const stage = app.stage;
    const cell = app.layout().cell(name);
    // three.js is not importable in page scope, but the camera carries a live
    // Vector3 whose constructor is the class itself.
    const Vector3 = stage.camera.position.constructor as new (
      x: number,
      y: number,
      z: number,
    ) => typeof stage.camera.position;

    const point = new Vector3(cell.centroid.x, cell.platformY, cell.centroid.z);
    point.project(stage.camera);

    const rect = stage.renderer.domElement.getBoundingClientRect();
    return {
      x: rect.left + ((point.x + 1) / 2) * rect.width,
      y: rect.top + ((1 - point.y) / 2) * rect.height,
    };
  }, square);
}

/**
 * Clicks a square on the board. PointerInput treats a press that travels more
 * than a few pixels as an orbit, so this is a clean down-up in one place.
 */
export async function clickSquare(page: Page, square: Square): Promise<void> {
  const point = await squarePoint(page, square);
  await page.mouse.click(point.x, point.y);
}

/** The algebraic moves currently listed in the record panel, in order. */
export async function movesPlayed(page: Page): Promise<string[]> {
  return page.locator('.movelist__row > *:not(:first-child)').allInnerTexts();
}
