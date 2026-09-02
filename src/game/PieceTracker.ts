// WHAT: Follows each piece's identity as the game moves it around.
// HOW:  Starts from PieceIdentity[] keyed by home square. On every Move it
//       relocates from → to (and the castling rook), drops the captured piece,
//       and on promotion keeps the identity but records the new type. Reset
//       on new game. Pure bookkeeping over domain types.
// WHY:  "This rook is Ashberry Hill" must stay true after the rook moves.
//       The engine knows pieces by square only; this is the memory of who is who.

import type { Square } from '@domain/board/Square';
import type { Move, PieceType } from '@domain/chess/types';
import type { PieceIdentity } from '@domain/theme/types';

export interface TrackedPiece extends PieceIdentity {
  /** Current piece type — differs from the home type only after promotion. */
  readonly currentType: PieceType;
}

export class PieceTracker {
  private bySquare = new Map<Square, TrackedPiece>();

  public reset(identities: readonly PieceIdentity[]): void {
    this.bySquare = new Map(identities.map((p) => [p.homeSquare, { ...p, currentType: p.type }]));
  }

  public at(square: Square): TrackedPiece | null {
    return this.bySquare.get(square) ?? null;
  }

  public apply(move: Move): void {
    if (move.capturedSquare !== null) this.bySquare.delete(move.capturedSquare);
    const mover = this.bySquare.get(move.from);
    this.bySquare.delete(move.from);
    if (mover !== undefined) {
      this.bySquare.set(
        move.to,
        move.promotion === null ? mover : { ...mover, currentType: move.promotion },
      );
    }
    if (move.castle !== null) {
      const rook = this.bySquare.get(move.castle.rookFrom);
      this.bySquare.delete(move.castle.rookFrom);
      if (rook !== undefined) this.bySquare.set(move.castle.rookTo, rook);
    }
  }

  public undo(move: Move, captured: TrackedPiece | null): void {
    const mover = this.bySquare.get(move.to);
    this.bySquare.delete(move.to);
    if (mover !== undefined)
      this.bySquare.set(
        move.from,
        move.promotion === null ? mover : { ...mover, currentType: mover.type },
      );
    if (move.castle !== null) {
      const rook = this.bySquare.get(move.castle.rookTo);
      this.bySquare.delete(move.castle.rookTo);
      if (rook !== undefined) this.bySquare.set(move.castle.rookFrom, rook);
    }
    if (move.capturedSquare !== null && captured !== null)
      this.bySquare.set(move.capturedSquare, captured);
  }

  public all(): readonly TrackedPiece[] {
    return [...this.bySquare.values()];
  }
}
