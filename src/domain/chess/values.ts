// WHAT: What each piece is worth, in pawns.
// HOW:  The table every beginner is taught, as plain numbers.
// WHY:  "You are three ahead" needs a price list, and there should be exactly
//       one of them in the codebase — two would eventually disagree about a
//       bishop. The king has no price because it is never captured; giving it
//       a large one would poison every sum it appeared in.

import type { PieceType } from './types';

export const PIECE_VALUE: Readonly<Record<PieceType, number>> = {
  pawn: 1,
  knight: 3,
  bishop: 3,
  rook: 5,
  queen: 9,
  king: 0,
};
