// WHAT: Tests for GameLoop's AI seat — engine replies, guards and fallbacks.
// HOW:  A scripted IChessAI that returns queued moves (or throws). The engine
//       is real; the view and promotion chooser are fakes.
// WHY:  BUILD_PLAN Phase 4 "done when": the AI always plays a legal move.
//       These tests pin the guard that makes that true even when Stockfish
//       misbehaves, without needing a worker or a browser.

import { describe, expect, it, vi } from 'vitest';

import type { Difficulty, IChessAI } from '@ai/IChessAI';
import { ChessEngine } from '@domain/chess/ChessEngine';
import type { Move, MoveRequest, PlacedPiece } from '@domain/chess/types';
import type { GameEvents } from '@game/GameEvents';
import { GameLoop } from '@game/GameLoop';
import type { BoardHighlights, IBoardView } from '@game/IBoardView';
import type { IPromotionChooser } from '@game/IPromotionChooser';
import { EventBus } from '@shared/events/EventBus';

class FakeView implements IBoardView {
  public played: Move[] = [];
  public showPosition(_pieces: readonly PlacedPiece[]): void {
    // no-op
  }
  public playMove(move: Move): Promise<void> {
    this.played.push(move);
    return Promise.resolve();
  }
  public showHighlights(_h: BoardHighlights): void {
    // no-op
  }
  public clearHighlights(): void {
    // no-op
  }
}

const noPromotion: IPromotionChooser = { choose: () => Promise.resolve(null) };

class ScriptedAI implements IChessAI {
  public asked: string[] = [];
  public difficulty: Difficulty | null = null;
  public constructor(private readonly replies: (MoveRequest | Error)[]) {}
  public ready(): Promise<void> {
    return Promise.resolve();
  }
  public setDifficulty(level: Difficulty): void {
    this.difficulty = level;
  }
  public chooseMove(fen: string): Promise<MoveRequest> {
    this.asked.push(fen);
    const next = this.replies.shift();
    if (next === undefined) return Promise.reject(new Error('script exhausted'));
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  }
  public dispose(): void {
    // no-op
  }
}

/** Lets queued microtasks (the AI reply chain) settle. */
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

function setup(replies: (MoveRequest | Error)[], fen?: string) {
  const engine = new ChessEngine(fen);
  const view = new FakeView();
  const ai = new ScriptedAI(replies);
  const bus = new EventBus<GameEvents>();
  const loop = new GameLoop({ engine, view, promotion: noPromotion, bus, ai });
  return { engine, view, ai, bus, loop };
}

describe('GameLoop with an AI seat', () => {
  it('lets the AI move first when it plays White', async () => {
    const { engine, ai, bus, loop } = setup([{ from: 'e2', to: 'e4' }]);
    const thinking = vi.fn();
    bus.on('ai-thinking', thinking);

    loop.start({ white: 'ai', black: 'human' });
    await settle();

    expect(thinking).toHaveBeenCalledWith({ color: 'white' });
    expect(ai.asked).toHaveLength(1);
    expect(engine.pieceAt('e4')).toEqual({ type: 'pawn', color: 'white' });
    expect(engine.turn).toBe('black');
  });

  it('replies after the human moves', async () => {
    const { engine, view, loop } = setup([{ from: 'e7', to: 'e5' }]);
    loop.start({ white: 'human', black: 'ai' });
    await settle();
    expect(view.played).toHaveLength(0);

    await loop.handleSquareClick('e2');
    await loop.handleSquareClick('e4');
    await settle();

    expect(view.played.map((m) => m.san)).toEqual(['e4', 'e5']);
    expect(engine.turn).toBe('white');
  });

  it('ignores clicks while it is the AI’s turn', async () => {
    const { engine, loop } = setup([]);
    loop.start({ white: 'ai', black: 'human' });
    // The scripted AI rejects (script exhausted) → fallback move plays; but before
    // that resolves, a click must not select anything.
    await loop.handleSquareClick('e2');
    await settle();
    expect(loop.isHumanTurn()).toBe(true);
    expect(engine.history).toHaveLength(1);
  });

  it('refuses an illegal engine reply and plays a legal fallback instead', async () => {
    const { engine, bus, loop } = setup([{ from: 'e2', to: 'e5' }]);
    const aiError = vi.fn();
    bus.on('ai-error', aiError);

    loop.start({ white: 'ai', black: 'human' });
    await settle();

    expect(aiError).toHaveBeenCalledTimes(1);
    expect(engine.history).toHaveLength(1);
    expect(engine.pieceAt('e5')).toBeNull();
    expect(engine.turn).toBe('black');
  });

  it('falls back to a legal move when the engine throws', async () => {
    const { engine, bus, loop } = setup([new Error('worker crashed')]);
    const aiError = vi.fn();
    bus.on('ai-error', aiError);

    loop.start({ white: 'ai', black: 'human' });
    await settle();

    expect(aiError).toHaveBeenCalledTimes(1);
    expect(engine.history).toHaveLength(1);
    expect(engine.turn).toBe('black');
  });

  it('applies the engine’s promotion piece', async () => {
    const { engine, loop } = setup(
      [{ from: 'a7', to: 'a8', promotion: 'rook' }],
      '8/P7/8/8/8/8/8/k6K w - - 0 1',
    );
    loop.start({ white: 'ai', black: 'human' });
    await settle();
    expect(engine.pieceAt('a8')).toEqual({ type: 'rook', color: 'white' });
  });

  it('does not ask the AI once the game is over', async () => {
    const { ai, loop } = setup([{ from: 'a1', to: 'a8' }], '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1');
    loop.start({ white: 'ai', black: 'ai' });
    await settle();
    // Ra8# ends the game; Black's AI must not be consulted.
    expect(ai.asked).toHaveLength(1);
  });

  it('drops a stale reply after newGame() and restarts cleanly', async () => {
    let release: (m: MoveRequest) => void = () => undefined;
    const slow: IChessAI = {
      ready: () => Promise.resolve(),
      setDifficulty: () => undefined,
      chooseMove: () =>
        new Promise<MoveRequest>((resolve) => {
          release = resolve;
        }),
      dispose: () => undefined,
    };
    const engine = new ChessEngine();
    const loop = new GameLoop({
      engine,
      view: new FakeView(),
      promotion: noPromotion,
      bus: new EventBus<GameEvents>(),
      ai: slow,
    });

    loop.start({ white: 'ai', black: 'human' });
    await settle();
    loop.newGame({ white: 'human', black: 'ai' });
    release({ from: 'e2', to: 'e4' });
    await settle();

    // The stale White reply was ignored; it is still White (human) to move.
    expect(engine.history).toHaveLength(0);
    expect(engine.turn).toBe('white');
    expect(loop.isHumanTurn()).toBe(true);
  });

  it('treats every seat as human when no AI is supplied', () => {
    const engine = new ChessEngine();
    const loop = new GameLoop({
      engine,
      view: new FakeView(),
      promotion: noPromotion,
      bus: new EventBus<GameEvents>(),
    });
    loop.start({ white: 'ai', black: 'ai' });
    expect(loop.isHumanTurn()).toBe(true);
  });
});
