// WHAT: The computer-opponent seam.
// HOW:  Ask for a move given a FEN; get back a MoveRequest in domain terms.
//       Difficulty is a named level, not engine parameters. Promises reject
//       with EngineError on timeout or crash — never hang.
// WHY:  game/ needs "what would you play here?" and nothing else. Stockfish,
//       Web Workers and UCI are implementation details behind this line, so a
//       test can substitute a scripted opponent.

import type { MoveRequest } from '@domain/chess/types';

export type Difficulty = 'beginner' | 'club' | 'strong';

export const DIFFICULTIES: readonly Difficulty[] = ['beginner', 'club', 'strong'];

export interface IChessAI {
  /** Resolves once the engine is loaded and has acknowledged its options. */
  ready(): Promise<void>;
  setDifficulty(level: Difficulty): void;
  /** The engine's chosen move for the side to move in `fen`. */
  chooseMove(fen: string): Promise<MoveRequest>;
  dispose(): void;
}
