// WHAT: Replaces the board in the running scene with a new IBoardLayout.
// HOW:  Rebuilds the cell meshes, points PieceLayer / HighlightLayer /
//       BoardPicker at the new layout, rebuilds the debug overlay, and
//       reframes camera, controls and shadow rig from the new bounds. Disposes
//       what it replaces.
// WHY:  Phase 8's promise — "swapping FlatBoardLayout for WarpedBoardLayout
//       requires no change outside app/" — only holds if the world can accept
//       a new layout at runtime. This is the one place that knows every object
//       that depends on the layout.

import type { Group, Object3D } from 'three';

import type { IBoardLayout } from '@domain/board/IBoardLayout';
import type { TerrainInputs } from '@domain/board/TerrainInputs';

import { CellBuilder } from '../builders/CellBuilder';
import { DebugOverlayBuilder } from '../builders/DebugOverlayBuilder';
import type { DebugOverlayOptions } from '../builders/DebugOverlayBuilder';
import type { HighlightLayer } from '../pieces/HighlightLayer';
import type { PieceLayer } from '../pieces/PieceLayer';
import type { BoardPicker } from '../scene/BoardPicker';
import type { WorldStage } from '../scene/WorldStage';

export interface BoardSceneDeps {
  readonly stage: WorldStage;
  readonly pieces: PieceLayer;
  readonly highlights: HighlightLayer;
  readonly picker: BoardPicker;
}

export class BoardScene {
  private cells: Group | null = null;
  private overlay: Group | null = null;
  private overlayOptions: DebugOverlayOptions = { labels: false, features: false };
  private current: { layout: IBoardLayout; terrain: TerrainInputs | null } | null = null;

  public constructor(private readonly deps: BoardSceneDeps) {}

  public get layout(): IBoardLayout | null {
    return this.current?.layout ?? null;
  }

  public show(layout: IBoardLayout, terrain: TerrainInputs | null): void {
    const { stage, pieces, highlights, picker } = this.deps;
    const boardWidth = layout.bounds.maxX - layout.bounds.minX;

    this.disposeObject(this.cells);
    this.cells = new CellBuilder({ skirtDepthMeters: boardWidth * 0.02 }).build(layout);
    stage.add(this.cells);

    pieces.setLayout(layout);
    highlights.setLayout(layout);
    picker.setLayout(layout, this.cells);
    stage.reframe(layout.bounds);

    this.current = { layout, terrain };
    this.rebuildOverlay();
  }

  public setOverlay(options: DebugOverlayOptions): void {
    this.overlayOptions = options;
    this.rebuildOverlay();
  }

  public dispose(): void {
    this.disposeObject(this.cells);
    this.disposeObject(this.overlay);
  }

  private rebuildOverlay(): void {
    this.disposeObject(this.overlay);
    this.overlay = null;
    if (this.current === null) return;
    if (!this.overlayOptions.labels && !this.overlayOptions.features) return;
    this.overlay = new DebugOverlayBuilder().build(
      this.current.layout,
      this.current.terrain,
      this.overlayOptions,
    );
    this.deps.stage.add(this.overlay);
  }

  private disposeObject(object: Object3D | null): void {
    if (object === null) return;
    object.removeFromParent();
    object.traverse((node) => {
      const maybe = node as {
        geometry?: { dispose(): void };
        material?: { dispose(): void } | { dispose(): void }[];
      };
      maybe.geometry?.dispose();
      if (Array.isArray(maybe.material)) for (const m of maybe.material) m.dispose();
      else maybe.material?.dispose();
    });
  }
}
