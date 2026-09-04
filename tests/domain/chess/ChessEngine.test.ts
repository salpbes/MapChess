// WHAT: Tests for ChessEngine — the full rule set behind IChessEngine.
// HOW:  Plays sequences by SAN through a small helper, or loads a FEN for
//       positions that would take too many moves to reach. Every rule the plan
//       lists (legal moves, make/undo, check, mate, stalemate, promotion,
//       castling, en passant) plus the draws has at least one test.
// WHY:  BUILD_PLAN Phase 2 "done when": tests pass and a whole game can be
//       played with no renderer. These tests are that guarantee.

import { describe, expect, it } from 'vitest';

import { ChessEngine } from '@domain/chess/ChessEngine';
import { IllegalMoveError, InvalidPositionError } from '@domain/chess/errors';
import type { Move } from '@domain/chess/types';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** Plays SAN moves in order; throws if any is not legal so tests fail loudly. */
function play(engine: ChessEngine, ...sans: string[]): Move[] {
  return sans.map((san) => {
    const found = engine.legalMoves().find((m) => m.san === san);
    if (found === undefined) {
      throw new Error(`Test setup: "${san}" is not legal in ${engine.fen}`);
    }
    return engine.move({
      from: found.from,
      to: found.to,
      ...(found.promotion === null ? {} : { promotion: found.promotion }),
    });
  });
}

function expectIllegal(fn: () => unknown, reason: IllegalMoveError['reason']): void {
  try {
    fn();
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(IllegalMoveError);
    expect((error as IllegalMoveError).reason).toBe(reason);
    return;
  }
  throw new Error(`Expected IllegalMoveError(${reason}) but nothing was thrown.`);
}

describe('ChessEngine — starting position', () => {
  it('starts with White to move, 32 pieces, 20 legal moves, not in check', () => {
    const e = new ChessEngine();
    expect(e.fen).toBe(START_FEN);
    expect(e.turn).toBe('white');
    expect(e.pieces()).toHaveLength(32);
    expect(e.pieces().filter((p) => p.piece.color === 'white')).toHaveLength(16);
    expect(e.legalMoves()).toHaveLength(20);
    expect(e.status).toEqual({ kind: 'playing', inCheck: false });
    expect(e.history).toHaveLength(0);
  });

  it('reads pieces by square', () => {
    const e = new ChessEngine();
    expect(e.pieceAt('e1')).toEqual({ type: 'king', color: 'white' });
    expect(e.pieceAt('d8')).toEqual({ type: 'queen', color: 'black' });
    expect(e.pieceAt('e4')).toBeNull();
  });

  it('filters legal moves by origin square', () => {
    const e = new ChessEngine();
    const knight = e
      .legalMoves('g1')
      .map((m) => m.to)
      .sort();
    expect(knight).toEqual(['f3', 'h3']);
    expect(e.legalMoves('e4')).toHaveLength(0);
  });
});

describe('ChessEngine — making and undoing moves', () => {
  it('plays a move, flips the turn, records history', () => {
    const e = new ChessEngine();
    const m = e.move({ from: 'e2', to: 'e4' });
    expect(m).toMatchObject({ from: 'e2', to: 'e4', piece: 'pawn', color: 'white', san: 'e4' });
    expect(m.captured).toBeNull();
    expect(m.castle).toBeNull();
    expect(e.turn).toBe('black');
    expect(e.pieceAt('e2')).toBeNull();
    expect(e.pieceAt('e4')).toEqual({ type: 'pawn', color: 'white' });
    expect(e.history).toHaveLength(1);
  });

  it('undoes back to the exact previous position', () => {
    const e = new ChessEngine();
    play(e, 'e4', 'd5', 'exd5');
    expect(e.pieceAt('d5')).toEqual({ type: 'pawn', color: 'white' });

    const undone = e.undo();
    expect(undone?.san).toBe('exd5');
    expect(e.pieceAt('d5')).toEqual({ type: 'pawn', color: 'black' });
    expect(e.pieceAt('e4')).toEqual({ type: 'pawn', color: 'white' });
    expect(e.history).toHaveLength(2);

    e.undo();
    e.undo();
    expect(e.fen).toBe(START_FEN);
    expect(e.undo()).toBeNull();
  });

  it('reports captures with the captured piece and square', () => {
    const e = new ChessEngine();
    const [, , capture] = play(e, 'e4', 'd5', 'exd5');
    expect(capture?.captured).toBe('pawn');
    expect(capture?.capturedSquare).toBe('d5');
    expect(capture?.isEnPassant).toBe(false);
  });

  it('resets to the start', () => {
    const e = new ChessEngine();
    play(e, 'e4', 'e5');
    e.reset();
    expect(e.fen).toBe(START_FEN);
    expect(e.history).toHaveLength(0);
  });
});

