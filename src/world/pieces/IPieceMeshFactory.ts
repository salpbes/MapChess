// WHAT: The seam for "give me a 3D object for this piece".
// HOW:  One method. Implementations own geometry caching and materials.
//       The returned object must have its origin at the feet (y = 0), stand
//       upright along +Y, and face −Z (north, toward Black) at yaw 0.
// WHY:  Phase 3 ships procedural pieces (D-013). If hand-made GLB models
//       arrive later, a `GltfPieceFactory` implements this and nothing in
//       PieceLayer or the game changes.

import type { Object3D } from 'three';

import type { Piece } from '@domain/chess/types';

export interface IPieceMeshFactory {
  create(piece: Piece): Object3D;
  dispose(): void;
}
