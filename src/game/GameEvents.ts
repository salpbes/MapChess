// WHAT: The events the game layer publishes, and the bus type that carries them.
// HOW:  A plain event map consumed by `EventBus<GameEvents>`. Payloads are
//       domain types only — no three.js, no DOM.
// WHY:  ui/ renders these without knowing GameLoop exists; the save system
//       listens to `history-changed` the same way the move list does.

import type { Square } from '@domain/board/Square';
import type { IllegalMoveError } from '@domain/chess/errors';
import type { Color, GameStatus, Move, MoveRequest, PieceType } from '@domain/chess/types';
import type { EventBus } from '@shared/events/EventBus';

import type { MoveAdvice } from './explainMove';
import type { GameOutcome } from './GameOutcome';

/** Why a piece the player just picked up cannot go anywhere. */
export type BlockedReason = 'in-check' | 'pinned' | 'no-moves';

export interface GameEvents extends Record<string, unknown> {
  /** A game began — from the start position, or restored from a save. */
  'game-started': { readonly players: Readonly<Record<Color, 'human' | 'ai'>> };
  'status-changed': { readonly status: GameStatus; readonly turn: Color };
  'move-played': Move;
  /** One ply taken back. Emitted newest-first when an undo takes back several. */
  'move-undone': Move;
  /**
   * The full history after any change to it, so a listener never has to keep
   * its own copy in step. Emitted on start, after every move, and after undo.
   */
  'history-changed': { readonly moves: readonly Move[] };
  /** The game ended. An undo that takes the position back re-opens play silently. */
  'game-over': { readonly outcome: GameOutcome };
  'move-refused': IllegalMoveError;
  'selection-changed': { readonly square: Square | null; readonly targets: readonly Square[] };
  /**
   * The player selected their own piece and it has no legal move. Without this
   * the board answers a click with silence, which reads as a broken game
   * rather than as the rules doing their job.
   */
  'selection-blocked': {
    readonly square: Square;
    readonly piece: PieceType;
    readonly reason: BlockedReason;
  };
  'ai-thinking': { readonly color: Color };
  /** The player asked for advice and the engine is looking. */
  'hint-thinking': Record<string, never>;
  /** A suggested move with the words to explain it, shown but not played. */
  'hint-offered': { readonly move: Move; readonly advice: MoveAdvice };
  /** Advice was asked for and could not be given. */
  'hint-failed': { readonly error: unknown };
  /** The engine failed or misbehaved; the game continued with `fallback`. */
  'ai-error': { readonly error: unknown; readonly fallback: MoveRequest };
}

export type GameBus = EventBus<GameEvents>;
