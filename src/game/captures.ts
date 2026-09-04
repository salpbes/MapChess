// WHAT: What each side has taken off the board, and who is ahead in material.
// HOW:  A fold over the move history: every `captured` piece goes to the mover's
//       pile, and every promotion adds the difference it created. Piles are
//       sorted most valuable first so the display is stable regardless of the
//       order the captures happened in.
// WHY:  The captured-pieces display and the material score are the same
//       question asked twice. Deriving both from the history means there is no
//       second copy of the game state to keep in step — undo is free.

import type { Move, PieceType } from '@domain/chess/types';

/** Conventional pawn-unit values. The king is never captured, so it scores nothing. */
export const PIECE_VALUE: Readonly<Record<PieceType, number>> = {
  pawn: 1,
  knight: 3,
  bishop: 3,
  rook: 5,
  queen: 9,
  king: 0,
};

const ORDER: readonly PieceType[] = ['queen', 'rook', 'bishop', 'knight', 'pawn', 'king'];

export interface CaptureSummary {
  /** Black pieces White has taken, most valuable first. */
  readonly byWhite: readonly PieceType[];
  /** White pieces Black has taken, most valuable first. */
  readonly byBlack: readonly PieceType[];
  /** Material advantage in pawn units, positive when White is ahead. */
  readonly balance: number;
}

export function summariseCaptures(moves: readonly Move[]): CaptureSummary {
  const byWhite: PieceType[] = [];
  const byBlack: PieceType[] = [];
  let balance = 0;

  for (const move of moves) {
    const gain = move.color === 'white' ? 1 : -1;
    if (move.captured !== null) {
      (move.color === 'white' ? byWhite : byBlack).push(move.captured);
      balance += gain * PIECE_VALUE[move.captured];
    }
    // A promoted pawn is worth what it became, less the pawn it stopped being.
    if (move.promotion !== null) {
      balance += gain * (PIECE_VALUE[move.promotion] - PIECE_VALUE.pawn);
    }
  }

  return { byWhite: sortByValue(byWhite), byBlack: sortByValue(byBlack), balance };
}

function sortByValue(pieces: PieceType[]): readonly PieceType[] {
  return [...pieces].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
}
