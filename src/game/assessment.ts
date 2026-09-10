// WHAT: The engine's score turned into something a person can read: a share of
//       the bar for each side, a sentence, and the conventional number.
// HOW:  Centipawns become a win share through the logistic curve chess engines
//       and rating systems both use; a forced mate is simply the end of the
//       scale. Everything is expressed from White's point of view, because a
//       bar that changes whose side it means every move is unreadable.
// WHY:  "+1.4" is jargon and "score cp 140" is worse. A bar answers "who is
//       winning" without being read at all, the sentence answers it in words,
//       and the number is there for whoever already knows what it means.
//
//       It is an estimate, and the card says so. It comes from a third of a
//       second of search, and at the easy levels the opponent will not play
//       the moves it assumes — so it is a guess about a game that is not the
//       one being played. Worth showing, not worth trusting.

import type { Color } from '@domain/chess/types';

export interface Assessment {
  /** White's share of the bar, 0…1. */
  readonly whiteShare: number;
  /** "White is clearly ahead", "Level", "Mate in 3 for Black". */
  readonly verdict: string;
  /** "+1.4", "−0.6", "M3" — the conventional form, always White-relative. */
  readonly number: string;
  readonly depth: number;
}

/**
 * The curve is the one used to turn a rating difference into an expected
 * score: 400 centipawns of advantage is about the same as 400 Elo.
 */
function winShare(centipawns: number): number {
  return 1 / (1 + Math.pow(10, -centipawns / 400));
}

/** A mate is not a quantity of pawns; it is the far end of the bar. */
const MATE_SHARE = 0.995;

/** Thresholds in pawns, from level to won. */
const BANDS: readonly { readonly pawns: number; readonly word: string }[] = [
  { pawns: 0.5, word: 'Level' },
  { pawns: 1.5, word: 'slightly better' },
  { pawns: 3, word: 'better' },
  { pawns: 6, word: 'clearly ahead' },
  { pawns: Number.POSITIVE_INFINITY, word: 'winning' },
];

/**
 * `score` is from the side to move's point of view, which is how UCI reports
 * it; `turn` says whose that is, so it can be turned around to White's.
 */
export function assess(
  score: { kind: 'centipawns' | 'mate'; value: number; depth: number },
  turn: Color,
): Assessment {
  const forWhite = turn === 'white' ? score.value : -score.value;

  if (score.kind === 'mate') {
    // A mate score of 0 means the position is already mate; treat it as won.
    const winner: Color = forWhite >= 0 ? 'white' : 'black';
    const moves = Math.abs(forWhite);
    return {
      whiteShare: winner === 'white' ? MATE_SHARE : 1 - MATE_SHARE,
      verdict:
        moves === 0
          ? `Mate — ${side(winner)} wins`
          : `Mate in ${String(moves)} for ${side(winner)}`,
      number: `${forWhite >= 0 ? '+' : '−'}M${String(moves)}`,
      depth: score.depth,
    };
  }

  const pawns = forWhite / 100;
  return {
    whiteShare: winShare(forWhite),
    verdict: verdictFor(pawns),
    number: `${pawns >= 0 ? '+' : '−'}${Math.abs(pawns).toFixed(1)}`,
    depth: score.depth,
  };
}

function verdictFor(pawns: number): string {
  const size = Math.abs(pawns);
  const band = BANDS.find((b) => size < b.pawns) ?? BANDS[BANDS.length - 1];
  if (band === undefined || band.word === 'Level') return 'Level';
  return `${side(pawns > 0 ? 'white' : 'black')} is ${band.word}`;
}

function side(color: Color): string {
  return color === 'white' ? 'White' : 'Black';
}