describe('ChessEngine — refusing illegal moves', () => {
  it('rejects a pawn moving three squares', () => {
    const e = new ChessEngine();
    expect(e.isLegal({ from: 'e2', to: 'e5' })).toBe(false);
    expectIllegal(() => e.move({ from: 'e2', to: 'e5' }), 'not-a-legal-destination');
    expect(e.fen).toBe(START_FEN);
  });

  it('rejects moving the opponent’s piece', () => {
    const e = new ChessEngine();
    expectIllegal(() => e.move({ from: 'e7', to: 'e5' }), 'not-your-turn');
  });

  it('rejects moving from an empty square', () => {
    const e = new ChessEngine();
    expectIllegal(() => e.move({ from: 'e4', to: 'e5' }), 'no-piece-on-from-square');
  });

  it('rejects moving a pinned piece off the pin line', () => {
    // White rook e2 is pinned to the king e1 by the black rook e8.
    const e = new ChessEngine('4r2k/8/8/8/8/8/4R3/4K3 w - - 0 1');
    expect(e.isLegal({ from: 'e2', to: 'd2' })).toBe(false);
    expect(e.isLegal({ from: 'e2', to: 'e3' })).toBe(true);
  });

  it('rejects moving the king into check', () => {
    const e = new ChessEngine('7k/8/8/8/8/8/r7/4K3 w - - 0 1');
    expect(e.isLegal({ from: 'e1', to: 'e2' })).toBe(false);
    expect(e.isLegal({ from: 'e1', to: 'd1' })).toBe(true);
  });

  it('only allows moves that resolve check', () => {
    const e = new ChessEngine();
    play(e, 'e4', 'f5', 'Qh5+'); // Black is in check from h5.
    expect(e.status).toEqual({ kind: 'playing', inCheck: true });
    expect(
      e
        .legalMoves()
        .map((m) => m.san)
        .sort(),
    ).toEqual(['g6']);
    expectIllegal(() => e.move({ from: 'a7', to: 'a6' }), 'not-a-legal-destination');
  });
});

describe('ChessEngine — check and checkmate', () => {
  it('detects check', () => {
    const e = new ChessEngine();
    play(e, 'e4', 'e5', 'Qh5', 'Nc6', 'Qxf7+');
    expect(e.status).toEqual({ kind: 'playing', inCheck: true });
  });

  it('detects checkmate and names the winner (Fool’s mate, Black wins)', () => {
    const e = new ChessEngine();
    play(e, 'f3', 'e5', 'g4', 'Qh4#');
    expect(e.status).toEqual({ kind: 'checkmate', winner: 'black' });
    expect(e.legalMoves()).toHaveLength(0);
  });

  it('detects checkmate for White (Scholar’s mate)', () => {
    const e = new ChessEngine();
    play(e, 'e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7#');
    expect(e.status).toEqual({ kind: 'checkmate', winner: 'white' });
  });

  it('refuses any move after the game has ended', () => {
    const e = new ChessEngine();
    play(e, 'f3', 'e5', 'g4', 'Qh4#');
    expectIllegal(() => e.move({ from: 'a2', to: 'a3' }), 'game-over');
  });

  it('can undo a checkmate and continue', () => {
    const e = new ChessEngine();
    play(e, 'f3', 'e5', 'g4', 'Qh4#');
    e.undo();
    expect(e.status.kind).toBe('playing');
    expect(e.turn).toBe('black');
  });
});

