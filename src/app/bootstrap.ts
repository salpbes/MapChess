// WHAT: The composition root — builds every service and wires them together.
// HOW:  Picks the IBoardLayout implementation, creates the stage from its
//       bounds, asks the builders for meshes, starts rendering. Returns a
//       handle so main.ts can tear it all down on hot reload.
// WHY:  This is the one place where "which layout" is decided. Phase 8 swaps
//       FlatBoardLayout for WarpedBoardLayout on the line marked below, and
//       nothing else in the codebase changes.

import { FlatBoardLayout } from '@domain/board/FlatBoardLayout';
import type { IBoardLayout } from '@domain/board/IBoardLayout';
import { CellBuilder } from '@world/builders/CellBuilder';
import { WorldStage } from '@world/scene/WorldStage';

import type { AppConfig } from './config';

export interface AppHandle {
  readonly layout: IBoardLayout;
  readonly stage: WorldStage;
  dispose(): void;
}

export function bootstrap(config: AppConfig, worldContainer: HTMLElement): AppHandle {
  // Phase 8: replace with WarpedBoardLayout. This is the only line that changes.
  const layout: IBoardLayout = new FlatBoardLayout({ boardSizeMeters: config.boardSizeMeters });

  const stage = new WorldStage(worldContainer, layout.bounds);

  const boardWidth = layout.bounds.maxX - layout.bounds.minX;
  const cells = new CellBuilder({ skirtDepthMeters: boardWidth * 0.02 }).build(layout);
  stage.add(cells);

  stage.start();

  return {
    layout,
    stage,
    dispose: () => {
      stage.dispose();
    },
  };
}
