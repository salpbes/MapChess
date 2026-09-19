// WHAT: The moves a journey needs: boot the app, start a game, click a square.
// HOW:  A square's screen position is projected through the *live* camera via
//       the `window.__mapchess` handle, then clicked with the mouse.
// WHY:  The board is a WebGL canvas, so there is no selector for e2 — and
//       hard-coded pixel coordinates would break the first time the default
//       camera angle moved, which is exactly the kind of false failure that
//       teaches people to ignore a suite. Asking the running app where e2 is
//       keeps the journeys about behaviour.

import type { Locator, Page } from '@playwright/test';

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
    // Terrain, features and the warped board, built in software on CI.
    { timeout: process.env.CI === undefined ? 30_000 : 90_000 },
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

/**
 * Presses one of the game's controls, opening the notes drawer first if the
 * screen is narrow enough that the control lives inside it.
 *
 * This is what a player does, so it is what the journey does: on a phone the
 * dock is in the drawer behind "The game", and on a desktop the same button is
 * simply already on screen. One path, no viewport branch in the test.
 */
export async function tapControl(page: Page, label: string): Promise<void> {
  const all = page.getByRole('button', { name: label, exact: true });
  if (await clickFirstVisible(all)) return;

  // Not in the bar, so it is in the drawer, behind "The game".
  await notesTab(page, 'game').click();
  await expect(all.first()).toBeVisible();
  if (!(await clickFirstVisible(all))) throw new Error(`no visible control named ${label}`);
}

/**
 * The drawer's two tabs, by their labels rather than their glyphs.
 *
 * Several controls appear twice below the breakpoint — once in the always-on
 * bar and once in the dock inside the drawer — so a test has to press the one
 * that is actually on screen rather than the first in the DOM.
 */
export function notesTab(page: Page, tab: 'field' | 'game'): Locator {
  // Scoped to the bar: the record panel's own heading is also a button called
  // "The game", and it is on screen exactly when the drawer is open.
  const name = tab === 'field' ? 'The field' : 'The game';
  return page.locator(`.sheet__tab[aria-label^="${name}"]`);
}

async function clickFirstVisible(locator: Locator): Promise<boolean> {
  const count = await locator.count();
  for (let i = 0; i < count; i += 1) {
    const candidate = locator.nth(i);
    if (await candidate.isVisible()) {
      await candidate.click();
      return true;
    }
  }
  return false;
}

/** How many half-moves the record is showing. */
export async function plyCount(page: Page): Promise<number> {
  return page.locator('.movelist__ply').count();
}

/**
 * Plays a sequence of from/to pairs by clicking the board, waiting for each
 * move to be recorded before starting the next.
 *
 * The wait is the whole point: a move is animated, and clicks that arrive
 * mid-flight are ignored. Without it the second move of a sequence is silently
 * dropped, the third is then illegal for the side to move, and the position
 * you end up testing is not the one you wrote down.
 */
export async function playMoves(
  page: Page,
  moves: readonly (readonly [Square, Square])[],
): Promise<void> {
  let played = await plyCount(page);
  for (const [from, to] of moves) {
    await clickSquare(page, from);
    await clickSquare(page, to);
    played += 1;
    await expect
      .poll(async () => plyCount(page), { message: `${from}${to} was not played` })
      .toBe(played);
  }
}

/** The algebraic moves currently listed in the record panel, in order. */
export async function movesPlayed(page: Page): Promise<string[]> {
  return page.locator('.movelist__row > *:not(:first-child)').allInnerTexts();
}
