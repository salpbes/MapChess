// WHAT: How a game ended, including the one ending the rules do not know about.
// HOW:  A union over the engine's terminal statuses plus `resignation`, and one
//       function that folds "what does the position say" together with "has
//       anyone given up" into a single answer, or null while play continues.
// WHY:  chess.js decides checkmate and draws from the position; resignation is
//       a decision by a player and has no square to read it from. Keeping it
//       out of `GameStatus` leaves domain/chess purely about the rules, and
//       gives ui/ one value to render a result from.

import type { Color, DrawReason, GameStatus } from '@domain/chess/types';
import { opponent } from '@domain/chess/types';

export type GameOutcome =
  | { readonly kind: 'checkmate'; readonly winner: Color }
  | { readonly kind: 'draw'; readonly reason: DrawReason }
  | { readonly kind: 'resignation'; readonly winner: Color; readonly loser: Color };

/** Null while the game is still playable. Resignation outranks the position. */
export function outcomeOf(status: GameStatus, resignedBy: Color | null): GameOutcome | null {
  if (resignedBy !== null) {
    return { kind: 'resignation', winner: opponent(resignedBy), loser: resignedBy };
  }
  switch (status.kind) {
    case 'checkmate':
      return { kind: 'checkmate', winner: status.winner };
    case 'draw':
      return { kind: 'draw', reason: status.reason };
    case 'playing':
      return null;
  }
}

/** The winner, or null for a draw. */
export function winnerOf(outcome: GameOutcome): Color | null {
  return outcome.kind === 'draw' ? null : outcome.winner;
}
