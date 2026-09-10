// WHAT: Keeps one saved game on disk in step with the game being played.
// HOW:  Listens for `history-changed` and `game-over`, asks a callback for the
//       things the loop does not know about — which area is on screen, which
//       difficulty the opponent is set to — and writes the record through a
//       `JsonStore`. `resume()` reads it back and hands it to `GameLoop.restore`.
// WHY:  Autosaving on every change means there is never a "save" button to
//       forget, and every listener already gets the full history, so the save
//       is a projection of an event rather than a second copy of the state.

import type { Difficulty } from '@ai/IChessAI';
import type { Color, MoveRequest } from '@domain/chess/types';
import type { SelectedArea } from '@mapdata/model/SelectedArea';
import type { JsonStore } from '@shared/storage/LocalJsonStore';

import type { GameBus } from './GameEvents';
import type { GameLoop, Players } from './GameLoop';
import { SAVE_VERSION, toSavedMoves } from './SavedGame';
import type { SavedGame } from './SavedGame';

/** What only the composition root can answer at the moment of saving. */
export interface SaveContext {
  readonly area: SelectedArea;
  readonly players: Players;
  readonly difficulty: Difficulty;
}

export interface SaveManagerDeps {
  readonly bus: GameBus;
  readonly store: JsonStore<SavedGame>;
  readonly context: () => SaveContext;
  /** Wall clock, injectable so a test can assert on `savedAt`. */
  readonly now?: () => Date;
}

export class SaveManager {
  private readonly unsubscribe: (() => void)[];
  private moves: readonly MoveRequest[] = [];
  private resignedBy: Color | null = null;

  public constructor(private readonly deps: SaveManagerDeps) {
    this.unsubscribe = [
      deps.bus.on('game-started', () => {
        this.moves = [];
        this.resignedBy = null;
      }),
      deps.bus.on('history-changed', ({ moves }) => {
        this.moves = toSavedMoves(moves);
        this.write();
      }),
      deps.bus.on('game-over', ({ outcome }) => {
        // Only resignation is invisible in the move list, so only it is stored.
        this.resignedBy = outcome.kind === 'resignation' ? outcome.loser : null;
        this.write();
      }),
    ];
  }

  /** The saved game, or null if there is none this version can read. */
  public read(): SavedGame | null {
    return this.deps.store.read();
  }

  public hasSave(): boolean {
    return this.read() !== null;
  }

  /** Replays the saved game into the loop. Null if there was nothing to resume. */
  public resume(loop: GameLoop): SavedGame | null {
    const saved = this.read();
    if (saved === null) return null;
    loop.restore({ moves: saved.moves, players: saved.players, resignedBy: saved.resignedBy });
    return saved;
  }

  public clear(): void {
    this.deps.store.clear();
  }

  public dispose(): void {
    for (const off of this.unsubscribe) off();
  }

  private write(): void {
    // A game with nothing in it is not worth saving, and writing one destroys
    // the game the player is about to be offered. Starting the app starts a
    // fresh board before the menu opens, and that start publishes an empty
    // history — which used to overwrite the save 150 ms after the page loaded,
    // so "Resume game" restored an empty board while the menu, holding the copy
    // it had read a moment earlier, still promised twelve moves.
    if (this.moves.length === 0 && this.resignedBy === null) return;

    const { area, players, difficulty } = this.deps.context();
    const now = this.deps.now ?? (() => new Date());
    this.deps.store.write({
      version: SAVE_VERSION,
      savedAt: now().toISOString(),
      area,
      players,
      difficulty,
      moves: this.moves,
      resignedBy: this.resignedBy,
    });
  }
}
