// WHAT: Tests for PieceTracker — identities following pieces through moves.
// HOW:  Plays real moves through ChessEngine and applies them to the tracker.
// WHY:  If the tracker drifts, the reveal shows the wrong story on the wrong piece.

import { describe, expect, it } from 'vitest';

import { ALL_SQUARES, rankIndex } from '@domain/board/Square';
import { ChessEngine } from '@domain/chess/ChessEngine';
import { buildBoardTheme } from '@domain/theme/buildBoardTheme';
import { PieceTracker } from '@game/PieceTracker';

const theme = buildBoardTheme(
  ALL_SQUARES.map((square) => ({
    square,
    heightMeters: rankIndex(square) * 7,
    cover: 'grass' as const,
    features: [],
    coastal: false,
  })),
);

describe('PieceTracker', () => {
  it('starts with every identity on its home square', () => {
    const t = new PieceTracker();
    t.reset(theme.pieces);
    expect(t.all()).toHaveLength(32);
    expect(t.at('e1')?.type).toBe('king');
    expect(t.at('e4')).toBeNull();
  });

  it('moves identities, removes captures, follows castling and promotion', () => {
    const e = new ChessEngine();
    const t = new PieceTracker();
    t.reset(theme.pieces);
    const knightName = t.at('g1')?.cell.name;

    const play = (from: string, to: string, promotion?: 'queen') => {
      const m = e.move({
        from: from as never,
        to: to as never,
        ...(promotion ? { promotion } : {}),
      });
      t.apply(m);
      return m;
    };
    play('e2', 'e4');
    play('d7', 'd5');
    play('e4', 'd5'); // capture
    expect(t.at('d5')?.homeSquare).toBe('e2');
    expect(t.all()).toHaveLength(31);

    play('g8', 'f6');
    play('g1', 'f3');
    expect(t.at('f3')?.cell.name).toBe(knightName);
    play('f6', 'd5'); // recapture
    play('f1', 'c4');
    play('e7', 'e6');
    play('e1', 'g1'); // O-O
    expect(t.at('g1')?.type).toBe('king');
    expect(t.at('f1')?.type).toBe('rook');
    expect(t.at('f1')?.homeSquare).toBe('h1');
    expect(t.at('h1')).toBeNull();
  });

  it('keeps the identity through promotion and records the new type', () => {
    const e = new ChessEngine('8/P7/8/8/8/8/8/k6K w - - 0 1');
    const t = new PieceTracker();
    const pawn = theme.pieces.find((p) => p.homeSquare === 'a2');
    if (pawn === undefined) throw new Error('no a2 pawn');
    t.reset([{ ...pawn, homeSquare: 'a7' }]);
    const m = e.move({ from: 'a7', to: 'a8', promotion: 'queen' });
    t.apply(m);
    expect(t.at('a8')?.currentType).toBe('queen');
    expect(t.at('a8')?.cell.name).toBe(pawn.cell.name);
    t.undo(m, null);
    expect(t.at('a7')?.currentType).toBe('pawn');
  });
});
