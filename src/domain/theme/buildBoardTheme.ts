// WHAT: The theming entry point: CellFacts[] → BoardTheme.
// HOW:  Names every cell, then assigns piece identities from the named cells.
// WHY:  One function for app/ to call; the two steps stay separately testable.

import { assignPieces } from './assignPieces';
import { nameCells } from './nameCells';
import type { BoardTheme, CellFacts } from './types';

export function buildBoardTheme(cells: readonly CellFacts[]): BoardTheme {
  if (cells.length !== 64) throw new RangeError(`Expected 64 cells, got ${String(cells.length)}.`);
  const identities = nameCells(cells);
  const pieces = assignPieces(cells, identities);
  return { cells: identities, pieces };
}