describe('ChessEngine — draws', () => {
  it('detects stalemate', () => {
    const e = new ChessEngine('k7/8/1Q6/8/8/8/8/7K b - - 0 1');
    expect(e.status).toEqual({ kind: 'draw', reason: 'stalemate' });
    expect(e.legalMoves()).toHaveLength(0);
  });

  it('detects insufficient material', () => {
    const e = new ChessEngine('k7/8/8/8/8/8/8/K6N w - - 0 1');
    expect(e.status).toEqual({ kind: 'draw', reason: 'insufficient-material' });
  });

  it('detects the fifty-move rule', () => {
    const e = new ChessEngine('k7/8/8/8/8/8/8/K6R w - - 99 60');
    expect(e.status.kind).toBe('playing');
    e.move({ from: 'h1', to: 'h2' });
    expect(e.status).toEqual({ kind: 'draw', reason: 'fifty-moves' });
  });

  it('detects threefold repetition', () => {
    const e = new ChessEngine();
    play(e, 'Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1');
    expect(e.status.kind).toBe('playing');
    play(e, 'Ng8');
    expect(e.status).toEqual({ kind: 'draw', reason: 'threefold-repetition' });
  });
});

describe('ChessEngine — promotion', () => {
  const PROMO = '8/P7/8/8/8/8/8/k6K w - - 0 1';

  it('knows when a move requires a promotion piece', () => {
    const e = new ChessEngine(PROMO);
    expect(e.requiresPromotion('a7', 'a8')).toBe(true);
    expect(e.requiresPromotion('h1', 'h2')).toBe(false);
  });

  it('refuses a promotion move without a piece', () => {
    const e = new ChessEngine(PROMO);
    expect(e.isLegal({ from: 'a7', to: 'a8' })).toBe(false);
    expectIllegal(() => e.move({ from: 'a7', to: 'a8' }), 'promotion-required');
  });

  it('promotes to the requested piece', () => {
    const e = new ChessEngine(PROMO);
    const m = e.move({ from: 'a7', to: 'a8', promotion: 'queen' });
    expect(m.promotion).toBe('queen');
    expect(m.san.startsWith('a8=Q')).toBe(true);
    expect(e.pieceAt('a8')).toEqual({ type: 'queen', color: 'white' });
  });

  it('allows underpromotion', () => {
    const e = new ChessEngine(PROMO);
    e.move({ from: 'a7', to: 'a8', promotion: 'knight' });
    expect(e.pieceAt('a8')).toEqual({ type: 'knight', color: 'white' });
  });

  it('lists all four promotion choices as separate legal moves', () => {
    const e = new ChessEngine(PROMO);
    const promos = e
      .legalMoves('a7')
      .map((m) => m.promotion)
      .sort();
    expect(promos).toEqual(['bishop', 'knight', 'queen', 'rook']);
  });

  it('refuses a promotion piece on a non-promoting move', () => {
    const e = new ChessEngine();
    expectIllegal(
      () => e.move({ from: 'e2', to: 'e4', promotion: 'queen' }),
      'promotion-not-allowed',
    );
  });

  it('undoes a promotion back to a pawn', () => {
    const e = new ChessEngine(PROMO);
    e.move({ from: 'a7', to: 'a8', promotion: 'queen' });
    e.undo();
    expect(e.pieceAt('a7')).toEqual({ type: 'pawn', color: 'white' });
    expect(e.pieceAt('a8')).toBeNull();
  });
});

