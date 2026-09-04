// WHAT: Tests for the captured-material summary.
// HOW:  Plays real games through ChessEngine and folds the history, so the
//       Moves under test are the ones the engine actually produces — including
//       en passant, where the captured square is not the destination.
// WHY:  The captured display and the material score are shown side by side; if
//       they disagree with the board, the player trusts neither.

import { describe, expect, it } from 'vitest';

import { ChessEngine } from '@domain/chess/ChessEngine';
import type { Color, Move, MoveRequest, PieceType } from '@domain/chess/types';
import { PIECE_VALUE, summariseCaptures } from '@game/captures';

function play(moves: readonly MoveRequest[]): readonly Move[] {
  const engine = new ChessEngine();
  for (const move of moves) engine.move(move);
  return engine.history;
}

/** A move that took something, with the fields the summary does not read left plain. */
function capture(color: Color, captured: PieceType): Move {
  return {
    from: 'a1',
    to: 'a2',
    piece: 'rook',
    color,
    san: `Rxa2`,
    promotion: null,
    captured,
    capturedSquare: 'a2',
    castle: null,
    isEnPassant: false,
  };
}

describe('summariseCaptures', () => {
  it('is empty for a game with no captures', () => {
    const summary = summariseCaptures(
      play([
        { from: 'e2', to: 'e4' },
        { from: 'e7', to: 'e5' },
      ]),
    );
    expect(summary).toEqual({ byWhite: [], byBlack: [], balance: 0 });
  });

  it('files each capture under the side that made it', () => {
    // 1. e4 d5 2. exd5 Qxd5 — a pawn each.
    const summary = summariseCaptures(
      play([
        { from: 'e2', to: 'e4' },
        { from: 'd7', to: 'd5' },
        { from: 'e4', to: 'd5' },
        { from: 'd8', to: 'd5' },
      ]),
    );
    expect(summary.byWhite).toEqual(['pawn']);
    expect(summary.byBlack).toEqual(['pawn']);
    expect(summary.balance).toBe(0);
  });

  it('scores the material lead in pawn units', () => {
    // Scholar's-mate opening where White wins a knight for nothing.
    const summary = summariseCaptures(
      play([
        { from: 'e2', to: 'e4' },
        { from: 'e7', to: 'e5' },
        { from: 'g1', to: 'f3' },
        { from: 'b8', to: 'c6' },
        { from: 'f1', to: 'b5' },
        { from: 'a7', to: 'a6' },
        { from: 'b5', to: 'c6' },
      ]),
    );
    expect(summary.byWhite).toEqual(['knight']);
    expect(summary.balance).toBe(PIECE_VALUE.knight);
  });

  it('counts an en passant capture, whose victim is not on the destination square', () => {
    const summary = summariseCaptures(
      play([
        { from: 'e2', to: 'e4' },
        { from: 'a7', to: 'a6' },
        { from: 'e4', to: 'e5' },
        { from: 'd7', to: 'd5' },
        { from: 'e5', to: 'd6' },
      ]),
    );
    expect(summary.byWhite).toEqual(['pawn']);
    expect(summary.balance).toBe(1);
  });

  it('adds what a promotion gained over the pawn it replaced', () => {
    const engine = new ChessEngine('7k/P7/8/8/8/8/8/7K w - - 0 1');
    engine.move({ from: 'a7', to: 'a8', promotion: 'queen' });
    const summary = summariseCaptures(engine.history);
    expect(summary.byWhite).toEqual([]);
    expect(summary.balance).toBe(PIECE_VALUE.queen - PIECE_VALUE.pawn);
  });

  it('sorts each pile most valuable first, whatever order they fell in', () => {
    const summary = summariseCaptures([
      capture('white', 'pawn'),
      capture('white', 'queen'),
      capture('white', 'knight'),
      capture('black', 'bishop'),
    ]);
    expect(summary.byWhite).toEqual(['queen', 'knight', 'pawn']);
    expect(summary.byBlack).toEqual(['bishop']);
    expect(summary.balance).toBe(
      PIECE_VALUE.queen + PIECE_VALUE.knight + PIECE_VALUE.pawn - PIECE_VALUE.bishop,
    );
  });
});
