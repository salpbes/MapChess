// WHAT: Tests for polygon area and centroid.
// HOW:  Known shapes with hand-computed answers, both windings.
// WHY:  The sign convention (CCW-from-above is positive on an XZ plane where
//       +Z is south) is easy to get backwards. Phase 8's convexity checks
//       depend on it being right.

import { describe, expect, it } from 'vitest';

import { centroid, containsPoint, signedArea } from '@domain/board/polygon';
import type { BoardPoint } from '@domain/board/types';

// Unit square, CCW viewed from above with north (−Z) up: SW, SE, NE, NW.
const ccwSquare: BoardPoint[] = [
  { x: 0, z: 1 },
  { x: 1, z: 1 },
  { x: 1, z: 0 },
  { x: 0, z: 0 },
];
const cwSquare = [...ccwSquare].reverse();

describe('signedArea', () => {
  it('is positive for counter-clockwise polygons (viewed from above)', () => {
    expect(signedArea(ccwSquare)).toBeCloseTo(1);
  });

  it('is negative for clockwise polygons', () => {
    expect(signedArea(cwSquare)).toBeCloseTo(-1);
  });

  it('scales with size', () => {
    const big = ccwSquare.map((p) => ({ x: p.x * 250, z: p.z * 250 }));
    expect(signedArea(big)).toBeCloseTo(250 * 250);
  });

  it('computes a triangle', () => {
    const tri: BoardPoint[] = [
      { x: 0, z: 0 },
      { x: 0, z: 2 },
      { x: 3, z: 2 },
    ];
    expect(Math.abs(signedArea(tri))).toBeCloseTo(3);
  });
});

describe('centroid', () => {
  it('finds the centre of a square regardless of winding', () => {
    expect(centroid(ccwSquare)).toEqual({ x: 0.5, z: 0.5 });
    const c = centroid(cwSquare);
    expect(c.x).toBeCloseTo(0.5);
    expect(c.z).toBeCloseTo(0.5);
  });

  it('is area-weighted, not a vertex mean', () => {
    // Extra collinear vertex on one edge must not pull the centroid.
    const withMidpoint: BoardPoint[] = [
      { x: 0, z: 1 },
      { x: 0.5, z: 1 },
      { x: 1, z: 1 },
      { x: 1, z: 0 },
      { x: 0, z: 0 },
    ];
    const c = centroid(withMidpoint);
    expect(c.x).toBeCloseTo(0.5);
    expect(c.z).toBeCloseTo(0.5);
  });

  it('falls back to the vertex mean for degenerate polygons', () => {
    const line: BoardPoint[] = [
      { x: 0, z: 0 },
      { x: 2, z: 0 },
    ];
    expect(centroid(line)).toEqual({ x: 1, z: 0 });
  });

  it('throws on empty input', () => {
    expect(() => centroid([])).toThrow(RangeError);
  });
});

describe('containsPoint', () => {
  it('accepts interior points and rejects exterior ones, either winding', () => {
    for (const poly of [ccwSquare, cwSquare]) {
      expect(containsPoint(poly, { x: 0.5, z: 0.5 })).toBe(true);
      expect(containsPoint(poly, { x: 0.01, z: 0.99 })).toBe(true);
      expect(containsPoint(poly, { x: 1.5, z: 0.5 })).toBe(false);
      expect(containsPoint(poly, { x: 0.5, z: -0.1 })).toBe(false);
    }
  });

  it('treats edge and corner points as inside', () => {
    expect(containsPoint(ccwSquare, { x: 0, z: 0.5 })).toBe(true);
    expect(containsPoint(ccwSquare, { x: 1, z: 1 })).toBe(true);
  });

  it('works for a non-rectangular convex quad', () => {
    const kite: BoardPoint[] = [
      { x: 0, z: 2 },
      { x: 3, z: 3 },
      { x: 4, z: 0 },
      { x: 1, z: -1 },
    ];
    expect(containsPoint(kite, { x: 2, z: 1 })).toBe(true);
    expect(containsPoint(kite, { x: 0.2, z: 0 })).toBe(false);
  });

  it('rejects degenerate polygons', () => {
    expect(
      containsPoint(
        [
          { x: 0, z: 0 },
          { x: 1, z: 1 },
        ],
        { x: 0.5, z: 0.5 },
      ),
    ).toBe(false);
  });
});
