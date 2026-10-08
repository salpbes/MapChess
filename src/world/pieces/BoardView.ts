// WHAT: IBoardView implemented with PieceLayer, HighlightLayer and MoveAnimator.
// HOW:  `playMove` reads the facts a Move carries — captured square, castle
//       rook path, promotion — and choreographs them: mover (and rook) arc to
//       their squares together; the captured piece is knocked over as the
//       mover lands (CaptureEffects), or simply removed when there is no one
//       to knock it; a promoted pawn is swapped for its new piece.
// WHY:  All chess knowledge stays in the Move; this file only sequences
//       animations. That is why en passant and castling need no special rules
//       here, just data.

import type { Group } from 'three';

import type { Move, PlacedPiece } from '@domain/chess/types';
import type { BoardHighlights, IBoardView } from '@game/IBoardView';

import type { CaptureEffects } from './CaptureEffects';
import type { HighlightLayer } from './HighlightLayer';
import type { MoveAnimator } from './MoveAnimator';
import type { PieceLayer } from './PieceLayer';

export class BoardView implements IBoardView {
  /** Bumped by every `showPosition`, so a move in flight can tell it was overtaken. */
  private resyncs = 0;

  public constructor(
    private readonly pieces: PieceLayer,
    private readonly highlights: HighlightLayer,
    private readonly animator: MoveAnimator,
    private readonly captures: CaptureEffects | null = null,
  ) {}

  /** Objects the stage must contain for this view to be visible. */
  public get objects(): readonly Group[] {
    return [this.pieces.group, this.highlights.group];
  }

  public showPosition(pieces: readonly PlacedPiece[]): void {
    this.resyncs += 1;
    this.animator.flush();
    this.pieces.sync(pieces);
  }

  public async playMove(move: Move): Promise<void> {
    const mover = this.pieces.objectAt(move.from);
    if (mover === null) {
      throw new Error(`BoardView is out of sync: no piece on ${move.from}.`);
    }

    const travels: Promise<void>[] = [
      this.animator.animate(mover, this.pieces.positionFor(move.to)),
    ];

    if (move.castle !== null) {
      const rook = this.pieces.objectAt(move.castle.rookFrom);
      if (rook !== null) {
        travels.push(this.animator.animate(rook, this.pieces.positionFor(move.castle.rookTo)));
      }
    }

    const resyncs = this.resyncs;
    await Promise.all(travels);

    // The board was rebuilt from the engine while the piece was in the air —
    // new piece models arriving, say. The engine already holds this move, so
    // the rebuild placed everything where it belongs, and there is nothing
    // left to relocate or capture.
    if (this.resyncs !== resyncs) return;

    if (move.capturedSquare !== null) {
      const victim = this.pieces.release(move.capturedSquare);
      if (victim !== null && this.captures !== null) {
        this.captures.knockOver(
          victim,
          move.capturedSquare,
          this.pieces.positionFor(move.from),
          this.pieces.positionFor(move.to),
        );
      } else {
        victim?.removeFromParent();
      }
    }
    this.pieces.relocate(move.from, move.to);
    if (move.castle !== null) {
      this.pieces.relocate(move.castle.rookFrom, move.castle.rookTo);
    }
    if (move.promotion !== null) {
      this.pieces.replace(move.to, { type: move.promotion, color: move.color });
    }
  }

  public showHighlights(highlights: BoardHighlights): void {
    this.highlights.show(highlights);
  }

  public clearHighlights(): void {
    this.highlights.clear();
  }
}
