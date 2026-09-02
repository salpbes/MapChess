// WHAT: Tests for GameLoop's click → move state machine, with fake view and chooser.
// HOW:  A recording IBoardView and a scripted IPromotionChooser. Drives clicks
//       and asserts on engine state, highlights and bus events.
// WHY:  The loop is the glue between input, rules and rendering. Testing it
//       headless proves the glue has no hidden three.js or DOM dependency.

import { describe, expect, it, vi } from 'vitest';

import { ChessEngine } from '@domain/chess/ChessEngine';
import type { Color, Move, PlacedPiece, PromotionPiece } from '@domain/chess/types';
import type { GameEvents } from '@game/GameEvents';
import { GameLoop } from '@game/GameLoop';
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
  public asked: Color[] = [];
  public constructor(private readonly answer: PromotionPiece | null) {}
  public choose(color: Color): Promise<PromotionPiece | null> {
    this.asked.push(color);
    return Promise.resolve(this.answer);
  }
}

function setup(fen?: string, promotion: PromotionPiece | null = 'queen') {
  const engine = new ChessEngine(fen);
  const view = new FakeView();
  const chooser = new ScriptedChooser(promotion);
  const bus = new EventBus<GameEvents>();
  const loop = new GameLoop({ engine, view, promotion: chooser, bus });
  loop.start();
  return { engine, view, chooser, bus, loop };
}

describe('GameLoop', () => {
  it('shows the starting position and publishes status on start', () => {
    const bus = new EventBus<GameEvents>();
    const status = vi.fn();
    bus.on('status-changed', status);
    const view = new FakeView();
    new GameLoop({
      engine: new ChessEngine(),
      view,
      promotion: new ScriptedChooser(null),
      bus,
    }).start();

    expect(view.position).toHaveLength(32);
    expect(status).toHaveBeenCalledWith({
      status: { kind: 'playing', inCheck: false },
      turn: 'white',
    });
  });

  it('selects an own piece and highlights its moves', async () => {
    const { view, loop } = setup();
    await loop.handleSquareClick('e2');
    expect(view.highlights.selected).toBe('e2');
    expect([...(view.highlights.moves ?? [])].sort()).toEqual(['e3', 'e4']);
  });

  it('ignores clicks on empty squares and enemy pieces when nothing is selected', async () => {
    const { view, loop } = setup();
    await loop.handleSquareClick('e4');
    expect(view.highlights.selected).toBeUndefined();
    await loop.handleSquareClick('e7');
    expect(view.highlights.selected).toBeUndefined();
  });

  it('plays a legal move and clears the selection', async () => {
    const { engine, view, bus, loop } = setup();
    const played = vi.fn();
    bus.on('move-played', played);

    await loop.handleSquareClick('e2');
    await loop.handleSquareClick('e4');

    expect(engine.pieceAt('e4')).toEqual({ type: 'pawn', color: 'white' });
    expect(view.played.map((m) => m.san)).toEqual(['e4']);
    expect(view.highlights.selected).toBeUndefined();
    expect(played).toHaveBeenCalledTimes(1);
    expect(engine.turn).toBe('black');
  });

  it('refuses an illegal destination by re-evaluating the click, not by moving', async () => {
    const { engine, view, loop } = setup();
    await loop.handleSquareClick('e2');
    await loop.handleSquareClick('e5');
    expect(engine.pieceAt('e2')).toEqual({ type: 'pawn', color: 'white' });
    expect(view.played).toHaveLength(0);
    expect(view.highlights.selected).toBeUndefined();
  });

  it('re-selects when another own piece is clicked', async () => {
    const { view, loop } = setup();
    await loop.handleSquareClick('e2');
    await loop.handleSquareClick('g1');
    expect(view.highlights.selected).toBe('g1');
  });

  it('deselects when the selected square is clicked again', async () => {
    const { view, loop } = setup();
    await loop.handleSquareClick('e2');
    await loop.handleSquareClick('e2');
    expect(view.highlights.selected).toBeUndefined();
  });

  it('separates captures from quiet moves in highlights', async () => {
    const { loop, view } = setup('4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1');
    await loop.handleSquareClick('e4');
    expect(view.highlights.moves).toEqual(['e5']);
    expect(view.highlights.captures).toEqual(['d5']);
  });

  it('asks for a promotion piece and applies the answer', async () => {
    const { engine, chooser, loop } = setup('8/P7/8/8/8/8/8/k6K w - - 0 1', 'knight');
    await loop.handleSquareClick('a7');
    await loop.handleSquareClick('a8');
    expect(chooser.asked).toEqual(['white']);
    expect(engine.pieceAt('a8')).toEqual({ type: 'knight', color: 'white' });
  });

  it('cancels the move if the promotion prompt is dismissed', async () => {
    const { engine, loop } = setup('8/P7/8/8/8/8/8/k6K w - - 0 1', null);
    await loop.handleSquareClick('a7');
    await loop.handleSquareClick('a8');
    expect(engine.pieceAt('a7')).toEqual({ type: 'pawn', color: 'white' });
    expect(engine.turn).toBe('white');
  });

  it('highlights the king in check and reports checkmate', async () => {
    const { view, bus, loop } = setup('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1');
    const status = vi.fn();
    bus.on('status-changed', status);

    await loop.handleSquareClick('a1');
    await loop.handleSquareClick('a8');

    expect(view.highlights.check).toBe('g8');
    expect(status).toHaveBeenLastCalledWith({
      status: { kind: 'checkmate', winner: 'white' },
      turn: 'black',
    });
    // Game over: further clicks do nothing.
    await loop.handleSquareClick('g8');
    expect(view.highlights.selected).toBeUndefined();
  });
});
