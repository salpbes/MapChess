// WHAT: Tests for the Phase 11 additions to the loop: take-back, resignation,
//       and restoring a saved game.
// HOW:  The same fake view and scripted chooser as the other loop tests, plus a
//       scripted AI so "undo two plies against the computer" can be checked
//       without Stockfish.
// WHY:  Every one of these can leave the game in a state the rules alone would
//       never produce — a resigned but legal position, a history that has been
//       rewound under the trackers — so they are worth pinning down headless.

import { describe, expect, it, vi } from 'vitest';

import type { IChessAI } from '@ai/IChessAI';
import { ChessEngine } from '@domain/chess/ChessEngine';
import type { Color, Move, MoveRequest, PlacedPiece, PromotionPiece } from '@domain/chess/types';
import type { GameEvents } from '@game/GameEvents';
import { GameLoop } from '@game/GameLoop';
import type { Players } from '@game/GameLoop';
import type { BoardHighlights, IBoardView } from '@game/IBoardView';
import type { IPromotionChooser } from '@game/IPromotionChooser';
import { EventBus } from '@shared/events/EventBus';

class FakeView implements IBoardView {
  public position: readonly PlacedPiece[] = [];
  public played: Move[] = [];
  public highlights: BoardHighlights = {};

  public showPosition(pieces: readonly PlacedPiece[]): void {
    this.position = pieces;
  }
  public playMove(move: Move): Promise<void> {
    this.played.push(move);
    return Promise.resolve();
  }
  public showHighlights(h: BoardHighlights): void {
    this.highlights = h;
  }
  public clearHighlights(): void {
    this.highlights = {};
  }
}

class ScriptedChooser implements IPromotionChooser {
  public constructor(private readonly answer: PromotionPiece | null = 'queen') {}
  public choose(_color: Color): Promise<PromotionPiece | null> {
    return Promise.resolve(this.answer);
  }
}

/** Always plays the first legal move, so replies are deterministic. */
class FirstLegalAI implements IChessAI {
  public constructor(private readonly engine: ChessEngine) {}
  public ready(): Promise<void> {
    return Promise.resolve();
  }
  public setDifficulty(): void {
    // Nothing to vary: this opponent has one strategy.
  }
  public chooseMove(): Promise<MoveRequest> {
    const move = this.engine.legalMoves()[0];
    if (move === undefined) throw new Error('asked to move with no legal moves');
    return Promise.resolve({ from: move.from, to: move.to });
  }
  public dispose(): void {
    // No worker to tear down.
  }
}

function setup(options: { fen?: string; players?: Players; ai?: boolean } = {}) {
  const engine = new ChessEngine(options.fen);
  const view = new FakeView();
  const bus = new EventBus<GameEvents>();
  const loop = new GameLoop({
    engine,
    view,
    promotion: new ScriptedChooser(),
    bus,
    ...(options.ai === true ? { ai: new FirstLegalAI(engine) } : {}),
  });
  return {
    engine,
    view,
    bus,
    loop,
    players: options.players ?? { white: 'human', black: 'human' },
  };
}

const OPENING: readonly MoveRequest[] = [
  { from: 'e2', to: 'e4' },
  { from: 'e7', to: 'e5' },
  { from: 'g1', to: 'f3' },
];

/** Fool's mate: Black mates on move two. */
const FOOLS_MATE: readonly MoveRequest[] = [
  { from: 'f2', to: 'f3' },
  { from: 'e7', to: 'e5' },
  { from: 'g2', to: 'g4' },
  { from: 'd8', to: 'h4' },
];

describe('GameLoop history', () => {
  it('publishes the whole history after every change', async () => {
    const { bus, loop } = setup();
    const seen: number[] = [];
    bus.on('history-changed', ({ moves }) => seen.push(moves.length));
    loop.start();

    await loop.handleSquareClick('e2');
    await loop.handleSquareClick('e4');
    expect(seen).toEqual([0, 1]);
  });
});

