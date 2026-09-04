// WHAT: Tests for the account written on the game-over card.
// HOW:  Real games played through ChessEngine so the last move is the engine's
//       own, with stub lookups standing in for the map's names. Assertions are
//       on the facts the sentences claim — the move number, the piece, the
//       place, whose king — not on the phrasing, so the prose can be rewritten
//       without breaking them.
// WHY:  Every line here is an assertion about the game that was just played.
//       Naming the wrong piece, or the square the winning king is on rather
//       than the losing one, would be a lie told at the most memorable moment
//       in the game — and one nobody would think to check.

import { describe, expect, it } from 'vitest';

import type { Square } from '@domain/board/Square';
import { ChessEngine } from '@domain/chess/ChessEngine';
import type { Color, Move, MoveRequest } from '@domain/chess/types';
import { chronicle } from '@game/chronicle';
import type { ChronicleScene } from '@game/chronicle';
import type { GameOutcome } from '@game/GameOutcome';

/** Every square named after itself in capitals, so a name is easy to spot. */
const NAMED: Pick<ChronicleScene, 'placeOf' | 'pieceNameOf'> = {
  placeOf: (square) => `the ${square.toUpperCase()} ground`,
  pieceNameOf: (square) => `${square.toUpperCase()} Hall`,
};

/** A board the map never named: every lookup comes back empty. */
const UNNAMED: Pick<ChronicleScene, 'placeOf' | 'pieceNameOf'> = {
  placeOf: () => null,
  pieceNameOf: () => null,
};

function play(requests: readonly MoveRequest[]): { engine: ChessEngine; moves: readonly Move[] } {
  const engine = new ChessEngine();
  for (const request of requests) engine.move(request);
  return { engine, moves: engine.history };
}

function scene(
  outcome: GameOutcome,
  moves: readonly Move[],
  engine: ChessEngine,
  names = NAMED,
): ChronicleScene {
  return {
    outcome,
    moves,
    kingSquareOf: (color: Color): Square | null =>
      engine.pieces().find((p) => p.piece.type === 'king' && p.piece.color === color)?.square ??
      null,
    ...names,
  };
}

/** Fool's mate: Black mates on move two with the queen landing on h4. */
const FOOLS_MATE: readonly MoveRequest[] = [
  { from: 'f2', to: 'f3' },
  { from: 'e7', to: 'e5' },
  { from: 'g2', to: 'g4' },
  { from: 'd8', to: 'h4' },
];

describe('chronicle — checkmate', () => {
  const { engine, moves } = play(FOOLS_MATE);
  const lines = chronicle(scene({ kind: 'checkmate', winner: 'black' }, moves, engine));
  const text = lines.join(' ');

  it('says which move it was, counted the way a player would write it', () => {
    // Four plies is move two, not move four.
    expect(text).toContain('Move 2:');
  });

  it('names the piece that gave mate and the ground it came to', () => {
    expect(text).toContain('queen');
    expect(text).toContain('H4 Hall');
    expect(text).toContain('the H4 ground');
  });

  it('names the losing king’s square, not the winner’s', () => {
    // White is mated on e1; Black's king is still on e8.
    expect(text).toContain('the E1 ground');
    expect(text).not.toContain('the E8 ground');
    expect(text).toContain("White's king");
  });

  it('counts what was taken along the way', () => {
    expect(text).toContain('Not a piece was taken');
  });

  it('reports a mate that was also a capture as a capture', () => {
    // Scholar's mate: the queen takes the f7 pawn to finish it.
    const scholars = play([
      { from: 'e2', to: 'e4' },
      { from: 'e7', to: 'e5' },
      { from: 'f1', to: 'c4' },
      { from: 'b8', to: 'c6' },
      { from: 'd1', to: 'h5' },
      { from: 'g8', to: 'f6' },
      { from: 'h5', to: 'f7' },
    ]);
    const said = chronicle(
      scene({ kind: 'checkmate', winner: 'white' }, scholars.moves, scholars.engine),
    ).join(' ');
    expect(said).toContain('took the pawn');
    expect(said).toContain('1 piece fell');
  });

  it('falls back to square names on a board the map never named', () => {
    const bare = chronicle(
      scene({ kind: 'checkmate', winner: 'black' }, moves, engine, UNNAMED),
    ).join(' ');
    expect(bare).toContain('e1');
    expect(bare).toContain('h4');
    expect(bare).not.toContain('undefined');
    expect(bare).not.toContain('null');
  });
});

describe('chronicle — resignation and draws', () => {
  it('says who gave up, when, and how far behind they were', () => {
    // White wins a knight, then Black resigns.
    const { engine, moves } = play([
      { from: 'e2', to: 'e4' },
      { from: 'e7', to: 'e5' },
      { from: 'g1', to: 'f3' },
      { from: 'b8', to: 'c6' },
      { from: 'f1', to: 'b5' },
      { from: 'a7', to: 'a6' },
      { from: 'b5', to: 'c6' },
    ]);
    const text = chronicle(
      scene({ kind: 'resignation', winner: 'white', loser: 'black' }, moves, engine),
    ).join(' ');

    expect(text).toContain('Black gave up');
    expect(text).toContain('4 moves');
    expect(text).toContain('3 ahead');
    // The winner's king is the one still standing somewhere.
    expect(text).toContain('the E1 ground');
  });

  it('does not claim a material lead that is not there', () => {
    const { engine, moves } = play([
      { from: 'e2', to: 'e4' },
      { from: 'e7', to: 'e5' },
    ]);
    const text = chronicle(
      scene({ kind: 'resignation', winner: 'white', loser: 'black' }, moves, engine),
    ).join(' ');
    expect(text).toContain('material was even');
    expect(text).not.toContain('ahead on material');
  });

  it('places both kings when the game is drawn', () => {
    const { engine, moves } = play([
      { from: 'e2', to: 'e4' },
      { from: 'e7', to: 'e5' },
    ]);
    const text = chronicle(scene({ kind: 'draw', reason: 'stalemate' }, moves, engine)).join(' ');
    expect(text).toContain('Neither side could force it');
    expect(text).toContain('the E1 ground');
    expect(text).toContain('the E8 ground');
  });

  it('always produces something, even with no moves at all', () => {
    const engine = new ChessEngine();
    for (const outcome of [
      { kind: 'checkmate', winner: 'white' },
      { kind: 'resignation', winner: 'white', loser: 'black' },
      { kind: 'draw', reason: 'stalemate' },
    ] as const) {
      const lines = chronicle(scene(outcome, [], engine));
      expect(lines.length, outcome.kind).toBeGreaterThan(0);
      expect(
        lines.every((l) => l.length > 0),
        outcome.kind,
      ).toBe(true);
    }
  });
});
