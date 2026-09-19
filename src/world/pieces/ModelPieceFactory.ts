// WHAT: IPieceMeshFactory that hands out GLB models where one exists, and
//       falls back to the procedural piece everywhere else.
// HOW:  Clones a normalised template per piece. Cloning shares geometry and
//       materials, so four rooks cost one rook's memory. Anything with no
//       model — five of the six types today — is asked of the wrapped factory,
//       so a board can mix the two without knowing it is doing so.
// WHY:  IPieceMeshFactory was written for exactly this ("if hand-made GLB
//       models arrive later, a GltfPieceFactory implements this and nothing in
//       PieceLayer or the game changes"). Being able to swap one piece at a
//       time is what makes a real model answerable next to the procedural set
//       rather than an all-or-nothing rewrite.

import type { Object3D } from 'three';

import type { Piece } from '@domain/chess/types';

import type { IPieceMeshFactory } from './IPieceMeshFactory';
import type { ModelKey, PieceModels } from './loadPieceModels';

export class ModelPieceFactory implements IPieceMeshFactory {
  public constructor(
    private readonly models: PieceModels,
    private readonly fallback: IPieceMeshFactory,
  ) {}

  /** True when at least one model loaded; otherwise there is nothing to wrap. */
  public get hasModels(): boolean {
    return this.models.size > 0;
  }

  public create(piece: Piece): Object3D {
    const key: ModelKey = `${piece.color}-${piece.type}`;
    const template = this.models.get(key);
    if (template === undefined) return this.fallback.create(piece);

    const object = template.clone(true);
    object.name = key;
    // The picker walks up from whichever mesh the ray hit, so the tag belongs
    // on the root it will arrive at.
    object.userData = { piece };
    return object;
  }

  public dispose(): void {
    this.fallback.dispose();
    for (const template of this.models.values()) {
      template.traverse((node) => {
        const mesh = node as { geometry?: { dispose?: () => void } };
        mesh.geometry?.dispose?.();
      });
    }
  }
}
