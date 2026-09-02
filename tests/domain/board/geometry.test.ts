// WHAT: Tests for the lattice geometry helpers and the terracing rule.
// HOW:  Hand-built shapes with known answers.
// WHY:  These are the primitives the Phase 8 invariants rest on; if isConvex
//       or inradius lied, the invariant tests would pass on broken boards.

import { describe, expect, it } from 'vitest';

import { isConvex, nearestOnPolyline, segmentsCross } from '@domain/board/geometry';
import {
  flatLattice,
  inradius,
  quadCorners,
  quadIsValid,
  DEFAULT_LATTICE_PARAMS,
} from '@domain/board/latticeWarp';
import { platformHeightMeters, terrace } from '@domain/board/terrace';
import type { BoardPoint } from '@domain/board/types';

const sq = (s: number): BoardPoint[] => [
  { x: 0, z: s },
  { x: s, z: s },
  { x: s, z: 0 },
  { x: 0, z: 0 },
];

describe('geometry', () => {
  it('finds the nearest point on a polyline, clamped to segment ends', () => {
    const line = [
      { x: 0, z: 0 },
      { x: 10, z: 0 },
      { x: 10, z: 10 },
    ];
    expect(nearestOnPolyline(line, { x: 5, z: 3 })).toEqual({
      point: { x: 5, z: 0 },
      distance: 3,
      segment: 0,
    });
    const end = nearestOnPolyline(line, { x: 12, z: 14 });
    expect(end?.point).toEqual({ x: 10, z: 10 });
    expect(end?.segment).toBe(1);
    expect(nearestOnPolyline([{ x: 1, z: 1 }], { x: 0, z: 0 })).toBeNull();
  });

  it('classifies convexity regardless of winding and tolerates collinear corners', () => {
    expect(isConvex(sq(1))).toBe(true);
    expect(isConvex([...sq(1)].reverse())).toBe(true);
    expect(
      isConvex([
        { x: 0, z: 0 },
        { x: 1, z: 0 },
        { x: 2, z: 0 },
        { x: 2, z: 1 },
        { x: 0, z: 1 },
      ]),
    ).toBe(true);
    // Arrowhead: one reflex vertex.
    expect(
      isConvex([
        { x: 0, z: 0 },
        { x: 2, z: 1 },
        { x: 0, z: 2 },
        { x: 0.5, z: 1 },
      ]),
    ).toBe(false);
    // Bow-tie (self-intersecting).
    expect(
      isConvex([
        { x: 0, z: 0 },
        { x: 1, z: 1 },
        { x: 1, z: 0 },
        { x: 0, z: 1 },
      ]),
    ).toBe(false);
    expect(
      isConvex([
        { x: 0, z: 0 },
        { x: 1, z: 0 },
      ]),
    ).toBe(false);
  });

  it('detects crossing segments but not touching ones', () => {
    expect(segmentsCross({ x: 0, z: 0 }, { x: 2, z: 2 }, { x: 0, z: 2 }, { x: 2, z: 0 })).toBe(
      true,
    );
    expect(segmentsCross({ x: 0, z: 0 }, { x: 2, z: 0 }, { x: 2, z: 0 }, { x: 2, z: 2 })).toBe(
      false,
    );
    expect(segmentsCross({ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 0, z: 1 }, { x: 1, z: 1 })).toBe(
      false,
    );
  });

  it('inradius of a unit square is 0.5 and shrinks as it thins', () => {
    expect(inradius(sq(1))).toBeCloseTo(0.5);
    expect(
      inradius([
        { x: 0, z: 0.2 },
        { x: 1, z: 0.2 },
        { x: 1, z: 0 },
        { x: 0, z: 0 },
      ]),
    ).toBeCloseTo(0.1);
  });

  it('quadIsValid rejects flipped, thin and small quads', () => {
    const p = DEFAULT_LATTICE_PARAMS;
    expect(quadIsValid(sq(1), p)).toBe(true);
    expect(quadIsValid([...sq(1)].reverse(), p)).toBe(false); // negative area
    expect(quadIsValid(sq(0.6), p)).toBe(false); // area 0.36 < minArea
    expect(
      quadIsValid(
        [
          { x: 0, z: 0.5 },
          { x: 2, z: 0.5 },
          { x: 2, z: 0 },
          { x: 0, z: 0 },
        ],
        p,
      ),
    ).toBe(false); // thin
  });

  it('flat lattice quads are unit squares in CCW order', () => {
    const l = flatLattice();
    expect(l).toHaveLength(9);
    expect(quadCorners(l, 7, 0)).toEqual([
      { x: 0, z: 8 },
      { x: 1, z: 8 },
      { x: 1, z: 7 },
      { x: 0, z: 7 },
    ]);
  });
});

describe('terrace', () => {
  it('uses the mean for flat cells and the minimum for steep ones', () => {
    expect(platformHeightMeters({ min: 10, mean: 12, max: 14 }, 12)).toBe(12);
    expect(platformHeightMeters({ min: 10, mean: 25, max: 40 }, 12)).toBe(10);
  });

  it('scales real relief to the target fraction of board width', () => {
    const stats = [
      { min: 100, mean: 100, max: 100 },
      { min: 300, mean: 300, max: 300 },
    ];
    const r = terrace(stats, 2000, {
      reliefFraction: 0.17,
      flatThresholdMeters: 25,
      flatReliefFraction: 0.05,
      pieceBaseHeightMeters: 12,
    });
    expect(r.realReliefMeters).toBe(200);
    expect(r.platformY[0]).toBe(0);
    expect(r.platformY[1]).toBeCloseTo(340);
    expect(r.baseMeters).toBe(100);
  });

  it('does not over-stretch flat ground', () => {
    const stats = [
      { min: 2, mean: 2, max: 2 },
      { min: 7, mean: 7, max: 7 },
    ];
    const r = terrace(stats, 2000);
    // 5 m real relief → 5/25 of the 5 % flat cap = 20 m, not 340 m.
    expect(Math.max(...r.platformY)).toBeCloseTo(20);
  });

  it('handles a perfectly flat board without dividing by zero', () => {
    const r = terrace(
      [
        { min: 3, mean: 3, max: 3 },
        { min: 3, mean: 3, max: 3 },
      ],
      2000,
    );
    expect(r.platformY).toEqual([0, 0]);
    expect(r.scale).toBe(0);
  });
});
