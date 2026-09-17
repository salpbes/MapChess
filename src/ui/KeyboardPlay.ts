// WHAT: Playing the board without a mouse: a cursor you move with the arrow
//       keys or name outright ("e4"), Enter to act on it, Escape to let go.
// HOW:  One keydown listener. The cursor is a Square, moved by clamping a
//       file/rank index; Enter hands that square to the same
//       `handleSquareClick` a mouse click does, so selecting, moving,
//       capturing, castling on the rook and the promotion prompt all behave
//       exactly as they already do. Nothing here knows the rules.
// WHY:  BUILD_PLAN §13.7. A board that can only be played by pointing at it
//       cannot be played by anyone who does not point — and the whole game is
//       already a state machine driven by one square at a time, so the second
//       input is a different way of naming a square rather than a second
//       implementation of the game.

import { BOARD_SIZE, fileIndex, rankIndex, squareAt } from '@domain/board/Square';
import type { File, Rank, Square } from '@domain/board/Square';

export interface KeyboardPlayDeps {
  /** The same entry point a click uses. */
  readonly onActivate: (square: Square) => void;
  /** Escape: drop the selection without playing anything. */
  readonly onCancel: () => void;
  /** Called whenever the cursor lands somewhere, so it can be drawn. */
  readonly onCursorMoved: (square: Square | null) => void;
  /** True while a menu, picker or prompt owns the keyboard. */
  readonly isBlocked: () => boolean;
}

/**
 * Where the cursor starts: White's king's pawn, the square a first move most
 * often comes from, rather than a corner nobody wants.
 */
const HOME: Square = 'e2';

const STEP: Readonly<Record<string, { readonly file: number; readonly rank: number }>> = {
  // Up is north, toward Black, because the camera starts behind White. An
  // orbited camera no longer agrees; the cursor is drawn on the board, so the
  // player can see where it went.
  ArrowUp: { file: 0, rank: 1 },
  ArrowDown: { file: 0, rank: -1 },
  ArrowLeft: { file: -1, rank: 0 },
  ArrowRight: { file: 1, rank: 0 },
};

export class KeyboardPlay {
  private cursor: Square | null = null;
  /** A file typed and waiting for its rank, as in "e" then "4". */
  private pendingFile: File | null = null;
  private readonly onKeyDown: (event: KeyboardEvent) => void;

  public constructor(private readonly deps: KeyboardPlayDeps) {
    this.onKeyDown = (event) => {
      this.handle(event);
    };
    window.addEventListener('keydown', this.onKeyDown);
  }

  public dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
  }

  /** Takes the cursor off the board — when a new game starts, say. */
  public reset(): void {
    this.cursor = null;
    this.pendingFile = null;
    this.deps.onCursorMoved(null);
  }

  private handle(event: KeyboardEvent): void {
    // A modifier means the key belongs to the browser or the operating system.
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (this.deps.isBlocked() || isTyping(event.target)) return;

    const step = STEP[event.key];
    if (step !== undefined) {
      event.preventDefault();
      this.move(step.file, step.rank);
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      // Space on a focused button is that button's; only claim it for the board.
      if (event.key === ' ' && isButton(event.target)) return;
      if (this.cursor === null) {
        event.preventDefault();
        this.place(HOME);
        return;
      }
      event.preventDefault();
      this.pendingFile = null;
      this.deps.onActivate(this.cursor);
      return;
    }

    if (event.key === 'Escape') {
      this.pendingFile = null;
      this.deps.onCancel();
      return;
    }

    this.typeSquare(event);
  }

  /** "e" then "4" jumps straight to e4, which is faster than eight presses. */
  private typeSquare(event: KeyboardEvent): void {
    const key = event.key.toLowerCase();
    if (key >= 'a' && key <= 'h' && key.length === 1) {
      event.preventDefault();
      this.pendingFile = key as File;
      return;
    }
    if (key >= '1' && key <= '8' && key.length === 1 && this.pendingFile !== null) {
      event.preventDefault();
      this.place(`${this.pendingFile}${key as Rank}`);
      this.pendingFile = null;
    }
  }

  private move(byFile: number, byRank: number): void {
    if (this.cursor === null) {
      this.place(HOME);
      return;
    }
    const file = clamp(fileIndex(this.cursor) + byFile);
    const rank = clamp(rankIndex(this.cursor) + byRank);
    this.place(squareAt(file, rank));
  }

  private place(square: Square): void {
    this.cursor = square;
    this.deps.onCursorMoved(square);
  }
}

function clamp(index: number): number {
  return Math.min(Math.max(index, 0), BOARD_SIZE - 1);
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

function isButton(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.tagName === 'BUTTON';
}