describe('GameLoop.undo', () => {
  it('has nothing to take back before the first move', () => {
    const { loop } = setup();
    loop.start();
    expect(loop.canUndo()).toBe(false);
    expect(loop.undo()).toBe(false);
  });

  it('takes back one ply in a hot-seat game', () => {
    const { engine, loop } = setup();
    for (const move of OPENING) engine.move(move);
    loop.start();

    expect(loop.undo()).toBe(true);
    expect(engine.history).toHaveLength(2);
    expect(engine.turn).toBe('white');
  });

  it('takes back two plies against the computer, so the human is to move', async () => {
    const { engine, loop } = setup({ ai: true });
    loop.start({ white: 'human', black: 'ai' });
    await loop.handleSquareClick('e2');
    await loop.handleSquareClick('e4');
    await vi.waitFor(() => {
      expect(engine.history).toHaveLength(2);
    });

    expect(loop.undo()).toBe(true);
    expect(engine.history).toHaveLength(0);
    expect(engine.turn).toBe('white');
    expect(loop.isHumanTurn()).toBe(true);
  });

  it('emits the taken-back moves newest first, and republishes the history', () => {
    const { engine, loop, bus } = setup();
    for (const move of OPENING) engine.move(move);
    loop.start({ white: 'human', black: 'ai' });

    const undone: string[] = [];
    let history: readonly Move[] = [];
    bus.on('move-undone', (move) => undone.push(move.san));
    bus.on('history-changed', ({ moves }) => (history = moves));

    // No AI was supplied, so both seats are human and one ply comes back.
    loop.undo();
    expect(undone).toEqual(['Nf3']);
    expect(history.map((m) => m.san)).toEqual(['e4', 'e5']);
  });

  it('un-ends a game that had finished in checkmate', () => {
    const { engine, loop } = setup();
    for (const move of FOOLS_MATE) engine.move(move);
    loop.start();
    expect(loop.outcome).toEqual({ kind: 'checkmate', winner: 'black' });

    expect(loop.undo()).toBe(true);
    expect(loop.outcome).toBeNull();
  });

  it('refuses to take back a resignation', () => {
    const { engine, loop } = setup();
    for (const move of OPENING) engine.move(move);
    loop.start();
    loop.resign('white');

    expect(loop.canUndo()).toBe(false);
    expect(loop.undo()).toBe(false);
    expect(engine.history).toHaveLength(3);
  });
});

describe('GameLoop.resign', () => {
  it('ends the game in favour of the other side and announces it once', () => {
    const { loop, bus } = setup();
    const over = vi.fn();
    bus.on('game-over', over);
    loop.start();

    expect(loop.resign('white')).toBe(true);
    expect(loop.outcome).toEqual({ kind: 'resignation', winner: 'black', loser: 'white' });
    expect(over).toHaveBeenCalledTimes(1);
    expect(loop.resign('black')).toBe(false);
  });

  it('stops accepting clicks once resigned', async () => {
    const { engine, loop } = setup();
    loop.start();
    loop.resign('white');

    await loop.handleSquareClick('e2');
    await loop.handleSquareClick('e4');
    expect(engine.history).toHaveLength(0);
  });

  it('does not resign a game that is already over', () => {
    const { engine, loop } = setup();
    for (const move of FOOLS_MATE) engine.move(move);
    loop.start();
    expect(loop.resign('white')).toBe(false);
    expect(loop.outcome).toEqual({ kind: 'checkmate', winner: 'black' });
  });
});

