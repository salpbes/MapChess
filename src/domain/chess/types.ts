// WHAT: Plain chess vocabulary used by every layer: colours, piece types,
//       moves and game status.
// HOW:  Human-readable string unions ('white', 'rook') rather than chess.js's
//       single letters. A Move carries everything a renderer needs to animate
//       it — including the rook's path in a castle and the square actually
//       vacated by an en passant capture — so no layer above re-derives rules.
// WHY:  Phase 10 assigns identities to "rooks" and "bishops"; Phase 3 animates
//       captures. Both read these types. Neither should ever see chess.js.

import type { Square } from '@domain/board/Square';

export type Color = 'white' | 'black';

export type PieceType = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king';

export type PromotionPiece = Exclude<PieceType, 'pawn' | 'king'>;

export interface Piece {
  readonly type: PieceType;
  readonly color: Color;
}

export interface PlacedPiece {
  readonly square: Square;
  readonly piece: Piece;
}

/** What a player asks for. `promotion` is required only when a pawn reaches the last rank. */
export interface MoveRequest {
  readonly from: Square;
  readonly to: Square;
  readonly promotion?: PromotionPiece;
}

/** A move that has been validated (and possibly played). */
export interface Move {
  readonly from: Square;
  readonly to: Square;
  readonly piece: PieceType;
  readonly color: Color;
  /** Standard algebraic notation, e.g. "Nf3", "exd5", "O-O", "e8=Q+". */
  readonly san: string;
  readonly promotion: PromotionPiece | null;
  readonly captured: PieceType | null;
  /** Square the captured piece stood on. Differs from `to` only for en passant. */
  readonly capturedSquare: Square | null;
  /** Rook displacement when this move is a castle. */
  readonly castle: {
    readonly side: 'king' | 'queen';
    readonly rookFrom: Square;
    readonly rookTo: Square;
  } | null;
  readonly isEnPassant: boolean;
}

export type DrawReason =
  'stalemate' | 'fifty-moves' | 'threefold-repetition' | 'insufficient-material';

export type GameStatus =
  | { readonly kind: 'playing'; readonly inCheck: boolean }
  | { readonly kind: 'checkmate'; readonly winner: Color }
  | { readonly kind: 'draw'; readonly reason: DrawReason };

export function opponent(color: Color): Color {
  return color === 'white' ? 'black' : 'white';
}
