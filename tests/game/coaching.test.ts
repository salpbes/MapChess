// WHAT: Tests for the coach card's three lines.
// HOW:  Positions reached by playing real moves where the opening matters, and
//       set up from a FEN where the endgame does. Each case asserts the one
//       rule that should have fired, because only one is allowed to.
// WHY:  The order the rules are tried in *is* the feature: telling a player in
//       check to develop their knights, or offering the first-move book in a
//       rook endgame, is worse than an empty panel. Both of those were real,
//       and the second is why the move number comes from the FEN and not from
//       the length of the move list.

import { describe, expect, it } from 'vitest';

import { ChessEngine } from '@domain/chess/ChessEngine';
import { coach } from '@game/coaching';

/** A game actually played from the start, so the history is real. */
function played(sans: readonly string[]): ChessEngine {
  const engine = new ChessEngine();
  for (const san of sans) {
    const move = engine.legalMoves().find((m) => m.san.replace(/[+#]+$/, '') === san);
    expect(move, `"${san}" should be legal`).toBeDefined();
    if (move === undefined) break;
    engine.move({ from: move.from, to: move.to });
  }
  return engine;
}

describe('coach — where the game is', () => {
  it('names the opening while the book still applies', () => {
    const notes = coach(played(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4']), 'black');
    expect(notes.title).toBe('Italian Game');
    expect(notes.phase).toBe('opening');
  });

  it('goes back to the phase once the game is well past the book', () => {
    // Giuoco Piano is six plies deep; eight quiet plies later it is no longer
    // what the game is about, so the card says where it is instead.
    const notes = coach(
      played([
        'e4',
        'e5',
        'Nf3',
        'Nc6',
        'Bc4',
        'Bc5',
        'd3',
        'd6',
        'h3',
        'h6',
        'a3',
        'a6',
        'Be3',
        'Be6',
      ]),
      'white',
    );
    expect(notes.title).toBe('Opening');
  });

  it('calls a bare king-and-pawn position an endgame', () => {
    expect(coach(new ChessEngine('4k3/8/8/8/8/1P6/8/4K3 w - - 0 40'), 'white').phase).toBe(
      'endgame',
    );
  });
});

describe('coach — the one thing to do', () => {
  it('says what the book plays next', () => {
    const notes = coach(played(['e4', 'e5', 'Nf3', 'Nc6']), 'white');
    expect(notes.advice).toBe('Strong players usually play Bb5, Bc4 or d4 here.');
  });

  it('puts getting out of check above everything else', () => {
    const notes = coach(played(['e4', 'd5', 'Bb5']), 'black');
    expect(notes.advice).toContain('in check');
  });

  it('warns about the queen coming out early', () => {
    const notes = coach(played(['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'g6']), 'white');
    expect(notes.advice).toContain('queen came out early');
  });

  it('counts the pieces still sitting at home', () => {
    const notes = coach(played(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Qe7', 'd3', 'h6']), 'white');
    expect(notes.advice).toBe(
      'Two of your pieces are still at home. Knights and bishops out first, then castle.',
    );
  });

  it('asks for the castle once the pieces are out', () => {
    const notes = coach(
      played(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'd3', 'Bc5', 'Nc3', 'd6']),
      'white',
    );
    expect(notes.advice).toContain('Castle soon');
  });

  it('points at the passed pawn in an endgame', () => {
    const notes = coach(new ChessEngine('4k3/8/8/8/8/1P6/8/4K3 w - - 0 40'), 'white');
    expect(notes.advice).toContain('passed pawn on b3');
  });

  it('sends the king forward in an endgame with nothing to push', () => {
    const notes = coach(new ChessEngine('r3k3/pppp4/8/8/8/8/PPPP4/R3K3 w Qq - 0 30'), 'white');
    expect(notes.advice).toContain('king towards the middle');
  });
});

describe('coach — the facts', () => {
  it('counts development while it is still the opening', () => {
    expect(coach(new ChessEngine(), 'white').facts).toBe(
      'Material even · 0 of 4 pieces out · move 1',
    );
  });

  it('drops the development count once the opening is over', () => {
    const notes = coach(new ChessEngine('4k3/8/8/8/8/1P6/8/4K3 w - - 0 40'), 'white');
    expect(notes.facts).toBe('You are 1 ahead · move 40');
  });

  it('reads the move number from the position, not the move list', () => {
    // Set up, not played: an empty history must not read as move 1.
    const notes = coach(
      new ChessEngine('1nbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQk - 0 21'),
      'white',
    );
    expect(notes.facts).toBe('You are 5 ahead · move 21');
    expect(notes.title).toBe('Middlegame');
  });

  it('says which way a deficit runs', () => {
    const notes = coach(
      new ChessEngine('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/1NBQKBNR w Kkq - 0 21'),
      'white',
    );
    expect(notes.facts).toContain('You are 5 behind');
  });

  it('never offers the first-move book to a position that was set up', () => {
    const notes = coach(new ChessEngine('r3k3/pppp4/8/8/8/8/PPPP4/R3K3 w Qq - 0 30'), 'white');
    expect(notes.advice).not.toContain('Strong players');
  });
});
