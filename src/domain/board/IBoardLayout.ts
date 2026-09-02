// WHAT: The seam between the logical chessboard and its physical shape.
// HOW:  Answers "where is square e4 and what shape is it" and nothing else.
//       Implementations: FlatBoardLayout (Phase 1), WarpedBoardLayout (Phase 8).
// WHY:  Everything downstream — cell meshes, piece placement, camera framing —
//       reads only this interface, so swapping the flat board for real terrain
//       changes one line in app/ and nothing else. This is BUILD_PLAN §5's
//       "the seam that makes this plan work".

import type { Square } from './Square';
import type { BoardBounds, Cell } from './types';

export interface IBoardLayout {
  /** Exactly 64 cells, one per square, in ALL_SQUARES order. */
  readonly cells: readonly Cell[];
  readonly bounds: BoardBounds;
  cell(square: Square): Cell;
}