describe('ChessEngine — castling', () => {
  it('castles kingside and reports the rook path', () => {
    const e = new ChessEngine();
    play(e, 'e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5');
    const m = e.move({ from: 'e1', to: 'g1' });
    expect(m.san).toBe('O-O');
    expect(m.castle).toEqual({ side: 'king', rookFrom: 'h1', rookTo: 'f1' });
    expect(e.pieceAt('g1')).toEqual({ type: 'king', color: 'white' });
    expect(e.pieceAt('f1')).toEqual({ type: 'rook', color: 'white' });
    expect(e.pieceAt('h1')).toBeNull();
    expect(e.pieceAt('e1')).toBeNull();
  });

  it('castles queenside for Black and reports the rook path', () => {
    const e = new ChessEngine('r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1');
    const m = e.move({ from: 'e8', to: 'c8' });
    expect(m.san).toBe('O-O-O');
    expect(m.castle).toEqual({ side: 'queen', rookFrom: 'a8', rookTo: 'd8' });
    expect(e.pieceAt('d8')).toEqual({ type: 'rook', color: 'black' });
  });

  it('refuses castling once the rights are gone', () => {
    const e = new ChessEngine('r3k2r/8/8/8/8/8/8/R3K2R w kq - 0 1');
    expect(e.isLegal({ from: 'e1', to: 'g1' })).toBe(false);
    expect(e.isLegal({ from: 'e1', to: 'c1' })).toBe(false);
  });

  it('refuses castling through an attacked square but allows the other side', () => {
    // Black rook on f2 covers f1: kingside is out, queenside is fine.
    const e = new ChessEngine('r3k2r/8/8/8/8/8/5r2/R3K2R w KQkq - 0 1');
    expect(e.isLegal({ from: 'e1', to: 'g1' })).toBe(false);
    expect(e.isLegal({ from: 'e1', to: 'c1' })).toBe(true);
  });

  it('refuses castling while in check', () => {
    const e = new ChessEngine('r3k2r/8/8/8/8/8/4r3/R3K2R w KQkq - 0 1');
    expect(e.status).toEqual({ kind: 'playing', inCheck: true });
    expect(e.isLegal({ from: 'e1', to: 'g1' })).toBe(false);
    expect(e.isLegal({ from: 'e1', to: 'c1' })).toBe(false);
  });

  it('undoes a castle, restoring both king and rook', () => {
    const e = new ChessEngine('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    e.move({ from: 'e1', to: 'g1' });
    e.undo();
    expect(e.pieceAt('e1')).toEqual({ type: 'king', color: 'white' });
    expect(e.pieceAt('h1')).toEqual({ type: 'rook', color: 'white' });
    expect(e.isLegal({ from: 'e1', to: 'g1' })).toBe(true);
  });
});

describe('ChessEngine — en passant', () => {
  it('captures en passant and reports the real captured square', () => {
    const e = new ChessEngine();
    play(e, 'e4', 'a6', 'e5', 'd5');
    expect(e.isLegal({ from: 'e5', to: 'd6' })).toBe(true);

    const m = e.move({ from: 'e5', to: 'd6' });
    expect(m.isEnPassant).toBe(true);
    expect(m.captured).toBe('pawn');
    expect(m.capturedSquare).toBe('d5');
    expect(e.pieceAt('d5')).toBeNull();
    expect(e.pieceAt('d6')).toEqual({ type: 'pawn', color: 'white' });
  });

  it('only allows en passant on the very next move', () => {
    const e = new ChessEngine();
    play(e, 'e4', 'a6', 'e5', 'd5', 'h3', 'a5');
    expect(e.isLegal({ from: 'e5', to: 'd6' })).toBe(false);
  });

  it('undoes en passant, restoring the captured pawn', () => {
    const e = new ChessEngine();
    play(e, 'e4', 'a6', 'e5', 'd5');
    e.move({ from: 'e5', to: 'd6' });
    e.undo();
    expect(e.pieceAt('d5')).toEqual({ type: 'pawn', color: 'black' });
    expect(e.pieceAt('e5')).toEqual({ type: 'pawn', color: 'white' });
  });
});

describe('ChessEngine — loading positions', () => {
  it('loads a FEN and clears history', () => {
    const e = new ChessEngine();
    play(e, 'e4');
    e.load('k7/8/8/8/8/8/8/K6R w - - 0 1');
    expect(e.history).toHaveLength(0);
    expect(e.pieces()).toHaveLength(3);
    expect(e.turn).toBe('white');
  });

  it('rejects a malformed FEN and keeps the current position', () => {
    const e = new ChessEngine();
    play(e, 'e4');
    const before = e.fen;
    expect(() => {
      e.load('this is not a fen');
    }).toThrow(InvalidPositionError);
    expect(e.fen).toBe(before);
    expect(e.history).toHaveLength(1);
  });

  it('rejects a FEN in the constructor too', () => {
    expect(() => new ChessEngine('8/8/8/8/8/8/8/8 w - - 0 1')).toThrow(InvalidPositionError);
  });
});

describe('ChessEngine — a full game', () => {
  it('plays a complete game to checkmate with only the engine', () => {
    const e = new ChessEngine();
    // Opera Game, Morphy vs Duke of Brunswick & Count Isouard, Paris 1858.
    const sans = [
      'e4',
      'e5',
      'Nf3',
      'd6',
      'd4',
      'Bg4',
      'dxe5',
      'Bxf3',
      'Qxf3',
      'dxe5',
      'Bc4',
      'Nf6',
      'Qb3',
      'Qe7',
      'Nc3',
      'c6',
      'Bg5',
      'b5',
      'Nxb5',
      'cxb5',
      'Bxb5+',
      'Nbd7',
      'O-O-O',
      'Rd8',
      'Rxd7',
      'Rxd7',
      'Rd1',
      'Qe6',
      'Bxd7+',
      'Nxd7',
      'Qb8+',
      'Nxb8',
      'Rd8#',
    ];
    play(e, ...sans);
    expect(e.history).toHaveLength(33);
    expect(e.status).toEqual({ kind: 'checkmate', winner: 'white' });
    expect(e.history.map((m) => m.san)).toEqual(sans);
  });
});

describe('ChessEngine.isPinned', () => {
  it('sees a knight pinned to its king by a bishop', () => {
    const e = new ChessEngine('r1bqk1nr/pp3ppp/4p3/3pn3/Pb6/2N1P3/2P3PP/R2QKBNR w KQkq - 0 9');
    expect(e.isPinned('c3')).toBe(true);
    expect(e.legalMoves('c3')).toHaveLength(0);
  });

  it('does not call a piece pinned just because it cannot move', () => {
    // The a1 rook is walled in by its own pawn and knight; nothing pins it.
    const e = new ChessEngine('4k3/8/8/8/8/8/P7/RN2K3 w - - 0 1');
    expect(e.legalMoves('a1')).toHaveLength(0);
    expect(e.isPinned('a1')).toBe(false);
  });

  it('is false for a free piece, an empty square and a king', () => {
    const e = new ChessEngine();
    expect(e.isPinned('g1')).toBe(false);
    expect(e.isPinned('e4')).toBe(false);
    expect(e.isPinned('e1')).toBe(false);
  });

  it('sees a pin that only allows moves along the pinning line', () => {
    // The rook on e2 is pinned by the rook on e8, but may still slide on the e-file.
    const e = new ChessEngine('4r2k/8/8/8/8/8/4R3/4K3 w - - 0 1');
    expect(e.isPinned('e2')).toBe(true);
    expect(e.legalMoves('e2').map((m) => m.to)).toEqual(['e3', 'e4', 'e5', 'e6', 'e7', 'e8']);
  });
});
