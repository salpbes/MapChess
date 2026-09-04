// WHAT: Tests for the plain-English explanation of a suggested move.
// HOW:  Real positions through ChessEngine, then the engine's own Move handed
//       to `explainMove`. Assertions are on the substance — which reason was
//       chosen, and which piece and squares are named — not on the exact
//       wording, so the prose can be improved without breaking the tests.
// WHY:  These sentences are the whole point of the hint for a learner, and
//       every one of them is an assertion about the position. Saying "your
//       knight can be taken where it is standing" when it cannot would be
//       worse than saying nothing: it teaches something false.

import { describe, expect, it } from 'vitest';

import { ChessEngine } from '@domain/chess/ChessEngine';
import type { Move, MoveRequest } from '@domain/chess/types';
import { explainMove } from '@game/explainMove';

/** The engine's own Move for a request, without playing it. */
function moveFor(engine: ChessEngine, request: MoveRequest): Move {
  const move = engine
    .legalMoves(request.from)
    .find((m) => m.to === request.to && (request.promotion ?? null) === m.promotion);
  if (move === undefined) throw new Error(`${request.from}→${request.to} is not legal here`);
  return move;
}

function advise(fen: string, request: MoveRequest) {
  const engine = new ChessEngine(fen);
  return explainMove(engine, moveFor(engine, request));
}

describe('explainMove', () => {
  it('leads with checkmate, over everything else it could say', () => {
    // Qxf7 is mate and a capture; mate is the thing worth saying.
    const advice = advise('rnbqkbnr/pppp1ppp/8/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 0 1', {
      from: 'f3',
      to: 'f7',
    });
    expect(advice.headline).toBe('Checkmate!');
    expect(advice.notation).toContain('#');
  });

  it('names the piece it wins', () => {
    const advice = advise('rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 1', {
      from: 'f3',
      to: 'e5',
    });
    expect(advice.headline).toBe('Win the pawn!');
    expect(advice.reason).toContain('knight');
    expect(advice.reason).toContain('e5');
  });

  it('mentions check when the move is not also a capture', () => {
    const advice = advise('4k3/8/8/8/8/8/8/R3K3 w Q - 0 1', { from: 'a1', to: 'a8' });
    expect(advice.headline).toBe('Check!');
    expect(advice.notation).toContain('+');
  });

  it('says a piece is in danger when it really is', () => {
    // The white knight on d4 is attacked by the pawn on e5 and has to move.
    const advice = advise('4k3/8/8/4p3/3N4/8/8/4K3 w - - 0 1', { from: 'd4', to: 'f3' });
    expect(advice.headline).toBe('Get out of danger');
    expect(advice.reason).toContain('knight');
  });

  it('does not claim danger for a piece that is perfectly safe', () => {
    const advice = advise('4k3/8/8/8/8/8/8/4K1N1 w - - 0 1', { from: 'g1', to: 'f3' });
    expect(advice.headline).not.toBe('Get out of danger');
    expect(advice.reason).not.toContain('can be taken');
  });

  it('says whether the square it flees to is itself safe', () => {
    // Both escape the pawn on e5, but the bishop on g2 covers f3 — and c6, and
    // d5, which is exactly the sort of thing a learner misses. e6 is clear.
    const fen = '4k3/8/8/4p3/3N4/8/6b1/4K3 w - - 0 1';
    expect(advise(fen, { from: 'd4', to: 'f3' }).reason).toContain('should move');
    expect(advise(fen, { from: 'd4', to: 'e6' }).reason).toContain('safe');
  });

  it('explains a promotion as making a queen, even when it also gives check', () => {
    const advice = advise('4k3/P7/8/8/8/8/8/4K3 w - - 0 1', {
      from: 'a7',
      to: 'a8',
      promotion: 'queen',
    });
    expect(advice.headline).toBe('Make a new queen!');
  });

  it('tells the player how to castle, since it takes two clicks', () => {
    const advice = advise('4k3/8/8/8/8/8/PPPPPPPP/R3K2R w KQ - 0 1', { from: 'e1', to: 'g1' });
    expect(advice.headline).toBe('Castle to safety');
    expect(advice.instruction).toContain('king');
    expect(advice.instruction).toContain('h1');
  });

  it('falls back to something true rather than nothing', () => {
    const advice = advise('4k3/8/8/8/8/8/8/4K1N1 w - - 0 1', { from: 'g1', to: 'f3' });
    expect(advice.headline).toBe('A good move');
    expect(advice.reason.length).toBeGreaterThan(0);
    expect(advice.instruction).toBe('Move your knight from g1 to f3.');
  });

  it('always names a piece, a reason and the notation', () => {
    const engine = new ChessEngine();
    for (const move of engine.legalMoves()) {
      const advice = explainMove(engine, move);
      expect(advice.headline.length, move.san).toBeGreaterThan(0);
      expect(advice.reason.length, move.san).toBeGreaterThan(0);
      expect(advice.instruction.length, move.san).toBeGreaterThan(0);
      expect(advice.notation, move.san).toBe(move.san);
    }
  });
});
