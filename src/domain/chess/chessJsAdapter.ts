// WHAT: Conversions between chess.js's vocabulary and MapChess's domain types.
// HOW:  Lookup tables for colours and piece letters, plus one function that
//       reads a chess.js Move and fills in the castle rook path and the real
//       captured square for en passant.
// WHY:  This is the only file that knows chess.js's single-letter encoding.
//       Keeping the translation in one place is what lets ChessEngine.ts read
//       like chess rather than like string parsing.

import type { Color as CjsColor, Move as CjsMove, PieceSymbol } from 'chess.js';

import type { Square } from '@domain/board/Square';

import type { Color, Move, PieceType, PromotionPiece } from './types';

const PIECE_FROM_SYMBOL: Readonly<Record<PieceSymbol, PieceType>> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

const SYMBOL_FROM_PIECE: Readonly<Record<PieceType, PieceSymbol>> = {
  pawn: 'p',
  knight: 'n',
  bishop: 'b',
  rook: 'r',
  queen: 'q',
  king: 'k',
};

export function toPieceType(symbol: PieceSymbol): PieceType {
  return PIECE_FROM_SYMBOL[symbol];
}

export function toPieceSymbol(piece: PieceType): PieceSymbol {
  return SYMBOL_FROM_PIECE[piece];
}

export function toColor(color: CjsColor): Color {
  return color === 'w' ? 'white' : 'black';
}

export function toMove(cjs: CjsMove): Move {
  const color = toColor(cjs.color);
  const promotion =
    cjs.promotion === undefined ? null : (PIECE_FROM_SYMBOL[cjs.promotion] as PromotionPiece);
  const captured = cjs.captured === undefined ? null : PIECE_FROM_SYMBOL[cjs.captured];
  const isEnPassant = cjs.isEnPassant();

  return {
    from: cjs.from,
    to: cjs.to,
    piece: PIECE_FROM_SYMBOL[cjs.piece],
    color,
    san: cjs.san,
    promotion,
    captured,
    capturedSquare: captured === null ? null : isEnPassant ? enPassantVictim(cjs) : cjs.to,
    castle: castleRookPath(cjs, color),
    isEnPassant,
  };
}

/** The captured pawn sits beside the destination, on the mover's origin rank. */
function enPassantVictim(cjs: CjsMove): Square {
  const file = cjs.to.charAt(0);
  const rank = cjs.from.charAt(1);
  return `${file}${rank}` as Square;
}

function castleRookPath(cjs: CjsMove, color: Color): Move['castle'] {
  const rank = color === 'white' ? '1' : '8';
  if (cjs.isKingsideCastle()) {
    return { side: 'king', rookFrom: `h${rank}`, rookTo: `f${rank}` };
  }
  if (cjs.isQueensideCastle()) {
    return { side: 'queen', rookFrom: `a${rank}`, rookTo: `d${rank}` };
  }
  return null;
}
