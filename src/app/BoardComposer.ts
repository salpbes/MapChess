// WHAT: Decides which IBoardLayout the game plays on and builds the WorldModel
//       the renderer draws, once the terrain for the selected area is ready.
// HOW:  Holds the latest HeightField and MapFeature[] for the current area.
//       When both are present, builds TerrainInputs → WarpedBoardLayout →
//       land cover → WorldModel and hands it to the callback; until then, or
//       if the mode is 'flat', hands over a plain FlatBoardLayout model. A
//       generation counter drops results from an area the player has left.
// WHY:  BUILD_PLAN §5 — the layout choice is app-level wiring. This is the
//       line that Phase 8 was always going to change, made explicit and
//       toggleable so flat vs warped can be compared on the same terrain.

import { FlatBoardLayout } from '@domain/board/FlatBoardLayout';
import { WarpedBoardLayout } from '@domain/board/WarpedBoardLayout';
import { buildTerrainInputs } from '@mapdata/board/buildTerrainInputs';
import { classifyCellCover } from '@mapdata/board/classifyCellCover';
import type { HeightField } from '@mapdata/model/HeightField';
import type { MapFeature } from '@mapdata/model/MapFeature';
import type { WorldModel } from '@world/builders/WorldModel';

export type BoardMode = 'flat' | 'warped';

export interface ComposedBoard {
  readonly model: WorldModel;
  readonly mode: BoardMode;
}

export class BoardComposer {
  private mode: BoardMode = 'warped';
  private heights: HeightField | null = null;
  private features: readonly MapFeature[] | null = null;
  private generation = 0;

  public constructor(
    private readonly boardSizeMeters: number,
    private readonly onBoard: (board: ComposedBoard) => void,
  ) {}

  /** Call when the player picks a new area: forgets the old terrain and shows the flat board meanwhile. */
  public beginArea(): number {
    this.generation += 1;
    this.heights = null;
    this.features = null;
    this.emitFlat();
    return this.generation;
  }

  public setHeights(generation: number, heights: HeightField): void {
    if (generation !== this.generation) return;
    this.heights = heights;
    this.tryCompose();
  }

  public setFeatures(generation: number, features: readonly MapFeature[]): void {
    if (generation !== this.generation) return;
    this.features = features;
    this.tryCompose();
  }

  public setMode(mode: BoardMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    if (mode === 'flat') this.emitFlat();
    else this.tryCompose();
  }

  public get currentMode(): BoardMode {
    return this.mode;
  }

  private tryCompose(): void {
    if (this.mode !== 'warped' || this.heights === null || this.features === null) return;
    const terrain = buildTerrainInputs(this.boardSizeMeters, this.heights, this.features);
    const layout = new WarpedBoardLayout(terrain);
    const cover = classifyCellCover(layout, this.features, this.heights);
    this.onBoard({
      mode: 'warped',
      model: {
        layout,
        terrain,
        heights: this.heights,
        features: this.features,
        cover,
        exaggeration: {
          scale: layout.terraceInfo.scale,
          baseMeters: layout.terraceInfo.baseMeters,
        },
      },
    });
  }

  private emitFlat(): void {
    this.onBoard({
      mode: 'flat',
      model: {
        layout: new FlatBoardLayout({ boardSizeMeters: this.boardSizeMeters }),
        terrain: null,
        heights: null,
        features: null,
        cover: null,
        exaggeration: null,
      },
    });
  }
}
