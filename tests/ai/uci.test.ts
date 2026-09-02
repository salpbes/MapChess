// WHAT: Tests for the UCI line parsers.
// HOW:  Real lines as Stockfish prints them, plus the awkward ones.
// WHY:  A mis-parsed promotion letter would make the engine "play" an illegal
//       move; the GameLoop guard would catch it, but the game would be worse.

import { describe, expect, it } from 'vitest';

import { isReadyOk, isUciOk, parseBestMove } from '@ai/uci';

describe('parseBestMove', () => {
  it('parses a plain move', () => {
    expect(parseBestMove('bestmove e2e4')).toEqual({ from: 'e2', to: 'e4' });
  });

  it('ignores the ponder suffix', () => {
    expect(parseBestMove('bestmove g1f3 ponder b8c6')).toEqual({ from: 'g1', to: 'f3' });
  });

  it('parses promotions', () => {
    expect(parseBestMove('bestmove e7e8q')).toEqual({ from: 'e7', to: 'e8', promotion: 'queen' });
    expect(parseBestMove('bestmove a2a1n')).toEqual({ from: 'a2', to: 'a1', promotion: 'knight' });
  });

  it('returns null for non-bestmove lines and for (none)', () => {
    expect(parseBestMove('info depth 12 score cp 30')).toBeNull();
    expect(parseBestMove('bestmove (none)')).toBeNull();
    expect(parseBestMove('')).toBeNull();
  });
});

describe('handshake predicates', () => {
  it('match exact tokens only', () => {
    expect(isUciOk('uciok')).toBe(true);
    expect(isUciOk('id name Stockfish')).toBe(false);
    expect(isReadyOk('readyok\n')).toBe(true);
    expect(isReadyOk('ready')).toBe(false);
  });
});
