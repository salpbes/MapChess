// WHAT: Tests for saving a game and picking it up again, and for the identity
//       bookkeeping that a take-back has to reverse.
// HOW:  A real GameLoop with a fake view, a MemoryJsonStore standing in for
//       localStorage, and a ThemeTracker fed a real BoardTheme. A save is
//       written by playing, then replayed into a second, cold loop.
// WHY:  "Start, play, quit and resume" is the phase's acceptance test. The
//       parts that can silently go wrong are the guard (a save from an older
//       version must not be loaded) and the identity stack (a take-back must
//       put a captured piece's story back on its square).

import { describe, expect, it } from 'vitest';

import { ALL_SQUARES, rankIndex } from '@domain/board/Square';
import { ChessEngine } from '@domain/chess/ChessEngine';
import type { Color, Move, MoveRequest, PlacedPiece, PromotionPiece } from '@domain/chess/types';
import { buildBoardTheme } from '@domain/theme/buildBoardTheme';
import type { GameEvents } from '@game/GameEvents';
import { GameLoop } from '@game/GameLoop';
import { SaveManager } from '@game/SaveManager';
import { isSavedGame, SAVE_VERSION, toSavedMoves } from '@game/SavedGame';
import type { SavedGame } from '@game/SavedGame';
import type { BoardHighlights, IBoardView } from '@game/IBoardView';
import type { IPromotionChooser } from '@game/IPromotionChooser';
import { ThemeTracker } from '@game/ThemeTracker';
import type { SelectedArea } from '@mapdata/model/SelectedArea';
import { EventBus } from '@shared/events/EventBus';
import { MemoryJsonStore } from '@shared/storage/LocalJsonStore';

class FakeView implements IBoardView {
  public position: readonly PlacedPiece[] = [];
  public showPosition(pieces: readonly PlacedPiece[]): void {
    this.position = pieces;
  }
  public playMove(_move: Move): Promise<void> {
    return Promise.resolve();
  }
  public showHighlights(_h: BoardHighlights): void {
    // The save system does not care what is highlighted.
  }
  public clearHighlights(): void {
    // As above.
  }
}

class AlwaysQueen implements IPromotionChooser {
  public choose(_color: Color): Promise<PromotionPiece | null> {
    return Promise.resolve('queen');
  }
}

const RIEVAULX: SelectedArea = {
  centerLat: 54.2571,
  centerLon: -1.1178,
  sizeMeters: 2000,
  rotationDeg: 15,
};

const theme = buildBoardTheme(
  ALL_SQUARES.map((square) => ({
    square,
    heightMeters: rankIndex(square) * 7,
    cover: 'grass' as const,
    features: [],
    coastal: false,
  })),
);

function newGame(store: MemoryJsonStore<SavedGame>) {
  const engine = new ChessEngine();
  const bus = new EventBus<GameEvents>();
  const loop = new GameLoop({ engine, view: new FakeView(), promotion: new AlwaysQueen(), bus });
  const saves = new SaveManager({
    bus,
    store,
    context: () => ({
      area: RIEVAULX,
      players: { white: 'human', black: 'human' },
      difficulty: 'club',
    }),
  });
  return { engine, bus, loop, saves };
}

const SCOTCH: readonly MoveRequest[] = [
  { from: 'e2', to: 'e4' },
  { from: 'e7', to: 'e5' },
  { from: 'g1', to: 'f3' },
  { from: 'b8', to: 'c6' },
  { from: 'd2', to: 'd4' },
  { from: 'e5', to: 'd4' },
];

describe('isSavedGame', () => {
  const valid: SavedGame = {
    version: SAVE_VERSION,
    savedAt: '2026-09-03T10:00:00.000Z',
    area: RIEVAULX,
    players: { white: 'human', black: 'ai' },
    difficulty: 'club',
    moves: [{ from: 'e2', to: 'e4' }],
    resignedBy: null,
  };

  it('accepts a save this version wrote', () => {
    expect(isSavedGame(valid)).toBe(true);
    expect(isSavedGame(JSON.parse(JSON.stringify(valid)))).toBe(true);
  });

  it('rejects anything that is not a save', () => {
    for (const bad of [null, undefined, 42, 'save', [], {}]) {
      expect(isSavedGame(bad)).toBe(false);
    }
  });

  it('rejects a save from another version of the format', () => {
    expect(isSavedGame({ ...valid, version: SAVE_VERSION + 1 })).toBe(false);
  });

  it('rejects damaged fields rather than loading half a game', () => {
    expect(isSavedGame({ ...valid, area: { ...RIEVAULX, sizeMeters: 0 } })).toBe(false);
    expect(isSavedGame({ ...valid, players: { white: 'human', black: 'dog' } })).toBe(false);
    expect(isSavedGame({ ...valid, difficulty: 'impossible' })).toBe(false);
    expect(isSavedGame({ ...valid, moves: [{ from: 'e2', to: 'z9' }] })).toBe(false);
    expect(isSavedGame({ ...valid, moves: [{ from: 'e7', to: 'e8', promotion: 'king' }] })).toBe(
      false,
    );
    expect(isSavedGame({ ...valid, resignedBy: 'green' })).toBe(false);
  });

  it('accepts a promotion, which is the one optional field', () => {
    expect(isSavedGame({ ...valid, moves: [{ from: 'e7', to: 'e8', promotion: 'knight' }] })).toBe(
      true,
    );
  });
});

describe('toSavedMoves', () => {
  it('keeps only what is needed to replay, including the promotion choice', () => {
    const engine = new ChessEngine('7k/P7/8/8/8/8/8/7K w - - 0 1');
    engine.move({ from: 'a7', to: 'a8', promotion: 'rook' });
    expect(toSavedMoves(engine.history)).toEqual([{ from: 'a7', to: 'a8', promotion: 'rook' }]);
  });
});

