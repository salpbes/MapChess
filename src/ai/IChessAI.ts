// WHAT: The computer-opponent seam.
// HOW:  Ask for a move given a FEN; get back a MoveRequest in domain terms.
//       Difficulty is a named level, not engine parameters. Promises reject
//       with EngineError on timeout or crash — never hang.
// WHY:  game/ needs "what would you play here?" and nothing else. Stockfish,
//       Web Workers and UCI are implementation details behind this line, so a
//       test can substitute a scripted opponent.

import type { MoveRequest } from '@domain/chess/types';

import type { EngineScore } from './uci';

export type Difficulty = 'learner' | 'beginner' | 'casual' | 'club' | 'strong';

/** Weakest first. Saved games from before `learner` and `casual` existed still name a level in this list. */
export const DIFFICULTIES: readonly Difficulty[] = [
  'learner',
  'beginner',
  'casual',
  'club',
  'strong',
];

export interface IChessAI {
  /** Resolves once the engine is loaded and has acknowledged its options. */
  ready(): Promise<void>;
  setDifficulty(level: Difficulty): void;
  /** The engine's chosen move for the side to move in `fen`. */
  chooseMove(fen: string): Promise<MoveRequest>;
  /**
   * Optional: a suggestion for the side to move, searched at full strength
   * whatever level is being played. Advice that is as weak as the opponent
   * would be worse than no advice.
   */
  hint?(fen: string): Promise<MoveRequest>;
  /**
   * Optional: how the engine rates this position, from the point of view of
   * the side to move. Searched at full strength like a hint, and for the same
   * reason — an assessment as shallow as the opponent's play is worthless.
   */
  evaluate?(fen: string): Promise<EngineScore | null>;
  dispose(): void;
}
