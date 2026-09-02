// WHAT: Replaces the board and its landscape in the running scene.
// HOW:  Given a WorldModel: rebuilds cells (coloured by land cover, skirts down
//       to below the surrounding ground), the terrain margin, water and labels;
//       points PieceLayer / HighlightLayer / BoardPicker at the new layout;
//       rebuilds the debug overlay; reframes camera, controls and shadow rig.
//       Disposes what it replaces.
// WHY:  Phase 8's promise — "swapping the layout requires no change outside
//       app/" — only holds if the world can accept a new layout at runtime.
//       This is the one place that knows every object that depends on it.

import type { Group, Object3D } from 'three';

import type { IBoardLayout } from '@domain/board/IBoardLayout';

import { CellBuilder } from './CellBuilder';
import { DebugOverlayBuilder } from './DebugOverlayBuilder';
import type { DebugOverlayOptions } from './DebugOverlayBuilder';
import { LabelBuilder } from './LabelBuilder';
import { skirtDepthFor, TerrainBuilder } from './TerrainBuilder';
import { WaterBuilder } from './WaterBuilder';
import type { WorldModel } from './WorldModel';
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

/** Phase 1's grey board, used when there is no landscape to colour by. */
const PLAIN_TOPS = { light: 0x9d9d9d, dark: 0x4f4f4f } as const;

export class BoardScene {
  private objects: Object3D[] = [];
  private overlay: Group | null = null;
  private overlayOptions: DebugOverlayOptions = { labels: false, features: false };
  private current: WorldModel | null = null;

  public constructor(private readonly deps: BoardSceneDeps) {}

  public get layout(): IBoardLayout | null {
    return this.current?.layout ?? null;
  }

  public show(model: WorldModel): void {
    const { stage, pieces, highlights, picker } = this.deps;
    const { layout } = model;

    for (const o of this.objects) disposeObject(o);
    this.objects = [];

    const cover = model.cover;
    const cells = new CellBuilder({
      skirtDepthMeters: skirtDepthFor(model, layout.bounds),
      ...(cover === null
        ? { topColors: PLAIN_TOPS }
        : { coverOf: (square) => cover.get(square) ?? 'grass' }),
    }).build(layout);
    this.objects.push(cells);

    if (model.heights !== null && model.exaggeration !== null) {
      this.objects.push(new TerrainBuilder().build(model, model.heights));
    }
    if (model.features !== null) {
      this.objects.push(new WaterBuilder().build(model, model.features));
      this.objects.push(new LabelBuilder().build(layout, model.features));
    }
    stage.add(...this.objects);

    pieces.setLayout(layout);
    highlights.setLayout(layout);
    picker.setLayout(layout, cells);
    stage.reframe(layout.bounds);

    this.current = model;
    this.rebuildOverlay();
  }

  public setOverlay(options: DebugOverlayOptions): void {
    this.overlayOptions = options;
    this.rebuildOverlay();
  }

  public dispose(): void {
    for (const o of this.objects) disposeObject(o);
    this.objects = [];
    disposeObject(this.overlay);
    this.overlay = null;
  }

  private rebuildOverlay(): void {
    disposeObject(this.overlay);
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
}

function disposeObject(object: Object3D | null): void {
  if (object === null) return;
  object.removeFromParent();
  object.traverse((node) => {
    const maybe = node as {
      geometry?: { dispose(): void };
      material?: { dispose(): void; map?: { dispose(): void } | null } | { dispose(): void }[];
    };
    maybe.geometry?.dispose();
    if (Array.isArray(maybe.material)) {
      for (const m of maybe.material) m.dispose();
    } else if (maybe.material !== undefined) {
      maybe.material.map?.dispose();
      maybe.material.dispose();
    }
  });
}
