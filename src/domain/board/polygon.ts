// WHAT: Pure 2D polygon maths on BoardPoint arrays.
// HOW:  Shoelace formula for signed area; area-weighted centroid derived from it.
//       Winding follows types.ts: positive area = counter-clockwise from above.
// WHY:  FlatBoardLayout barely needs these, but WarpedBoardLayout (Phase 8) will
//       lean on them for its convexity/area invariants. Establishing the sign
//       convention now, with tests, avoids re-deriving it under pressure later.

import type { BoardPoint } from './types';

/**
 * Signed area. Positive for counter-clockwise (viewed from above, north up).
 * On the XZ plane with +Z pointing south, "screen up" is −Z, so the classic
 * shoelace sign is negated to keep CCW positive.
 */
export function signedArea(polygon: readonly BoardPoint[]): number {
  let sum = 0;
  const n = polygon.length;
  for (let i = 0; i < n; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % n];
    if (a === undefined || b === undefined) continue;
    sum += a.x * b.z - b.x * a.z;
  }
  return -sum / 2;
}

/** Area-weighted centroid. Falls back to the vertex mean for degenerate input. */
export function centroid(polygon: readonly BoardPoint[]): BoardPoint {
  const n = polygon.length;
  if (n === 0) {
    throw new RangeError('Cannot take the centroid of an empty polygon.');
  }
  const area = signedArea(polygon);
  if (Math.abs(area) < 1e-9) {
    let sx = 0;
    let sz = 0;
    for (const p of polygon) {
      sx += p.x;
      sz += p.z;
    }
    return { x: sx / n, z: sz / n };
  }

  let cx = 0;
  let cz = 0;
  for (let i = 0; i < n; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % n];
    if (a === undefined || b === undefined) continue;
    const cross = a.x * b.z - b.x * a.z;
    cx += (a.x + b.x) * cross;
    cz += (a.z + b.z) * cross;
  }
  // The raw shoelace area (un-negated) is what pairs with the cross terms above.
  const rawArea = -area;
  return { x: cx / (6 * rawArea), z: cz / (6 * rawArea) };
}

/**
 * True if the point lies inside or on the edge of a convex polygon.
 * Works for either winding by requiring every edge cross product to share a sign.
 */
export function containsPoint(polygon: readonly BoardPoint[], point: BoardPoint): boolean {
  const n = polygon.length;
  if (n < 3) return false;
  let positive = false;
  let negative = false;
  for (let i = 0; i < n; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % n];
    if (a === undefined || b === undefined) continue;
    const cross = (b.x - a.x) * (point.z - a.z) - (b.z - a.z) * (point.x - a.x);
    if (cross > 1e-9) positive = true;
    else if (cross < -1e-9) negative = true;
    if (positive && negative) return false;
  }
  return true;
}
