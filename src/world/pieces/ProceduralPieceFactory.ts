// WHAT: IPieceMeshFactory that builds pieces from PieceGeometry profiles.
// HOW:  Caches one geometry per piece type and one material per colour; each
//       `create` returns a fresh Mesh sharing them. Meshes are tagged with the
//       piece in `userData` so pickers can identify what was hit.
// WHY:  32 pieces, 6 geometries, 2 materials. Sharing keeps memory and draw
//       state small; the factory owns disposal so nothing leaks on hot reload.

import { Mesh, MeshStandardMaterial } from 'three';
import type { BufferGeometry, Object3D } from 'three';

import type { Color, Piece, PieceType } from '@domain/chess/types';

import type { IPieceMeshFactory } from './IPieceMeshFactory';
import { createPieceGeometry } from './PieceGeometry';

const COLORS: Readonly<Record<Color, number>> = {
  white: 0xe9e2d3,
  black: 0x2a2b31,
};

export class ProceduralPieceFactory implements IPieceMeshFactory {
  private readonly geometries = new Map<PieceType, BufferGeometry>();
  private readonly materials: Readonly<Record<Color, MeshStandardMaterial>>;

  /** @param unit metres per nominal cell width; sets the piece scale once for the whole game. */
  public constructor(private readonly unit: number) {
    this.materials = {
      white: new MeshStandardMaterial({ color: COLORS.white, roughness: 0.55, flatShading: true }),
      black: new MeshStandardMaterial({ color: COLORS.black, roughness: 0.5, flatShading: true }),
    };
  }

  public create(piece: Piece): Object3D {
    const mesh = new Mesh(this.geometryFor(piece.type), this.materials[piece.color]);
    mesh.name = `${piece.color}-${piece.type}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { piece };
    return mesh;
  }

  public dispose(): void {
    for (const g of this.geometries.values()) g.dispose();
    this.geometries.clear();
    this.materials.white.dispose();
    this.materials.black.dispose();
  }

  private geometryFor(type: PieceType): BufferGeometry {
    let g = this.geometries.get(type);
    if (g === undefined) {
      g = createPieceGeometry(type, this.unit);
      this.geometries.set(type, g);
    }
    return g;
  }
}
