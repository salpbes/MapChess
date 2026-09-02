// WHAT: Tests for FlatBoardLayout.
// HOW:  Checks the IBoardLayout contract (64 cells, lookup) and the orientation
//       rule from D-007: a1 south-west, a1 dark, ranks increase northward.
// WHY:  WarpedBoardLayout must pass this same shape of test in Phase 8. Getting
//       orientation wrong here would silently mirror the whole game.

import { describe, expect, it } from 'vitest';

import { FlatBoardLayout } from '@domain/board/FlatBoardLayout';
import { signedArea } from '@domain/board/polygon';
import { ALL_SQUARES } from '@domain/board/Square';

const SIZE = 2000;
const layout = new FlatBoardLayout({ boardSizeMeters: SIZE });

describe('FlatBoardLayout', () => {
  it('produces 64 cells in ALL_SQUARES order', () => {
    expect(layout.cells).toHaveLength(64);
    expect(layout.cells.map((c) => c.square)).toEqual(ALL_SQUARES);
  });

  it('looks up any square and rejects nothing valid', () => {
    for (const sq of ALL_SQUARES) {
      expect(layout.cell(sq).square).toBe(sq);
    }
  });

  it('is centred on the origin with the requested size', () => {
    expect(layout.bounds).toEqual({
      minX: -1000,
      maxX: 1000,
      minZ: -1000,
      maxZ: 1000,
      minY: 0,
      maxY: 0,
    });
  });

  it('puts a1 in the south-west corner (min X, max Z) and h8 north-east', () => {
    const a1 = layout.cell('a1').centroid;
    const h8 = layout.cell('h8').centroid;
    expect(a1.x).toBeCloseTo(-875);
    expect(a1.z).toBeCloseTo(875);
    expect(h8.x).toBeCloseTo(875);
    expect(h8.z).toBeCloseTo(-875);
  });

  it('increases X along files and decreases Z along ranks', () => {
    expect(layout.cell('b1').centroid.x).toBeGreaterThan(layout.cell('a1').centroid.x);
    expect(layout.cell('a2').centroid.z).toBeLessThan(layout.cell('a1').centroid.z);
  });

  it('shades a1 dark and alternates', () => {
    expect(layout.cell('a1').shade).toBe('dark');
    expect(layout.cell('b1').shade).toBe('light');
    expect(layout.cell('a2').shade).toBe('light');
    expect(layout.cell('h8').shade).toBe('dark');
    expect(layout.cell('h1').shade).toBe('light');
  });

  it('makes every cell a CCW quad whose areas tile the board exactly', () => {
    let total = 0;
    for (const cell of layout.cells) {
      expect(cell.polygon).toHaveLength(4);
      const area = signedArea(cell.polygon);
      expect(area).toBeGreaterThan(0);
      total += area;
    }
    expect(total).toBeCloseTo(SIZE * SIZE);
  });

  it('places every platform at ground level', () => {
    for (const cell of layout.cells) {
      expect(cell.platformY).toBe(0);
    }
  });

  it('rejects a non-positive size', () => {
    expect(() => new FlatBoardLayout({ boardSizeMeters: 0 })).toThrow(RangeError);
  });
});
