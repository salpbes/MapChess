// WHAT: Turns a suggested move into something a child can act on: a short
//       headline, a sentence saying why, and the move spelled out in words.
// HOW:  Asks the position a handful of cheap questions in order of how much
//       they matter to a beginner — mate, promotion, capture, check, is the
//       piece it moves currently in danger — and stops at the first that
//       applies. Promotion outranks capture and check deliberately: a move can
//       be all three, and turning a pawn into a queen is the part a child cares
//       about. The engine already decided the move is good; this only has to
//       find the most obvious true thing to say about it.
// WHY:  "Try Nf3" helps someone who already reads notation and already knows
//       why they might play it, which is nobody who needs a hint. A learner
//       needs the piece named, the squares named, and a reason in words — and
//       the notation shown beside it, so the notation stops being a mystery.

import type { Square } from '@domain/board/Square';
import type { IChessEngine } from '@domain/chess/IChessEngine';
import { opponent } from '@domain/chess/types';
import type { Move, PieceType } from '@domain/chess/types';

export interface MoveAdvice {
  /** Three or four words, large and first. */
  readonly headline: string;
  /** One sentence saying why, in the second person. */
  readonly reason: string;
  /** The move as an instruction: "Move your knight from g1 to f3." */
  readonly instruction: string;
  /** The same move as chess players write it, shown beside the words so the
   *  notation becomes learnable rather than a barrier. */
  readonly notation: string;
}

const ARTICLE_PIECE: Readonly<Record<PieceType, string>> = {
  pawn: 'pawn',
  knight: 'knight',
  bishop: 'bishop',
  rook: 'rook',
  queen: 'queen',
  king: 'king',
};

export function explainMove(engine: IChessEngine, move: Move): MoveAdvice {
  return {
    headline: headlineFor(engine, move),
    reason: reasonFor(engine, move),
    instruction: instructionFor(move),
    notation: move.san,
  };
}

function headlineFor(engine: IChessEngine, move: Move): string {
  if (move.san.endsWith('#')) return 'Checkmate!';
  if (move.promotion !== null) return 'Make a new queen!';
  if (move.captured !== null) return `Win the ${ARTICLE_PIECE[move.captured]}!`;
  if (move.san.endsWith('+')) return 'Check!';
  if (isInDanger(engine, move)) return 'Get out of danger';
  if (move.castle !== null) return 'Castle to safety';
  return 'A good move';
}

function reasonFor(engine: IChessEngine, move: Move): string {
  const mover = ARTICLE_PIECE[move.piece];

  if (move.san.endsWith('#')) {
    return 'This traps the other king with nowhere to go. It wins the game.';
  }
  if (move.promotion !== null) {
    return 'Your pawn reaches the far end and turns into a queen — the strongest piece there is.';
  }
  if (move.captured !== null) {
    const victim = ARTICLE_PIECE[move.captured];
    // En passant is the one capture where the piece taken is not where you land.
    const where = move.isEnPassant
      ? `the pawn that just ran past you`
      : `the ${victim} on ${move.to}`;
    return `Your ${mover} can take ${where}.`;
  }
  if (move.san.endsWith('+')) {
    return `This puts the other king in check, so they have to deal with it first.`;
  }
  if (isInDanger(engine, move)) {
    const safe = !engine.isAttacked(move.to, opponent(move.color));
    return safe
      ? `Your ${mover} can be taken where it is standing. ${capitalise(move.to)} is safe.`
      : `Your ${mover} can be taken where it is standing, so it should move.`;
  }
  if (move.castle !== null) {
    return 'This tucks your king into the corner and brings a rook towards the middle.';
  }
  if (movesTowardsTheMiddle(move.from, move.to)) {
    return `This brings your ${mover} towards the middle, where it can do more.`;
  }
  return `This is what a strong player would choose here.`;
}

function instructionFor(move: Move): string {
  if (move.castle !== null) {
    const side = move.castle.side === 'king' ? 'short' : 'long';
    return `Castle ${side}: click your king, then the rook on ${move.castle.rookFrom}.`;
  }
  return `Move your ${ARTICLE_PIECE[move.piece]} from ${move.from} to ${move.to}.`;
}

/** True when the piece being moved could be captured where it currently stands. */
function isInDanger(engine: IChessEngine, move: Move): boolean {
  return engine.isAttacked(move.from, opponent(move.color));
}

/** Crude but true often enough to be worth saying: is the destination nearer the centre? */
function movesTowardsTheMiddle(from: Square, to: Square): boolean {
  return centreDistance(to) < centreDistance(from);
}

function centreDistance(square: Square): number {
  // 3.5 is the midpoint between the d and e files, and ranks 4 and 5.
  const file = square.charCodeAt(0) - 'a'.charCodeAt(0);
  const rank = square.charCodeAt(1) - '1'.charCodeAt(0);
  return Math.abs(file - 3.5) + Math.abs(rank - 3.5);
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
