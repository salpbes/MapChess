// WHAT: Tests for the square-name helpers.
// HOW:  Round-trips names ↔ indices and checks ordering of ALL_SQUARES.
// WHY:  Every layer keys on these names; an off-by-one here would misplace
//       every piece on the board.

import { describe, expect, it } from 'vitest';

import { ALL_SQUARES, fileIndex, rankIndex, squareAt } from '@domain/board/Square';

describe('Square', () => {
  it('lists 64 unique squares starting at a1 and ending at h8', () => {
    expect(ALL_SQUARES).toHaveLength(64);
    expect(new Set(ALL_SQUARES).size).toBe(64);
    expect(ALL_SQUARES[0]).toBe('a1');
    expect(ALL_SQUARES[7]).toBe('h1');
    expect(ALL_SQUARES[8]).toBe('a2');
    expect(ALL_SQUARES[63]).toBe('h8');
  });

  it('converts names to zero-based indices', () => {
    expect(fileIndex('a1')).toBe(0);
    expect(fileIndex('h8')).toBe(7);
    expect(rankIndex('a1')).toBe(0);
    expect(rankIndex('e4')).toBe(3);
  });

  it('round-trips through squareAt', () => {
    for (const sq of ALL_SQUARES) {
      expect(squareAt(fileIndex(sq), rankIndex(sq))).toBe(sq);
    }
  });

  it('rejects out-of-range indices', () => {
    expect(() => squareAt(8, 0)).toThrow(RangeError);
    expect(() => squareAt(0, -1)).toThrow(RangeError);
  });
});
