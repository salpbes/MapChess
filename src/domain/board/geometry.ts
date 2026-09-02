// WHAT: 2D geometry helpers the lattice needs beyond polygon.ts.
// HOW:  Nearest point on a polyline (for pulling vertices onto rivers) and a
//       convexity test that tolerates collinear corners. Pure functions on
//       BoardPoints.
// WHY:  Kept apart from polygon.ts so that file stays about single polygons
//       (area, centroid, containment) and this one about relationships.

import type { BoardPoint } from './types';

export interface NearestOnLine {
  readonly point: BoardPoint;
  readonly distance: number;
  /** Index of the segment start in the polyline. */
  readonly segment: number;
}

/** Closest point on an open polyline to `p`; null for polylines with fewer than 2 points. */
export function nearestOnPolyline(
  line: readonly BoardPoint[],
  p: BoardPoint,
): NearestOnLine | null {
  let best: NearestOnLine | null = null;
  for (let i = 0; i + 1 < line.length; i += 1) {
    const a = line[i];
    const b = line[i + 1];
    if (a === undefined || b === undefined) continue;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len2 = dx * dx + dz * dz;
    const t = len2 === 0 ? 0 : clamp01(((p.x - a.x) * dx + (p.z - a.z) * dz) / len2);
    const q = { x: a.x + dx * t, z: a.z + dz * t };
    const d = Math.hypot(p.x - q.x, p.z - q.z);
    if (best === null || d < best.distance) best = { point: q, distance: d, segment: i };
  }
  return best;
}

/**
 * True if every turn goes the same way (or is straight). Winding-agnostic.
 * A polygon with a reflex corner, or that folds over itself, returns false.
 */
export function isConvex(polygon: readonly BoardPoint[]): boolean {
  const n = polygon.length;
  if (n < 3) return false;
  let sign = 0;
  for (let i = 0; i < n; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % n];
    const c = polygon[(i + 2) % n];
    if (a === undefined || b === undefined || c === undefined) return false;
    const cross = (b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x);
    if (Math.abs(cross) < 1e-9) continue;
    const s = Math.sign(cross);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return sign !== 0;
}

/** True if segments a–b and c–d cross at interior points (touching endpoints do not count). */
export function segmentsCross(a: BoardPoint, b: BoardPoint, c: BoardPoint, d: BoardPoint): boolean {
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

function orient(a: BoardPoint, b: BoardPoint, c: BoardPoint): number {
  const v = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
  return Math.abs(v) < 1e-9 ? 0 : Math.sign(v);
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
