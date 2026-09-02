// WHAT: A regular grid of ground heights in board-local metres, plus sampling.
// HOW:  Row-major Float32Array; column index runs along +X (east), row index
//       along +Z (south), matching the board frame so no axis flips are needed
//       downstream. `sampleHeight` is bilinear with edge clamping;
//       `sampleStats` scans the grid points inside a polygon (plus the polygon's
//       own vertices and centroid, so a cell smaller than the grid step still
//       gets an answer) and returns min / mean / max.
// WHY:  BUILD_PLAN Phase 6 asks for exactly these two queries. Phase 8's
//       terracing needs per-cell min/mean/max; Phase 9's terrain mesh needs
//       point samples. Both are pure functions on plain data, tested in Node.

import { centroid, containsPoint } from '@domain/board/polygon';
import type { BoardPoint } from '@domain/board/types';

export interface HeightField {
  /** Board-frame position of sample (col 0, row 0). */
  readonly originX: number;
  readonly originZ: number;
  /** Distance between adjacent samples, metres. */
  readonly stepMeters: number;
  readonly cols: number;
  readonly rows: number;
  /** Heights in metres, row-major: index = row * cols + col. */
  readonly data: Float32Array;
  readonly minMeters: number;
  readonly maxMeters: number;
}

export interface HeightStats {
  readonly min: number;
  readonly mean: number;
  readonly max: number;
  /** How many samples contributed. */
  readonly count: number;
}

export function createHeightField(
  originX: number,
  originZ: number,
  stepMeters: number,
  cols: number,
  rows: number,
  data: Float32Array,
): HeightField {
  if (data.length !== cols * rows) {
    throw new RangeError(
      `HeightField data has ${String(data.length)} values, expected ${String(cols * rows)}.`,
    );
  }
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const v of data) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { originX, originZ, stepMeters, cols, rows, data, minMeters: min, maxMeters: max };
}

/** Bilinear height at a board point; clamps to the field's edge outside it. */
export function sampleHeight(field: HeightField, x: number, z: number): number {
  const fx = clamp((x - field.originX) / field.stepMeters, 0, field.cols - 1);
  const fz = clamp((z - field.originZ) / field.stepMeters, 0, field.rows - 1);
  const c0 = Math.floor(fx);
  const r0 = Math.floor(fz);
  const c1 = Math.min(c0 + 1, field.cols - 1);
  const r1 = Math.min(r0 + 1, field.rows - 1);
  const tx = fx - c0;
  const tz = fz - r0;

  const h00 = at(field, c0, r0);
  const h10 = at(field, c1, r0);
  const h01 = at(field, c0, r1);
  const h11 = at(field, c1, r1);
  const top = h00 + (h10 - h00) * tx;
  const bottom = h01 + (h11 - h01) * tx;
  return top + (bottom - top) * tz;
}

/** Min / mean / max of heights inside a convex polygon. */
export function sampleStats(field: HeightField, polygon: readonly BoardPoint[]): HeightStats {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let sum = 0;
  let count = 0;
  const add = (h: number): void => {
    if (h < min) min = h;
    if (h > max) max = h;
    sum += h;
    count += 1;
  };

  // Grid samples strictly inside the polygon's bounding box.
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const p of polygon) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  const c0 = Math.max(0, Math.ceil((minX - field.originX) / field.stepMeters));
  const c1 = Math.min(field.cols - 1, Math.floor((maxX - field.originX) / field.stepMeters));
  const r0 = Math.max(0, Math.ceil((minZ - field.originZ) / field.stepMeters));
  const r1 = Math.min(field.rows - 1, Math.floor((maxZ - field.originZ) / field.stepMeters));
  for (let r = r0; r <= r1; r += 1) {
    const z = field.originZ + r * field.stepMeters;
    for (let c = c0; c <= c1; c += 1) {
      const x = field.originX + c * field.stepMeters;
      if (containsPoint(polygon, { x, z })) add(at(field, c, r));
    }
  }

  // Always include the outline and centre so tiny polygons never come back empty.
  for (const p of polygon) add(sampleHeight(field, p.x, p.z));
  if (polygon.length >= 3) {
    const c = centroid(polygon);
    add(sampleHeight(field, c.x, c.z));
  }

  return { min, max, mean: sum / count, count };
}

function at(field: HeightField, col: number, row: number): number {
  return field.data[row * field.cols + col] ?? 0;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
