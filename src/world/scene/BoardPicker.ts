// WHAT: Answers "which square did the player click?".
// HOW:  Raycasts against the piece group and the cell meshes. A piece hit is
//       resolved through PieceLayer. A cell hit gives a world point; the
//       square is whichever cell polygon contains its (x, z) — an exact test
//       because cells tile the board without overlap.
// WHY:  Cells are merged into two meshes (D-010), so a hit cannot be looked up
//       by object. Point-in-polygon against IBoardLayout works for any cell
//       shape and needs no per-cell pick geometry.

import { Raycaster, Vector2 } from 'three';
import type { Camera, Object3D } from 'three';

import type { IBoardLayout } from '@domain/board/IBoardLayout';
import { containsPoint } from '@domain/board/polygon';
import type { Square } from '@domain/board/Square';
import type { PieceLayer } from '@world/pieces/PieceLayer';

import type { NdcPoint } from './PointerInput';

export class BoardPicker {
  private readonly raycaster = new Raycaster();
  private readonly ndc = new Vector2();

  public constructor(
    private readonly camera: Camera,
    private readonly layout: IBoardLayout,
    private readonly cells: Object3D,
    private readonly pieces: PieceLayer,
  ) {}

  public pick(point: NdcPoint): Square | null {
    this.ndc.set(point.x, point.y);
    this.raycaster.setFromCamera(this.ndc, this.camera);

    const hits = this.raycaster.intersectObjects([this.pieces.group, this.cells], true);
    const hit = hits[0];
    if (hit === undefined) return null;

    const viaPiece = this.pieces.squareOf(hit.object);
    if (viaPiece !== null) return viaPiece;

    const p = { x: hit.point.x, z: hit.point.z };
    return this.layout.cells.find((c) => containsPoint(c.polygon, p))?.square ?? null;
  }
}
