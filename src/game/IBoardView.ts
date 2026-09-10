// WHAT: What the game loop needs from the 3D board, and nothing more.
// HOW:  Show a position, play a validated Move (animated, resolves when done),
//       show or clear highlights. All arguments are domain types.
// WHY:  game/ must not import three.js. This interface is the wall: world/
//       implements it, game/ calls it, and the game logic stays testable with
//       a fake view.

import type { Square } from '@domain/board/Square';
import type { Move, PlacedPiece } from '@domain/chess/types';

export interface BoardHighlights {
  readonly selected?: Square;
  readonly moves?: readonly Square[];
  readonly captures?: readonly Square[];
  readonly check?: Square;
  /** The two squares of a suggested move: where it starts and where it lands. */
  readonly hint?: readonly Square[];
  /** The two squares of the move just played, so a reply can be seen at all. */
  readonly last?: readonly Square[];
}

export interface IBoardView {
  /** Replaces every piece on the board with this position, instantly. */
  showPosition(pieces: readonly PlacedPiece[]): void;
  /** Animates a move that has already been validated and applied by the engine. */
  playMove(move: Move): Promise<void>;
  showHighlights(highlights: BoardHighlights): void;
  clearHighlights(): void;
}
