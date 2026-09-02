// WHAT: Parsing of the few UCI engine messages MapChess cares about.
// HOW:  Pure string functions. `parseBestMove` turns "bestmove e7e8q ponder …"
//       into a MoveRequest; the others are predicates for handshake lines.
// WHY:  UCI is a text protocol; keeping the parsing separate from the worker
//       plumbing means it can be unit-tested without a worker or a browser.

import type { Square } from '@domain/board/Square';
import type { MoveRequest, PromotionPiece } from '@domain/chess/types';

const PROMOTION: Readonly<Record<string, PromotionPiece>> = {
  q: 'queen',
  r: 'rook',
  b: 'bishop',
  n: 'knight',
};

const BESTMOVE = /^bestmove\s+([a-h][1-8])([a-h][1-8])([qrbn])?/;

/** Returns null for lines that are not a bestmove, or for "bestmove (none)". */
export function parseBestMove(line: string): MoveRequest | null {
  const m = BESTMOVE.exec(line.trim());
  if (m === null) return null;
  const from = m[1] as Square;
  const to = m[2] as Square;
  const promo = m[3];
  if (promo === undefined) return { from, to };
  const promotion = PROMOTION[promo];
  return promotion === undefined ? { from, to } : { from, to, promotion };
}

export function isUciOk(line: string): boolean {
  return line.trim() === 'uciok';
}

export function isReadyOk(line: string): boolean {
  return line.trim() === 'readyok';
}
