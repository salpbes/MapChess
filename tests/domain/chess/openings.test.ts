// WHAT: Tests for the opening book: naming a line, and saying what comes next.
// HOW:  Every line in the book is played out on a real engine, so a typo in
//       the notation cannot ship. Then the two lookups are checked against
//       lines whose names are not in dispute.
// WHY:  This is the panel that tells a beginner what they are playing. Telling
//       them it is the Sicilian when it is not is worse than saying nothing,
//       and a line with an illegal move in it silently never matches anything.

import { describe, expect, it } from 'vitest';

import { ChessEngine } from '@domain/chess/ChessEngine';
import { BOOK_LINES, BOOK_SIZE, openingFor } from '@domain/chess/openings';

/** Plays notation onto a fresh engine, and returns the SAN actually recorded. */
function play(sans: readonly string[]): readonly string[] {
  const engine = new ChessEngine();
  for (const san of sans) {
    const move = engine.legalMoves().find((m) => m.san.replace(/[+#]+$/, '') === san);
    expect(move, `"${san}" should be legal after ${sans.join(' ')}`).toBeDefined();
    if (move === undefined) return [];
    engine.move({ from: move.from, to: move.to });
  }
  return engine.history.map((m) => m.san);
}

describe('the book itself', () => {
  it('holds only lines that can actually be played', () => {
    for (const line of BOOK_LINES) {
      expect(play(line.moves), line.name).toHaveLength(line.moves.length);
    }
  });

  it('names every line, and names each one once', () => {
    const names = BOOK_LINES.map((l) => l.name);
    expect(new Set(names).size).toBe(BOOK_SIZE);
    expect(names.every((n) => n.length > 0)).toBe(true);
  });

  it('never lists the same move sequence twice', () => {
    const keys = BOOK_LINES.map((l) => l.moves.join(' '));
    expect(new Set(keys).size).toBe(BOOK_SIZE);
  });
});

describe('openingFor', () => {
  it('suggests first moves before anything is played', () => {
    const match = openingFor([]);
    expect(match.name).toBeNull();
    expect(match.plies).toBe(0);
    expect(match.next).toContain('e4');
  });

  it('names the longest line the game has followed', () => {
    const match = openingFor(play(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4']));
    expect(match.name).toBe('Italian Game');
    expect(match.plies).toBe(5);
  });

  it('keeps naming the deeper line as the game goes on', () => {
    const match = openingFor(play(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5']));
    expect(match.name).toBe('Giuoco Piano');
  });

  it('hands back what the book plays from here', () => {
    // Both bishop moves and the Scotch continue from the Knight's Opening.
    const match = openingFor(play(['e4', 'e5', 'Nf3', 'Nc6']));
    expect(match.next).toEqual(['Bb5', 'Bc4', 'd4']);
  });

  it('runs out of suggestions once the game leaves the book', () => {
    const match = openingFor(play(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Qe7', 'd3', 'h6']));
    // Still the Italian by name, but the book has nothing more to say.
    expect(match.name).toBe('Italian Game');
    expect(match.next).toEqual([]);
  });

  it('is not fooled by a check mark on the notation', () => {
    expect(openingFor(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5+']).name).toBe('Ruy López');
  });

  it('says nothing about a first move it does not know', () => {
    const match = openingFor(play(['h4']));
    expect(match.name).toBeNull();
    expect(match.next).toEqual([]);
  });
});
