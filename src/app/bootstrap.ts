// WHAT: The composition root — builds every service and wires them together.
// HOW:  Picks the IBoardLayout implementation, creates the stage from its
//       bounds, builds the board and piece views, spins up the Stockfish
//       worker, and connects pointer clicks → BoardPicker → GameLoop. Returns
//       a handle so main.ts can tear it all down on hot reload.
// WHY:  This is the one place where "which layout", "which piece factory",
//       "which engine" and "which opponent" are decided. Phase 8 swaps
//       FlatBoardLayout for WarpedBoardLayout on the line marked below.

import { StockfishAI } from '@ai/StockfishAI';
import { FlatBoardLayout } from '@domain/board/FlatBoardLayout';
import type { IBoardLayout } from '@domain/board/IBoardLayout';
import { ChessEngine } from '@domain/chess/ChessEngine';
import type { GameEvents } from '@game/GameEvents';
import { GameLoop } from '@game/GameLoop';
import type { Players } from '@game/GameLoop';
import { EventBus } from '@shared/events/EventBus';
import { FpsMeter } from '@ui/FpsMeter';
import { OpponentPanel } from '@ui/OpponentPanel';
import type { NewGameRequest } from '@ui/OpponentPanel';
import { PromotionPrompt } from '@ui/PromotionPrompt';
import { StatusBar } from '@ui/StatusBar';
import { CellBuilder } from '@world/builders/CellBuilder';
import { BoardView } from '@world/pieces/BoardView';
import { HighlightLayer } from '@world/pieces/HighlightLayer';
import { MoveAnimator } from '@world/pieces/MoveAnimator';
import { PieceLayer } from '@world/pieces/PieceLayer';
import { ProceduralPieceFactory } from '@world/pieces/ProceduralPieceFactory';
import { BoardPicker } from '@world/scene/BoardPicker';
import { PointerInput } from '@world/scene/PointerInput';
import { WorldStage } from '@world/scene/WorldStage';

import type { AppConfig } from './config';

export interface AppHandle {
  readonly layout: IBoardLayout;
  readonly stage: WorldStage;
  dispose(): void;
}

export function bootstrap(
  config: AppConfig,
  worldContainer: HTMLElement,
  uiContainer: HTMLElement,
): AppHandle {
  // Phase 8: replace with WarpedBoardLayout. This is the only line that changes.
  const layout: IBoardLayout = new FlatBoardLayout({ boardSizeMeters: config.boardSizeMeters });
  const boardWidth = layout.bounds.maxX - layout.bounds.minX;
  const cellUnit = boardWidth / config.filesAndRanks;

  // --- world ---
  const stage = new WorldStage(worldContainer, layout.bounds);
  const cells = new CellBuilder({ skirtDepthMeters: boardWidth * 0.02 }).build(layout);
  stage.add(cells);

  const pieceFactory = new ProceduralPieceFactory(cellUnit);
  const pieces = new PieceLayer(layout, pieceFactory);
  const highlights = new HighlightLayer(layout);
  const animator = new MoveAnimator({ unit: cellUnit });
  const view = new BoardView(pieces, highlights, animator);
  stage.add(...view.objects);
  const stopAnimator = stage.loop.onTick((dt) => {
    animator.update(dt);
  });

  // --- game ---
  const bus = new EventBus<GameEvents>();
  const engine = new ChessEngine();
  const promotion = new PromotionPrompt(uiContainer);
  const ai = new StockfishAI({ workerUrl: config.engineUrl, difficulty: config.defaultDifficulty });
  ai.ready().catch((error: unknown) => {
    // GameLoop falls back to a legal move on every failed request; this just tells the player why.
    console.error(
      'Chess engine failed to start; the computer will play weak fallback moves.',
      error,
    );
  });
  const game = new GameLoop({ engine, view, promotion, bus, ai });

  // --- ui ---
  const statusBar = new StatusBar(uiContainer, bus);
  const initialSeating: NewGameRequest = {
    humanColor: config.defaultHumanColor,
    difficulty: config.defaultDifficulty,
  };
  const panel = new OpponentPanel(uiContainer, initialSeating, (request) => {
    ai.setDifficulty(request.difficulty);
    game.newGame(toPlayers(request.humanColor));
  });
  const fps = new URLSearchParams(window.location.search).has('debug')
    ? new FpsMeter(uiContainer)
    : null;
  const stopFps =
    fps === null
      ? () => undefined
      : stage.loop.onTick((dt) => {
          fps.tick(dt);
        });

  // --- input ---
  const picker = new BoardPicker(stage.camera, layout, cells, pieces);
  const input = new PointerInput(stage.renderer.domElement);
  input.onClick((ndc) => {
    const square = picker.pick(ndc);
    if (square !== null) void game.handleSquareClick(square);
  });

  game.start(toPlayers(initialSeating.humanColor));
  stage.start();

  return {
    layout,
    stage,
    dispose: () => {
      input.dispose();
      stopFps();
      fps?.dispose();
      panel.dispose();
      statusBar.dispose();
      ai.dispose();
      stopAnimator();
      highlights.dispose();
      pieceFactory.dispose();
      bus.clear();
      stage.dispose();
    },
  };
}

function toPlayers(humanColor: NewGameRequest['humanColor']): Players {
  switch (humanColor) {
    case 'white':
      return { white: 'human', black: 'ai' };
    case 'black':
      return { white: 'ai', black: 'human' };
    case 'both':
      return { white: 'human', black: 'human' };
    case 'none':
      return { white: 'ai', black: 'ai' };
  }
}
