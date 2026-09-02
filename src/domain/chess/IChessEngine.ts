// WHAT: The chess-rules seam.
// HOW:  Read the position, ask what is legal, play or undo a move. Every
//       method is synchronous and pure with respect to the outside world.
// WHY:  game/ and ui/ talk to this, never to chess.js. If chess.js is ever
//       replaced (or the rules variant changes), only domain/chess/ moves.

import type { Square } from '@domain/board/Square';

import type { Color, GameStatus, Move, MoveRequest, Piece, PlacedPiece } from './types';

export interface IChessEngine {
  readonly turn: Color;
  readonly status: GameStatus;
  /** Forsyth–Edwards Notation of the current position. */
  readonly fen: string;
  /** Moves played so far, oldest first. */
  readonly history: readonly Move[];

  pieceAt(square: Square): Piece | null;
  pieces(): readonly PlacedPiece[];

  /** All legal moves, optionally only those starting from one square. */
  legalMoves(from?: Square): readonly Move[];
  /** True if a pawn moving from→to would reach the last rank and needs a promotion piece. */
  requiresPromotion(from: Square, to: Square): boolean;
  isLegal(request: MoveRequest): boolean;

  /** Plays the move. Throws IllegalMoveError if it is not legal in this position. */
  move(request: MoveRequest): Move;
  /** Takes back the last move. Returns it, or null if there is nothing to undo. */
  undo(): Move | null;

  reset(): void;
  /** Replaces the position. Throws InvalidPositionError on a malformed FEN. */
  load(fen: string): void;
}
