// WHAT: Parsing of the few UCI engine messages MapChess cares about.
// HOW:  Pure string functions. `parseBestMove` turns "bestmove e7e8q ponder …"
//       into a MoveRequest, `parseInfoScore` reads the running evaluation out
//       of an "info … score cp 34" line, `parseOptionName` picks the name out
//       of an "option name X type …" line; the others are predicates for
//       handshake lines.
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
const SCORE = /\bscore\s+(cp|mate)\s+(-?\d+)/;
const DEPTH = /\bdepth\s+(\d+)/;
/** Only the principal variation carries the position's score. */
const OTHER_PV = /\bmultipv\s+(?!1\b)\d+/;
const OPTION = /^option\s+name\s+(.+?)\s+type\s+/;

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

/**
 * The name from "option name Skill Level type spin default 20 min 0 max 20",
 * or null for any other line. Names contain spaces, so the "type" keyword is
 * the terminator, not whitespace.
 */
export function parseOptionName(line: string): string | null {
  const m = OPTION.exec(line.trim());
  return m?.[1]?.trim() ?? null;
}

/**
 * The engine's running assessment. Always from the point of view of the side
 * to move — the caller knows whose turn it is and flips it if it wants White's.
 * A mate score counts moves, not pawns, and is never a centipawn value.
 */
export interface EngineScore {
  readonly kind: 'centipawns' | 'mate';
  /** Pawns × 100, or moves to mate; negative means the side to move is losing. */
  readonly value: number;
  /** How deep the search was when it said so. */
  readonly depth: number;
}

export function parseInfoScore(line: string): EngineScore | null {
  const text = line.trim();
  if (!text.startsWith('info ')) return null;
  // Lower-ranked lines from a multi-PV search describe alternatives, not the position.
  if (OTHER_PV.test(text)) return null;

  const score = SCORE.exec(text);
  const kind = score?.[1];
  const raw = score?.[2];
  if (kind === undefined || raw === undefined) return null;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) return null;

  const depth = Number.parseInt(DEPTH.exec(text)?.[1] ?? '0', 10);
  return {
    kind: kind === 'mate' ? 'mate' : 'centipawns',
    value,
    depth: Number.isFinite(depth) ? depth : 0,
  };
}

export function isUciOk(line: string): boolean {
  return line.trim() === 'uciok';
}

export function isReadyOk(line: string): boolean {
  return line.trim() === 'readyok';
}
