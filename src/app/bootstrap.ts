// WHAT: The composition root — builds every service and wires them together.
// HOW:  Picks the IBoardLayout implementation, creates the stage from its
//       bounds, builds the board and piece views, and connects pointer clicks
//       → BoardPicker → GameLoop. Returns a handle so main.ts can tear it all
//       down on hot reload.
// WHY:  This is the one place where "which layout", "which piece factory" and
//       "which engine" are decided. Phase 8 swaps FlatBoardLayout for
//       WarpedBoardLayout on the line marked below, and nothing else changes.

import { FlatBoardLayout } from '@domain/board/FlatBoardLayout';
import type { IBoardLayout } from '@domain/board/IBoardLayout';
import { ChessEngine } from '@domain/chess/ChessEngine';
import type { GameEvents } from '@game/GameEvents';
import { GameLoop } from '@game/GameLoop';
import { EventBus } from '@shared/events/EventBus';
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
  const game = new GameLoop({ engine, view, promotion, bus });

  // --- ui ---
  const statusBar = new StatusBar(uiContainer, bus);

  // --- input ---
  const picker = new BoardPicker(stage.camera, layout, cells, pieces);
  const input = new PointerInput(stage.renderer.domElement);
  input.onClick((ndc) => {
    const square = picker.pick(ndc);
    if (square !== null) void game.handleSquareClick(square);
  });

  game.start();
  stage.start();

  return {
    layout,
    stage,
    dispose: () => {
      input.dispose();
      statusBar.dispose();
      stopAnimator();
      highlights.dispose();
      pieceFactory.dispose();
      bus.clear();
      stage.dispose();
    },
  };
}
