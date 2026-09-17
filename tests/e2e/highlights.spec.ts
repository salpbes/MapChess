// WHAT: §13.6 — that a legal move and a capture are told apart without hue.
// HOW:  Plays into a position where the selected pawn has both a quiet move
//       and a capture, photographs each of those two cells, converts them to
//       greyscale and measures the middle against the edge.
// WHY:  The done-when for §13.6 is "distinguishable in a greyscale screenshot
//       of a real board", so the test is that sentence rather than an assertion
//       about the constants I happened to choose. Green against red is the pair
//       deuteranopia confuses most; measuring luminance is the only way to know
//       the fix works for the people it is for, since both marks look obviously
//       different to me on a colour screen either way.

import type { Page } from '@playwright/test';
import { PNG } from 'pngjs';

import { test, expect } from './fixtures';
import { bootBoard, clickSquare, playMoves, squarePoint, startGame } from './board';
import type { ScreenPoint } from './board';

/** Rec. 709 luma — what a greyscale conversion actually computes. */
function luma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

interface CellReading {
  /** Mean greyscale value of the cell's middle. */
  readonly middle: number;
  /** Mean greyscale value of a band just inside its edge. */
  readonly edge: number;
}

/**
 * Reads one cell's middle and edge brightness out of a screenshot, in grey.
 *
 * Radii are fractions of the cell pitch, so this works at any zoom and on the
 * warped board, where no two cells are the same size.
 */
async function readCell(page: Page, at: ScreenPoint, pitch: number): Promise<CellReading> {
  const half = Math.round(pitch * 0.45);
  const clip = {
    x: Math.round(at.x) - half,
    y: Math.round(at.y) - half,
    width: half * 2,
    height: half * 2,
  };
  const png = PNG.sync.read(await page.screenshot({ clip }));

  let middleSum = 0;
  let middleCount = 0;
  let edgeSum = 0;
  let edgeCount = 0;

  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const dx = x - png.width / 2;
      const dy = y - png.height / 2;
      const r = Math.hypot(dx, dy) / pitch;
      const i = (png.width * y + x) << 2;
      const value = luma(png.data[i] ?? 0, png.data[i + 1] ?? 0, png.data[i + 2] ?? 0);

      if (r < 0.14) {
        middleSum += value;
        middleCount += 1;
      } else if (r > 0.3 && r < 0.42) {
        edgeSum += value;
        edgeCount += 1;
      }
    }
  }

  expect(middleCount, 'no pixels sampled in the middle').toBeGreaterThan(0);
  expect(edgeCount, 'no pixels sampled at the edge').toBeGreaterThan(0);
  return { middle: middleSum / middleCount, edge: edgeSum / edgeCount };
}

test.describe('move and capture, without colour', () => {
  test('a filled middle against an outlined edge, in greyscale', async ({ page }) => {
    test.skip(test.info().project.name !== 'desktop', 'Measured where the cells are largest.');

    await bootBoard(page);
    await startGame(page);

    // Four plies to a position where the e-pawn has both a quiet push (e5) and
    // a capture (d5) — and where neither is part of the move just played, so
    // the "last move" tint cannot colour the reading.
    await playMoves(page, [
      ['e2', 'e4'],
      ['d7', 'd5'],
      ['b1', 'c3'],
      ['g8', 'f6'],
    ]);
    await clickSquare(page, 'e4');

    const move = await squarePoint(page, 'e5');
    const capture = await squarePoint(page, 'd5');
    const pitch = Math.hypot(move.x - capture.x, move.y - capture.y);
    expect(pitch, 'the two cells should be about one cell apart').toBeGreaterThan(20);

    const moveCell = await readCell(page, move, pitch);
    const captureCell = await readCell(page, capture, pitch);

    // A dot: the middle is the bright part.
    expect(
      moveCell.middle,
      `move cell middle ${moveCell.middle.toFixed(1)} vs edge ${moveCell.edge.toFixed(1)}`,
    ).toBeGreaterThan(moveCell.edge + 8);

    // A ring: the edge is the bright part, and the middle is darker than the
    // move cell's — so the two differ in shape AND in value, with no hue left
    // to do the work.
    expect(
      captureCell.edge,
      `capture cell edge ${captureCell.edge.toFixed(1)} vs middle ${captureCell.middle.toFixed(1)}`,
    ).toBeGreaterThan(captureCell.middle + 8);
    expect(captureCell.middle).toBeLessThan(moveCell.middle);
  });
});
