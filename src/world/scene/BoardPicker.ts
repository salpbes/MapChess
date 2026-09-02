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
  private layout: IBoardLayout;
  private cells: Object3D | null;

  public constructor(
    private readonly camera: Camera,
    layout: IBoardLayout,
    cells: Object3D | null,
    private readonly pieces: PieceLayer,
  ) {
    this.layout = layout;
    this.cells = cells;
  }

  public setLayout(layout: IBoardLayout, cells: Object3D): void {
    this.layout = layout;
    this.cells = cells;
  }

  public pick(point: NdcPoint): Square | null {
    this.ndc.set(point.x, point.y);
    this.raycaster.setFromCamera(this.ndc, this.camera);

    const targets: Object3D[] = [this.pieces.group];
    if (this.cells !== null) targets.push(this.cells);
    const hits = this.raycaster.intersectObjects(targets, true);
    const hit = hits[0];
    if (hit === undefined) return null;

    const viaPiece = this.pieces.squareOf(hit.object);
    if (viaPiece !== null) return viaPiece;

    const p = { x: hit.point.x, z: hit.point.z };
    return this.layout.cells.find((c) => containsPoint(c.polygon, p))?.square ?? null;
  }
}
