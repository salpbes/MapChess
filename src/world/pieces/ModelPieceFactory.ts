// WHAT: IPieceMeshFactory that hands out GLB models where one exists, and
//       falls back to the procedural piece everywhere else.
// HOW:  Clones a normalised template per piece. Cloning shares geometry and
//       materials, so four rooks cost one rook's memory. Anything with no
//       model is asked of the wrapped factory, so a board can mix the two
//       without knowing it is doing so — including a board that starts with no
//       models at all and adopts them once they finish downloading.
// WHY:  IPieceMeshFactory was written for exactly this ("if hand-made GLB
//       models arrive later, a GltfPieceFactory implements this and nothing in
//       PieceLayer or the game changes"). Being able to swap one piece at a
//       time is what lets the game open on the drawn set and upgrade itself,
//       instead of holding the first frame hostage to 37 MB of texture.

import type { Object3D } from 'three';

import type { Piece } from '@domain/chess/types';

import type { IPieceMeshFactory } from './IPieceMeshFactory';
import type { ModelKey, PieceModels } from './loadPieceModels';

export class ModelPieceFactory implements IPieceMeshFactory {
  private readonly models = new Map<ModelKey, Object3D>();

  public constructor(
    models: PieceModels,
    private readonly fallback: IPieceMeshFactory,
  ) {
    this.adopt(models);
  }

  /**
   * Takes on models that finished loading after the board was already built.
   *
   * This only changes what `create` hands out from here on. Pieces already
   * standing were built from whatever existed at the time, so the caller
   * re-places the position afterwards to bring them across.
   */
  public adopt(models: PieceModels): void {
    for (const [key, template] of models) {
      this.models.set(key, template);
    }
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
