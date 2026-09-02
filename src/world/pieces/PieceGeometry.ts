// WHAT: Procedural low-poly geometry for the six piece types.
// HOW:  Each piece is a lathe (turned) profile in "cell units" where 1 = the
//       width of a nominal cell; the king adds a cross, the knight adds an
//       extruded head silhouette. Everything is scaled by `unit` metres and
//       merged into one non-indexed geometry so flat shading gives hard facets.
//       Every profile starts with the same plinth disc, wider than the body.
// WHY:  D-013 — no external models. Profiles as data keep the file readable
//       and let the look be tuned by editing numbers, not meshes. The plinth
//       is BUILD_PLAN §2's "base disc slightly wider than its footprint".

import { BoxGeometry, ExtrudeGeometry, LatheGeometry, Shape, Vector2 } from 'three';
import type { BufferGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import type { PieceType } from '@domain/chess/types';

/** Few segments on purpose: the facets are the style. */
const LATHE_SEGMENTS = 12;

/** Shared plinth: [radius, height] pairs from the centre of the base outward and up. Radius must stay ≤ latticeWarp minInradius. */
const PLINTH: readonly [number, number][] = [
  [0, 0],
  [0.3, 0],
  [0.3, 0.04],
  [0.26, 0.06],
];

/** Body profiles continue from the plinth. Last point must be on the axis (radius 0). */
const BODY: Readonly<Record<PieceType, readonly [number, number][]>> = {
  pawn: [
    [0.22, 0.14],
    [0.14, 0.22],
    [0.12, 0.3],
    [0.17, 0.34],
    [0.11, 0.38],
    [0.14, 0.44],
    [0.15, 0.5],
    [0.1, 0.56],
    [0, 0.58],
  ],
  rook: [
    [0.24, 0.14],
    [0.18, 0.22],
    [0.17, 0.5],
    [0.23, 0.54],
    [0.23, 0.68],
    [0.16, 0.68],
    [0.16, 0.6],
    [0, 0.6],
  ],
  knight: [
    [0.22, 0.14],
    [0.18, 0.18],
    [0, 0.18],
  ],
  bishop: [
    [0.24, 0.14],
    [0.15, 0.24],
    [0.12, 0.4],
    [0.18, 0.48],
    [0.12, 0.52],
    [0.16, 0.62],
    [0.1, 0.72],
    [0.05, 0.78],
    [0.04, 0.82],
    [0, 0.84],
  ],
  queen: [
    [0.26, 0.14],
    [0.16, 0.26],
    [0.13, 0.5],
    [0.2, 0.6],
    [0.15, 0.64],
    [0.22, 0.76],
    [0.18, 0.84],
    [0.1, 0.86],
    [0.08, 0.92],
    [0, 0.94],
  ],
  king: [
    [0.27, 0.14],
    [0.17, 0.26],
    [0.14, 0.54],
    [0.21, 0.64],
    [0.16, 0.68],
    [0.23, 0.8],
    [0.18, 0.86],
    [0.1, 0.88],
    [0.06, 0.9],
    [0, 0.9],
  ],
};

/** Knight head silhouette in the XY plane: +X is forward, +Y up. Sits on the neck at y = 0.18. */
const KNIGHT_HEAD: readonly [number, number][] = [
  [-0.15, 0.18],
  [0.15, 0.18],
  [0.16, 0.3],
  [0.08, 0.4],
  [0.21, 0.5],
  [0.23, 0.6],
  [0.11, 0.63],
  [0.07, 0.74],
  [0.0, 0.66],
  [-0.06, 0.74],
  [-0.12, 0.6],
  [-0.17, 0.4],
];
const KNIGHT_THICKNESS = 0.16;

export function createPieceGeometry(type: PieceType, unit: number): BufferGeometry {
  const parts: BufferGeometry[] = [lathe([...PLINTH, ...BODY[type]], unit)];

  if (type === 'king') {
    parts.push(box(0.05, 0.16, 0.05, 0, 0.98, unit), box(0.14, 0.05, 0.05, 0, 1.0, unit));
  }
  if (type === 'knight') {
    parts.push(knightHead(unit));
  }

  const merged = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  merged.computeVertexNormals();
  return merged;
}

function lathe(profile: readonly [number, number][], unit: number): BufferGeometry {
  const points = profile.map(([r, y]) => new Vector2(r * unit, y * unit));
  return new LatheGeometry(points, LATHE_SEGMENTS).toNonIndexed();
}

function box(w: number, h: number, d: number, x: number, y: number, unit: number): BufferGeometry {
  const g = new BoxGeometry(w * unit, h * unit, d * unit).toNonIndexed();
  g.translate(x * unit, y * unit, 0);
  return g;
}

function knightHead(unit: number): BufferGeometry {
  const shape = new Shape(KNIGHT_HEAD.map(([x, y]) => new Vector2(x * unit, y * unit)));
  const depth = KNIGHT_THICKNESS * unit;
  const g = new ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  // Extrude runs along +Z; centre it, then turn the silhouette so "forward" is −Z.
  g.translate(0, 0, -depth / 2);
  g.rotateY(Math.PI / 2);
  return g;
}
