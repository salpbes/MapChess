// WHAT: Plain data types describing board geometry.
// HOW:  Points are in board-local metres, Y-up, matching three.js so no axis
//       conversion is needed downstream. +X is east, +Z is south (toward White),
//       Y is height. See DECISIONS.md D-007 and D-008.
// WHY:  `domain/` cannot import three.js, so it needs its own tiny vocabulary
//       for positions. Keeping it to {x, z} + a separate height stops anyone
//       accidentally tilting a piece to the terrain.

import type { Square } from './Square';

/** A point on the ground plane, in board-local metres. */
export interface BoardPoint {
  readonly x: number;
  readonly z: number;
}

export type CellShade = 'light' | 'dark';

/** One of the 64 chess squares, as a shape in the world. */
export interface Cell {
  readonly square: Square;
  /**
   * Convex polygon, counter-clockwise when viewed from above with north (−Z)
   * at the top. Three or more points; no repeated closing point.
   */
  readonly polygon: readonly BoardPoint[];
  /** Where a piece stands. Always inside the polygon. */
  readonly centroid: BoardPoint;
  /** Height of the level platform the piece stands on, in metres. */
  readonly platformY: number;
  readonly shade: CellShade;
}

/** Axis-aligned extent of the whole board, used for camera framing. */
export interface BoardBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly minY: number;
  readonly maxY: number;
}
