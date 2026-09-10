// WHAT: Tests for turning the engine's score into a bar, a sentence and a number.
// HOW:  Pure calls with scores in the shape UCI reports them — from the side to
//       move's point of view — checked from White's, which is what is shown.
// WHY:  The one thing that must never be wrong here is which way round it is.
//       A bar that says White is winning when Black is would be worse than no
//       bar, and the flip depends on whose turn it is, which is exactly the
//       sort of thing that looks right until someone checks it from Black.

import { describe, expect, it } from 'vitest';

import { assess } from '@game/assessment';

const cp = (value: number, depth = 12) => ({ kind: 'centipawns' as const, value, depth });
const mate = (value: number, depth = 20) => ({ kind: 'mate' as const, value, depth });

describe('assess', () => {
  it('reads a score in White’s favour when White is to move', () => {
    const a = assess(cp(150), 'white');
    expect(a.number).toBe('+1.5');
    expect(a.whiteShare).toBeGreaterThan(0.5);
    expect(a.verdict).toContain('White');
  });

  it('turns the same score around when it is Black to move', () => {
    // +150 for Black to move means Black is better, so White's share drops.
    const a = assess(cp(150), 'black');
    expect(a.number).toBe('−1.5');
    expect(a.whiteShare).toBeLessThan(0.5);
    expect(a.verdict).toContain('Black');
  });

  it('calls a near-equal position level, whoever is to move', () => {
    for (const turn of ['white', 'black'] as const) {
      expect(assess(cp(20), turn).verdict).toBe('Level');
      expect(assess(cp(-30), turn).verdict).toBe('Level');
    }
  });

  it('puts a dead-level position in the middle of the bar', () => {
    expect(assess(cp(0), 'white').whiteShare).toBeCloseTo(0.5, 6);
  });

  it('grows the share with the advantage, without ever reaching the ends', () => {
    const shares = [0, 100, 300, 900].map((v) => assess(cp(v), 'white').whiteShare);
    expect(shares).toEqual([...shares].sort((a, b) => a - b));
    expect(shares[shares.length - 1]).toBeLessThan(1);
    expect(assess(cp(-900), 'white').whiteShare).toBeGreaterThan(0);
  });

  it('reports a forced mate as moves, not pawns, and pins the bar', () => {
    const a = assess(mate(3), 'white');
    expect(a.verdict).toBe('Mate in 3 for White');
    expect(a.number).toBe('+M3');
    expect(a.whiteShare).toBeGreaterThan(0.99);

    const b = assess(mate(3), 'black');
    expect(b.verdict).toBe('Mate in 3 for Black');
    expect(b.whiteShare).toBeLessThan(0.01);
  });

  it('handles being mated, which is a negative mate score', () => {
    const a = assess(mate(-2), 'white');
    expect(a.verdict).toBe('Mate in 2 for Black');
    expect(a.whiteShare).toBeLessThan(0.01);
  });

  it('says who won when the position is already mate', () => {
    expect(assess(mate(0), 'white').verdict).toBe('Mate — White wins');
  });

  it('always carries the depth through, so the card can be honest about it', () => {
    expect(assess(cp(10, 7), 'white').depth).toBe(7);
    expect(assess(mate(1, 30), 'black').depth).toBe(30);
  });
});