describe('GameLoop.restore', () => {
  it('replays a saved move list into the same position, without animating it', () => {
    const { engine, view, loop } = setup();
    loop.restore({ moves: OPENING, players: { white: 'human', black: 'human' }, resignedBy: null });

    expect(engine.history.map((m) => m.san)).toEqual(['e4', 'e5', 'Nf3']);
    expect(view.played).toHaveLength(0);
    expect(view.position).toHaveLength(32);
    expect(engine.turn).toBe('black');
  });

  it('restores a resignation, so a finished game comes back finished', () => {
    const { loop, bus } = setup();
    const over = vi.fn();
    bus.on('game-over', over);
    loop.restore({ moves: OPENING, players: { white: 'human', black: 'ai' }, resignedBy: 'black' });

    expect(loop.outcome).toEqual({ kind: 'resignation', winner: 'white', loser: 'black' });
    expect(over).toHaveBeenCalledTimes(1);
  });

  it('keeps what it could replay when a saved move no longer applies', () => {
    const { engine, loop } = setup();
    const damaged: readonly MoveRequest[] = [...OPENING, { from: 'a1', to: 'a8' }];
    const complain = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    loop.restore({ moves: damaged, players: { white: 'human', black: 'human' }, resignedBy: null });

    expect(engine.history).toHaveLength(3);
    expect(complain).toHaveBeenCalled();
    complain.mockRestore();
  });

  it('leaves the restored game playable', async () => {
    const { engine, loop } = setup();
    loop.restore({ moves: OPENING, players: { white: 'human', black: 'human' }, resignedBy: null });

    await loop.handleSquareClick('b8');
    await loop.handleSquareClick('c6');
    expect(engine.history.map((m) => m.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
  });
});

describe('GameLoop castling', () => {
  /** Both sides cleared between king and rook, so all four castles are legal. */
  const CASTLE_READY = 'r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1';

  it('castles when the rook is clicked with the king selected', async () => {
    const { engine, loop } = setup({ fen: CASTLE_READY });
    loop.start();

    await loop.handleSquareClick('e1');
    await loop.handleSquareClick('h1');

    expect(engine.history[0]?.san).toBe('O-O');
    expect(engine.pieceAt('g1')?.type).toBe('king');
    expect(engine.pieceAt('f1')?.type).toBe('rook');
  });

  it('castles queenside on the a-file rook, not the nearer square', async () => {
    const { engine, loop } = setup({ fen: CASTLE_READY });
    loop.start();

    await loop.handleSquareClick('e1');
    await loop.handleSquareClick('a1');

    expect(engine.history[0]?.san).toBe('O-O-O');
    expect(engine.pieceAt('c1')?.type).toBe('king');
  });

  it('still castles by clicking the king’s own destination', async () => {
    const { engine, loop } = setup({ fen: CASTLE_READY });
    loop.start();

    await loop.handleSquareClick('e1');
    await loop.handleSquareClick('g1');

    expect(engine.history[0]?.san).toBe('O-O');
  });

  it('offers the rook square as a highlighted destination', async () => {
    const { view, loop } = setup({ fen: CASTLE_READY });
    loop.start();

    await loop.handleSquareClick('e1');
    expect(view.highlights.moves).toContain('h1');
    expect(view.highlights.moves).toContain('a1');
  });

  it('selects the rook as usual when castling is not available', async () => {
    // The king has moved, so the castling rights are gone.
    const { engine, view, loop } = setup({
      fen: 'r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w kq - 0 1',
    });
    loop.start();

    await loop.handleSquareClick('e1');
    await loop.handleSquareClick('h1');

    expect(engine.history).toHaveLength(0);
    expect(view.highlights.selected).toBe('h1');
  });

  it('does not treat the opponent’s rook as a castling partner', async () => {
    const { engine, view, loop } = setup({ fen: CASTLE_READY });
    loop.start();

    await loop.handleSquareClick('e1');
    await loop.handleSquareClick('a8');

    expect(engine.history).toHaveLength(0);
    expect(view.highlights.selected).toBeUndefined();
  });
});

describe('GameLoop selection-blocked', () => {
  /** The position from the reported game: 8... Bxb4 pins the c3 knight to e1. */
  const PINNED = 'r1bqk1nr/pp3ppp/4p3/3pn3/Pb6/2N1P3/2P3PP/R2QKBNR w KQkq - 0 9';

  it('says a pinned piece is pinned', async () => {
    const { bus, loop } = setup({ fen: PINNED });
    const blocked = vi.fn();
    bus.on('selection-blocked', blocked);
    loop.start();

    await loop.handleSquareClick('c3');
    expect(blocked).toHaveBeenCalledWith({ square: 'c3', piece: 'knight', reason: 'pinned' });
  });

  it('stays quiet for a piece that can move', async () => {
    const { bus, loop } = setup({ fen: PINNED });
    const blocked = vi.fn();
    bus.on('selection-blocked', blocked);
    loop.start();

    await loop.handleSquareClick('g1');
    expect(blocked).not.toHaveBeenCalled();
  });

  it('blames the check when the king is under attack', async () => {
    // Black bishop on b4 checks the white king on e1; the h1 rook is helpless.
    const { bus, loop } = setup({ fen: '4k3/8/8/8/1b6/8/8/4K2R w K - 0 1' });
    const blocked = vi.fn();
    bus.on('selection-blocked', blocked);
    loop.start();

    await loop.handleSquareClick('h1');
    expect(blocked).toHaveBeenCalledWith({ square: 'h1', piece: 'rook', reason: 'in-check' });
  });

  it('says a boxed-in piece has nowhere to go, which is not the same as pinned', async () => {
    const { bus, loop } = setup({ fen: '4k3/8/8/8/8/8/P7/RN2K3 w - - 0 1' });
    const blocked = vi.fn();
    bus.on('selection-blocked', blocked);
    loop.start();

    // The a1 rook is walled in by its own pawn and knight, but nothing pins it.
    await loop.handleSquareClick('a1');
    expect(blocked).toHaveBeenCalledWith({ square: 'a1', piece: 'rook', reason: 'no-moves' });
  });
});

/** Also gives advice — the first legal move, which is enough to test the wiring. */
class AdvisingAI extends FirstLegalAI {
  public hintCalls = 0;
  public hint(_fen: string): Promise<MoveRequest> {
    this.hintCalls += 1;
    return this.chooseMove();
  }
}

describe('GameLoop hints', () => {
  function withAdvisor(fen?: string) {
    const engine = new ChessEngine(fen);
    const view = new FakeView();
    const bus = new EventBus<GameEvents>();
    const ai = new AdvisingAI(engine);
    const loop = new GameLoop({ engine, view, promotion: new ScriptedChooser(), bus, ai });
    return { engine, view, bus, ai, loop };
  }

  it('offers a legal move and highlights both of its squares', async () => {
    const { view, bus, loop } = withAdvisor();
    const offered = vi.fn();
    bus.on('hint-offered', offered);
    loop.start({ white: 'human', black: 'ai' });

    const move = await loop.requestHint();
    expect(move).not.toBeNull();
    expect(offered).toHaveBeenCalledTimes(1);
    expect(view.highlights.hint).toEqual([move?.from, move?.to]);
  });

  it('does not play the move it suggests', async () => {
    const { engine, loop } = withAdvisor();
    loop.start({ white: 'human', black: 'ai' });

    await loop.requestHint();
    expect(engine.history).toHaveLength(0);
  });

  it('clears the suggestion once the position has moved on', async () => {
    const { view, loop } = withAdvisor();
    loop.start({ white: 'human', black: 'human' });

    await loop.requestHint();
    expect(view.highlights.hint).toBeDefined();
    await loop.handleSquareClick('e2');
    await loop.handleSquareClick('e4');
    expect(view.highlights.hint).toBeUndefined();
  });

  it('keeps the suggestion visible while the player picks a piece up', async () => {
    const { view, loop } = withAdvisor();
    loop.start({ white: 'human', black: 'human' });

    const move = await loop.requestHint();
    await loop.handleSquareClick('g1');
    expect(view.highlights.selected).toBe('g1');
    expect(view.highlights.hint).toEqual([move?.from, move?.to]);
  });

  it('refuses advice when it is not the player’s turn or the game is over', async () => {
    const { loop } = withAdvisor();
    loop.start({ white: 'ai', black: 'human' });
    expect(loop.canHint()).toBe(false);

    // A back-rank mate: White is to move and has no legal move at all.
    const finished = withAdvisor('6k1/8/8/8/8/8/5PPP/r6K w - - 0 1');
    finished.loop.start({ white: 'human', black: 'ai' });
    expect(finished.loop.outcome).not.toBeNull();
    expect(finished.loop.canHint()).toBe(false);
    expect(await finished.loop.requestHint()).toBeNull();
  });

  it('reports a failure instead of hanging when the engine cannot answer', async () => {
    const { bus, ai, loop } = withAdvisor();
    const failed = vi.fn();
    bus.on('hint-failed', failed);
    loop.start({ white: 'human', black: 'ai' });
    ai.hint = () => Promise.reject(new Error('engine gone'));

    expect(await loop.requestHint()).toBeNull();
    expect(failed).toHaveBeenCalled();
    // The loop must not be left busy, or the game freezes.
    expect(loop.canHint()).toBe(true);
  });

  it('offers no advice at all without an engine that gives it', async () => {
    const { loop } = setup();
    loop.start();
    expect(loop.canHint()).toBe(false);
    expect(await loop.requestHint()).toBeNull();
  });
});
