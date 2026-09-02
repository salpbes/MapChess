// WHAT: The events the game layer publishes, and the bus type that carries them.
// HOW:  A plain event map consumed by `EventBus<GameEvents>`. Payloads are
//       domain types only — no three.js, no DOM.
// WHY:  ui/ renders these without knowing GameLoop exists; Phase 11's save
//       system will listen to `move-played` the same way.

import type { Square } from '@domain/board/Square';
import type { IllegalMoveError } from '@domain/chess/errors';
import type { Color, GameStatus, Move, MoveRequest } from '@domain/chess/types';
import type { EventBus } from '@shared/events/EventBus';

export interface GameEvents extends Record<string, unknown> {
  /** A game began from the start position (also after newGame). */
  'game-started': { readonly players: Readonly<Record<Color, 'human' | 'ai'>> };
  'status-changed': { readonly status: GameStatus; readonly turn: Color };
  'move-played': Move;
  'move-refused': IllegalMoveError;
  'selection-changed': { readonly square: Square | null; readonly targets: readonly Square[] };
  'ai-thinking': { readonly color: Color };
  /** The engine failed or misbehaved; the game continued with `fallback`. */
  'ai-error': { readonly error: unknown; readonly fallback: MoveRequest };
}

export type GameBus = EventBus<GameEvents>;