describe('SaveManager', () => {
  it('writes the area, the seating and the moves as the game is played', async () => {
    const store = new MemoryJsonStore<SavedGame>();
    const { loop, saves } = newGame(store);
    loop.start({ white: 'human', black: 'human' });
    await loop.handleSquareClick('e2');
    await loop.handleSquareClick('e4');

    const saved = saves.read();
    expect(saved?.area).toEqual(RIEVAULX);
    expect(saved?.moves).toEqual([{ from: 'e2', to: 'e4' }]);
    expect(saved?.version).toBe(SAVE_VERSION);
    expect(Number.isNaN(Date.parse(saved?.savedAt ?? ''))).toBe(false);
  });

  it('follows a take-back, so what is saved is what is on the board', () => {
    const store = new MemoryJsonStore<SavedGame>();
    const { engine, loop, saves } = newGame(store);
    for (const move of SCOTCH) engine.move(move);
    loop.start({ white: 'human', black: 'human' });
    expect(saves.read()?.moves).toHaveLength(6);

    loop.undo();
    expect(saves.read()?.moves).toHaveLength(5);
  });

  it('records a resignation, which no move list would show', () => {
    const store = new MemoryJsonStore<SavedGame>();
    const { loop, saves } = newGame(store);
    loop.start({ white: 'human', black: 'human' });
    loop.resign('black');
    expect(saves.read()?.resignedBy).toBe('black');
  });

  it('resumes into a cold game with the same position and history', () => {
    const store = new MemoryJsonStore<SavedGame>();
    const first = newGame(store);
    for (const move of SCOTCH) first.engine.move(move);
    first.loop.start({ white: 'human', black: 'human' });
    const fen = first.engine.fen;

    // A fresh process: nothing but the store survives.
    const second = newGame(store);
    const resumed = second.saves.resume(second.loop);

    expect(resumed).not.toBeNull();
    expect(second.engine.fen).toBe(fen);
    expect(second.engine.history.map((m) => m.san)).toEqual(first.engine.history.map((m) => m.san));
    expect(resumed?.area).toEqual(RIEVAULX);
  });

  it('survives the fresh board the app starts before the menu opens', () => {
    // The bug this pins down: bootstrap reads the save, then calls start() on a
    // cold board, and that start published an empty history straight over the
    // save. The menu went on offering the twelve moves it had already read
    // while the store held nothing, so Resume restored an empty game.
    const store = new MemoryJsonStore<SavedGame>();
    const first = newGame(store);
    for (const move of SCOTCH) first.engine.move(move);
    first.loop.start({ white: 'human', black: 'human' });
    const fen = first.engine.fen;
    expect(store.read()?.moves).toHaveLength(SCOTCH.length);

    // A fresh process, doing what the composition root does in this order.
    const second = newGame(store);
    const offered = second.saves.read();
    second.loop.start({ white: 'human', black: 'human' });

    expect(offered?.moves).toHaveLength(SCOTCH.length);
    expect(store.read()?.moves).toHaveLength(SCOTCH.length);

    // …and only now does the player press Resume.
    expect(second.saves.resume(second.loop)).not.toBeNull();
    expect(second.engine.fen).toBe(fen);
  });

  it('does not create a save for a game nobody has moved in', () => {
    const store = new MemoryJsonStore<SavedGame>();
    const { loop, saves } = newGame(store);
    loop.start({ white: 'human', black: 'human' });
    expect(store.read()).toBeNull();
    expect(saves.hasSave()).toBe(false);
  });

  it('has nothing to resume when the store is empty', () => {
    const { loop, saves } = newGame(new MemoryJsonStore<SavedGame>());
    expect(saves.hasSave()).toBe(false);
    expect(saves.resume(loop)).toBeNull();
  });
});

describe('ThemeTracker through a take-back', () => {
  it('puts a captured piece’s story back on its square', () => {
    const store = new MemoryJsonStore<SavedGame>();
    const { bus, loop } = newGame(store);
    const tracker = new ThemeTracker(bus);
    tracker.setTheme(theme);
    // Restored rather than clicked, so the tracker sees each move as it lands.
    loop.restore({ moves: SCOTCH, players: { white: 'human', black: 'human' }, resignedBy: null });

    // 5... exd4 took the pawn that came from d2.
    expect(tracker.describe('d4').piece?.homeSquare).toBe('e7');

    loop.undo();
    expect(tracker.describe('d4').piece?.homeSquare).toBe('d2');
    expect(tracker.describe('e5').piece?.homeSquare).toBe('e7');
  });

  it('re-seats every identity when a new game starts', () => {
    const store = new MemoryJsonStore<SavedGame>();
    const { bus, loop } = newGame(store);
    const tracker = new ThemeTracker(bus);
    tracker.setTheme(theme);
    loop.restore({ moves: SCOTCH, players: { white: 'human', black: 'human' }, resignedBy: null });

    loop.newGame({ white: 'human', black: 'human' });
    expect(tracker.describe('e2').piece?.homeSquare).toBe('e2');
    expect(tracker.describe('d4').piece).toBeNull();
  });

  it('names the king of each colour for the result screen', () => {
    const store = new MemoryJsonStore<SavedGame>();
    const { bus, loop } = newGame(store);
    const tracker = new ThemeTracker(bus);
    tracker.setTheme(theme);
    loop.start({ white: 'human', black: 'human' });

    expect(tracker.king('white')?.homeSquare).toBe('e1');
    expect(tracker.king('black')?.homeSquare).toBe('e8');
  });
});
