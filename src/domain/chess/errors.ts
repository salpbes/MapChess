// WHAT: Typed errors thrown by the chess engine.
// HOW:  Two error classes with a machine-readable `reason` so the UI can show
//       "that pawn needs a promotion piece" rather than a generic failure.
// WHY:  BUILD_PLAN §5: no silent catch. Callers must be able to distinguish
//       "you tried an illegal move" (expected, user-facing) from a real bug.

import type { MoveRequest } from './types';

export type IllegalMoveReason =
  | 'no-piece-on-from-square'
  | 'not-your-turn'
  | 'promotion-required'
  | 'promotion-not-allowed'
  | 'not-a-legal-destination'
  | 'game-over';

export class IllegalMoveError extends Error {
  public constructor(
    public readonly request: MoveRequest,
    public readonly reason: IllegalMoveReason,
  ) {
    super(`Illegal move ${request.from}→${request.to}: ${reason}.`);
    this.name = 'IllegalMoveError';
  }
}

export class InvalidPositionError extends Error {
  public constructor(
    public readonly fen: string,
    detail: string,
  ) {
    super(`Invalid FEN "${fen}": ${detail}`);
    this.name = 'InvalidPositionError';
  }
}
