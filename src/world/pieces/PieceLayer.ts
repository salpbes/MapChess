// WHAT: Keeps the 3D pieces in step with a set of board squares.
// HOW:  A map square → Object3D. Placement reads the cell centroid and platform
//       height from IBoardLayout: position only, plus a yaw so each side faces
//       its opponent. Rotation X and Z are never touched. Movement bookkeeping
//       (`relocate`, `remove`, `replace`) is instant; the MoveAnimator handles
//       the visual travel separately and then calls `relocate`.
// WHY:  BUILD_PLAN §2 "piece orientation: always upright". This is the only
//       file that sets a piece's transform, so the rule has one place to live.

import { Group, Vector3 } from 'three';
import type { Object3D } from 'three';

import type { IBoardLayout } from '@domain/board/IBoardLayout';
import type { Square } from '@domain/board/Square';
import type { Piece, PlacedPiece } from '@domain/chess/types';

import type { IPieceMeshFactory } from './IPieceMeshFactory';

export class PieceLayer {
  public readonly group = new Group();
  private readonly bySquare = new Map<Square, Object3D>();
  private layout: IBoardLayout;

  public constructor(
    layout: IBoardLayout,
    private readonly factory: IPieceMeshFactory,
  ) {
    this.layout = layout;
    this.group.name = 'pieces';
  }

  /** Points every piece at its square's new position; call `sync` afterwards to be safe. */
  public setLayout(layout: IBoardLayout): void {
    this.layout = layout;
    for (const [square, object] of this.bySquare) object.position.copy(this.positionFor(square));
  }

  /** Discards every piece and rebuilds from the given position. */
  public sync(pieces: readonly PlacedPiece[]): void {
    this.group.clear();
    this.bySquare.clear();
    for (const { square, piece } of pieces) {
      this.spawn(square, piece);
    }
  }

  public objectAt(square: Square): Object3D | null {
    return this.bySquare.get(square) ?? null;
  }

  /** Walks up from any hit object to find which square's piece it belongs to. */
  public squareOf(object: Object3D): Square | null {
    let node: Object3D | null = object;
    while (node !== null && node !== this.group) {
      const found = this.findSquare(node);
      if (found !== null) return found;
      node = node.parent;
    }
    return null;
  }

  /** Where a piece stands on this square: centroid at platform height. */
  public positionFor(square: Square): Vector3 {
    const cell = this.layout.cell(square);
    return new Vector3(cell.centroid.x, cell.platformY, cell.centroid.z);
  }

  /** Moves the bookkeeping and snaps the object to its new square. */
  public relocate(from: Square, to: Square): void {
    const object = this.bySquare.get(from);
    if (object === undefined) {
      throw new Error(`No piece on ${from} to relocate.`);
    }
    this.bySquare.delete(from);
    this.bySquare.set(to, object);
    object.position.copy(this.positionFor(to));
  }

  public remove(square: Square): void {
    const object = this.bySquare.get(square);
    if (object === undefined) return;
    this.bySquare.delete(square);
    this.group.remove(object);
  }

  /** Swaps the mesh on a square for a different piece (promotion). */
  public replace(square: Square, piece: Piece): void {
    this.remove(square);
    this.spawn(square, piece);
  }

  private spawn(square: Square, piece: Piece): void {
    const object = this.factory.create(piece);
    object.position.copy(this.positionFor(square));
    // Yaw only: White faces north (−Z), Black faces south. Never tilt.
    object.rotation.set(0, piece.color === 'white' ? 0 : Math.PI, 0);
    this.group.add(object);
    this.bySquare.set(square, object);
  }

  private findSquare(object: Object3D): Square | null {
    for (const [square, candidate] of this.bySquare) {
      if (candidate === object) return square;
    }
    return null;
  }
}
