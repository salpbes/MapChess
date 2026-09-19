// WHAT: Procedural low-poly geometry for the six piece types.
// HOW:  Each piece is a lathe (turned) profile in "cell units" where 1 = the
//       width of a nominal cell; the king adds a cross, the rook a ring of
//       merlons, the queen a coronet of points, and the knight and the bishop
//       an extruded silhouette on top. Everything is scaled by
//       `unit` metres and
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
  // The plain one: a narrow base, one collar, a ball. Everything the bishop
  // has that the pawn lacks is deliberate — see the note above `bishop`.
  pawn: [
    [0.21, 0.14],
    [0.135, 0.21],
    [0.12, 0.28],
    [0.175, 0.315],
    [0.095, 0.35],
    [0.155, 0.41],
    [0.15, 0.46],
    [0.095, 0.505],
    [0, 0.52],
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
  /**
   * Three cues separate this from the pawn at a glance, because on a board seen
   * from across the room one is never enough: it stands 1.7× as tall, its stem
   * is slimmer and unbroken where the pawn's is short and collared, and the
   * mitre flares into a wide brim before tapering to a point and a finial —
   * against the pawn's plain ball. Height alone failed: both were round blobs.
   */
  /**
   * Stem and brim only: the mitre on top is `BISHOP_MITRE`, extruded rather
   * than turned. Reshaping the profile was not enough — a lathed bishop and a
   * lathed pawn are both turned blobs, and at playing distance that is all
   * either of them reads as. The knight has never once been mistaken for
   * anything, and the reason is that it is not a solid of revolution. So the
   * bishop stops being one too: it now has flat sides that catch the light
   * differently as the board turns, and the slit that actually names the piece.
   */
  bishop: [
    [0.24, 0.14],
    [0.145, 0.24],
    [0.1, 0.42],
    [0.115, 0.48],
    [0.205, 0.545],
    [0.185, 0.572],
    [0.075, 0.582],
    [0, 0.586],
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

/**
 * Bishop mitre in the XY plane: +X forward, +Y up, sitting on the brim at
 * y = 0.545. The notch on the leading edge is the bishop's slit — the one
 * feature of the piece everybody recognises, and impossible on a lathe.
 */
const BISHOP_MITRE: readonly [number, number][] = [
  [-0.14, 0.545],
  [0.14, 0.545],
  [0.15, 0.611],
  [0.132, 0.677],
  [0.108, 0.727],
  [0.12, 0.759],
  [0.04, 0.745],
  [0.076, 0.793],
  [0.03, 0.821],
  [0.0, 0.84],
  [-0.048, 0.797],
  [-0.092, 0.727],
  [-0.126, 0.651],
  [-0.146, 0.6],
];
/** Wider than the knight's head: the mitre must read as solid, not as a plate. */
const BISHOP_THICKNESS = 0.19;

/*
  The rook's battlements and the queen's coronet, for the same reason the
  bishop got a mitre: a turned profile is a blob at playing distance, and the
  two pieces players actually confuse are the ones still made only on a lathe.
  A rook is named after its notched top and a queen after her points — put
  those back and the silhouette does the telling, at any size, from any angle,
  in any colour.

  Both rings keep four-fold symmetry (four merlons, eight points), so the
  pieces stay square-footed and still read the same whichever way the board is
  turned. Neither has a facing; only the knight and the bishop do.
*/
const ROOK_MERLONS = { count: 4, radius: 0.185, size: 0.1, y: 0.72 };
const QUEEN_POINTS = { count: 8, radius: 0.175, width: 0.055, height: 0.11, y: 0.855 };

export function createPieceGeometry(type: PieceType, unit: number): BufferGeometry {
  const parts: BufferGeometry[] = [lathe([...PLINTH, ...BODY[type]], unit)];

  if (type === 'king') {
    // Bolder than it was: the cross is the whole of what separates him from
    // the queen, and at a board's length the old one was a speck.
    parts.push(box(0.07, 0.22, 0.07, 0, 1.0, unit), box(0.2, 0.07, 0.07, 0, 1.03, unit));
  }
  if (type === 'rook') {
    const m = ROOK_MERLONS;
    parts.push(...ring(m.count, m.radius, m.size, m.size, m.size, m.y, unit));
  }
  if (type === 'queen') {
    const q = QUEEN_POINTS;
    parts.push(...ring(q.count, q.radius, q.width, q.height, q.width, q.y, unit));
  }
  if (type === 'knight') {
    parts.push(upright(KNIGHT_HEAD, KNIGHT_THICKNESS, unit));
  }
  if (type === 'bishop') {
    parts.push(upright(BISHOP_MITRE, BISHOP_THICKNESS, unit));
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

/**
 * `count` boxes stood evenly around the axis at `radius`.
 *
 * Translate-then-rotate, so each box keeps its own edges square to the radius
 * it sits on — a battlement whose blocks are all turned the same way reads as
 * a cog rather than a tower.
 */
function ring(
  count: number,
  radius: number,
  w: number,
  h: number,
  d: number,
  y: number,
  unit: number,
): BufferGeometry[] {
  const out: BufferGeometry[] = [];
  for (let i = 0; i < count; i += 1) {
    const g = new BoxGeometry(w * unit, h * unit, d * unit).toNonIndexed();
    g.translate(radius * unit, y * unit, 0);
    g.rotateY((i / count) * Math.PI * 2);
    out.push(g);
  }
  return out;
}

/** A flat silhouette stood upright and centred on the axis, facing forward. */
function upright(
  outline: readonly [number, number][],
  thickness: number,
  unit: number,
): BufferGeometry {
  const shape = new Shape(outline.map(([x, y]) => new Vector2(x * unit, y * unit)));
  const depth = thickness * unit;
  const g = new ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  // Extrude runs along +Z; centre it, then turn the silhouette so "forward" is −Z.
  g.translate(0, 0, -depth / 2);
  g.rotateY(Math.PI / 2);
  return g;
}
