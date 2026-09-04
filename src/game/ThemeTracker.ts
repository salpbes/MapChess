// WHAT: Keeps a BoardTheme and a PieceTracker in step with the game bus.
// HOW:  On `game-started` the tracker resets to the theme's identities; on
//       `move-played` it applies the move, remembering the identity of anything
//       captured so `move-undone` can put it back. `setTheme` swaps the theme
//       (a new area) and, at move zero, re-seats identities from it; mid-game
//       it keeps them and only cell names change. Exposes what the UI needs to
//       describe a square: the piece there (if any) and the cell it stands on.
// WHY:  game/ owns "who is who"; ui/ should only ask. Keeping the bus wiring
//       here means the card, the game-over screen and the save system never
//       touch the tracker.

import type { Square } from '@domain/board/Square';
import type { Color, Move } from '@domain/chess/types';
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
  /** One entry per played move, so an undo can restore what the move removed. */
  private readonly undoStack: { move: Move; captured: TrackedPiece | null }[] = [];
  private readonly unsubscribe: (() => void)[];

  public constructor(bus: GameBus) {
    this.unsubscribe = [
      bus.on('game-started', () => {
        this.undoStack.length = 0;
        this.reseat();
      }),
      bus.on('move-played', (move) => {
        const captured = move.capturedSquare === null ? null : this.tracker.at(move.capturedSquare);
        this.undoStack.push({ move, captured });
        this.tracker.apply(move);
      }),
      bus.on('move-undone', () => {
        const last = this.undoStack.pop();
        if (last !== undefined) this.tracker.undo(last.move, last.captured);
      }),
    ];
  }

  public setTheme(theme: BoardTheme | null): void {
    this.theme = theme;
    // Mid-game area changes keep the pieces' stories; only at move zero do they take new ones.
    if (this.undoStack.length === 0) this.reseat();
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

  /** The named identity of a colour's king, for announcing a result. */
  public king(color: Color): TrackedPiece | null {
    return this.tracker.all().find((p) => p.currentType === 'king' && p.color === color) ?? null;
  }

  /** Where that king is standing now — the ground a result is decided on. */
  public kingSquare(color: Color): Square | null {
    return (
      this.tracker.entries().find(([, p]) => p.currentType === 'king' && p.color === color)?.[0] ??
      null
    );
  }

  public dispose(): void {
    for (const off of this.unsubscribe) off();
  }

  private reseat(): void {
    this.tracker.reset(this.theme?.pieces ?? []);
  }
}
