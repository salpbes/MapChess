// WHAT: Keeps a BoardTheme and a PieceTracker in step with the game bus.
// HOW:  On `game-started` the tracker resets to the theme's identities; on
//       `move-played` it applies the move. `setTheme` swaps the theme (a new
//       area) and, if a game is in progress from the start position, re-seats
//       identities on the current squares by replaying nothing — it simply
//       resets, which is correct only at move zero; otherwise identities are
//       kept and only cell names change. Exposes what the UI needs to describe
//       a square: the piece there (if any) and the cell it stands on.
// WHY:  game/ owns "who is who"; ui/ should only ask. Keeping the bus wiring
//       here means the card, and later the save system, never touch the tracker.

import type { Square } from '@domain/board/Square';
import type { BoardTheme, CellIdentity } from '@domain/theme/types';

import type { GameBus } from './GameEvents';
import { PieceTracker } from './PieceTracker';
import type { TrackedPiece } from './PieceTracker';

export interface SquareStory {
  readonly square: Square;
  readonly piece: TrackedPiece | null;
  readonly cell: CellIdentity | null;
}

export class ThemeTracker {
  private readonly tracker = new PieceTracker();
  private theme: BoardTheme | null = null;
  private movesPlayed = 0;
  private readonly unsubscribe: (() => void)[];

  public constructor(bus: GameBus) {
    this.unsubscribe = [
      bus.on('game-started', () => {
        this.movesPlayed = 0;
        this.reseat();
      }),
      bus.on('move-played', (move) => {
        this.movesPlayed += 1;
        this.tracker.apply(move);
      }),
    ];
  }

  public setTheme(theme: BoardTheme | null): void {
    this.theme = theme;
    // Mid-game area changes keep the pieces' stories; only at move zero do they take new ones.
    if (this.movesPlayed === 0) this.reseat();
  }

  public get current(): BoardTheme | null {
    return this.theme;
  }

  public describe(square: Square): SquareStory {
    return {
      square,
      piece: this.tracker.at(square),
      cell: this.theme?.cells.get(square) ?? null,
    };
  }

  public dispose(): void {
    for (const off of this.unsubscribe) off();
  }

  private reseat(): void {
    this.tracker.reset(this.theme?.pieces ?? []);
  }
}
