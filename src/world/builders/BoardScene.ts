// WHAT: Replaces the board and its landscape in the running scene.
// HOW:  Given a WorldModel: rebuilds cells (coloured by land cover, skirts down
//       to below the surrounding ground), the terrain margin, water and labels;
//       points PieceLayer / HighlightLayer / BoardPicker at the new layout;
//       rebuilds the debug overlay; reframes camera, controls and shadow rig.
//       Disposes what it replaces.
// WHY:  Phase 8's promise — "swapping the layout requires no change outside
//       app/" — only holds if the world can accept a new layout at runtime.
//       This is the one place that knows every object that depends on it.

import { InstancedMesh } from 'three';
import type { Group, Object3D } from 'three';

import type { IBoardLayout } from '@domain/board/IBoardLayout';
import type { Square } from '@domain/board/Square';
import { sampleHeight } from '@mapdata/model/HeightField';

import { CellBuilder } from './CellBuilder';
import { DebugOverlayBuilder } from './DebugOverlayBuilder';
import type { DebugOverlayOptions } from './DebugOverlayBuilder';
import { CoordinateLabels } from './CoordinateBuilder';
import { LabelBuilder } from './LabelBuilder';
import { buildTrees, treeSpots } from './TreeBuilder';
import type { LabelMode } from './LabelBuilder';
import { skirtDepthFor, TerrainBuilder } from './TerrainBuilder';
import { WaterBuilder } from './WaterBuilder';
import type { WorldModel } from './WorldModel';
import { heightToY } from './WorldModel';
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
  private labels: Group | null = null;
  private labelMode: LabelMode = 'names';
  private hovered: Square | null = null;
  private selected: Square | null = null;
  /** The coordinates round the edge, rebuilt with each board. */
  private coordinates: CoordinateLabels | null = null;
  private coordinatesOn = true;
  private coordinateScale = 1;
  private trees: Group | null = null;
  private sceneryOn = true;
  /** Most trees on one board; set lower on a phone. */
  private treeCap = 2500;
  private overlay: Group | null = null;
  private overlayOptions: DebugOverlayOptions = { labels: false, features: false };
  private current: WorldModel | null = null;

  public constructor(private readonly deps: BoardSceneDeps) {}

  public get layout(): IBoardLayout | null {
    return this.current?.layout ?? null;
  }

  /** Full names, markers alone, or nothing. Remembered across board rebuilds. */
  public setLabelMode(mode: LabelMode): void {
    this.labelMode = mode;
    this.applyLabelMode();
  }

  /**
   * The square the pointer is over. In markers-only mode the name for that one
   * place is revealed, so the board stays clear but any marker can be read
   * without changing the setting.
   */
  public setHoveredSquare(square: Square | null): void {
    if (square === this.hovered) return;
    this.hovered = square;
    this.applyLabelMode();
    this.lightCoordinates();
  }

  /** The selected square: its letter and number stay lit while nothing is hovered. */
  public setSelectedSquare(square: Square | null): void {
    this.selected = square;
    this.lightCoordinates();
  }

  public setCoordinatesVisible(on: boolean): void {
    this.coordinatesOn = on;
    if (this.coordinates !== null) this.coordinates.group.visible = on;
  }

  public setSceneryVisible(on: boolean): void {
    this.sceneryOn = on;
    if (this.trees !== null) this.trees.visible = on;
  }

  /** Applies from the next board; trees are planted when a board is built. */
  public setTreeCap(cap: number): void {
    this.treeCap = cap;
  }

  /** How many trees the current board grew, for tests. */
  public get treeCount(): number {
    let n = 0;
    this.trees?.traverse((node) => {
      if (node instanceof InstancedMesh && node.name.startsWith('trees-')) n += node.count;
    });
    return n;
  }

  public setCoordinateScale(scale: number): void {
    this.coordinateScale = scale;
    this.coordinates?.setScale(scale);
  }

  /** The coordinates lit right now, for tests. */
  public get litCoordinates(): readonly string[] {
    return this.coordinates?.litCoordinates ?? [];
  }

  private lightCoordinates(): void {
    // Hover wins while it lasts: it is where the player is looking now.
    this.coordinates?.light(this.hovered ?? this.selected);
  }

  private applyLabelMode(): void {
    const labels = this.labels;
    if (labels === null) return;
    labels.visible = this.labelMode !== 'off';

    for (const child of labels.children) {
      if (child.name === 'labels-markers') {
        child.visible = this.labelMode === 'markers';
        // The revealed name starts with the same glyph, so showing both would
        // draw the marker twice.
        for (const marker of child.children) {
          marker.visible = marker.userData.square !== this.hovered;
        }
        continue;
      }
      if (child.name !== 'labels-names') continue;

      child.visible = this.labelMode !== 'off';
      for (const name of child.children) {
        // In markers mode only the hovered name is drawn; in names mode, all.
        name.visible =
          this.labelMode === 'names' ||
          (this.labelMode === 'markers' && name.userData.square === this.hovered);
      }
    }
  }

  public show(model: WorldModel): void {
    const { stage, pieces, highlights, picker } = this.deps;
    const { layout } = model;

    for (const o of this.objects) disposeObject(o);
    this.objects = [];
    this.labels = null;
    this.trees = null;

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
    if (model.features !== null && model.heights !== null) {
      const heights = model.heights;
      const xEnd = heights.originX + (heights.cols - 1) * heights.stepMeters;
      const zEnd = heights.originZ + (heights.rows - 1) * heights.stepMeters;
      this.trees = buildTrees(
        treeSpots({
          features: model.features,
          cells: layout.cells,
          bounds: layout.bounds,
          // Only where the landscape is drawn: a tree past its edge would stand on nothing.
          groundAt: (x, z) =>
            x < heights.originX || x > xEnd || z < heights.originZ || z > zEnd
              ? null
              : heightToY(model, sampleHeight(heights, x, z)),
          bare: (cell) => cover?.get(cell.square) === 'water',
          cap: this.treeCap,
        }),
      );
      this.trees.visible = this.sceneryOn;
      this.objects.push(this.trees);
    }
    if (model.features !== null) {
      this.objects.push(new WaterBuilder().build(model, model.features));
      this.labels = new LabelBuilder().build(layout, model.features);
      this.applyLabelMode();
      this.objects.push(this.labels);
    }
    stage.add(...this.objects);

    // On every board, flat or warped: a square's name does not wait for terrain.
    this.coordinates?.dispose();
    this.coordinates = new CoordinateLabels(layout);
    this.coordinates.group.visible = this.coordinatesOn;
    this.coordinates.setScale(this.coordinateScale);
    this.lightCoordinates();
    stage.add(this.coordinates.group);

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
    this.coordinates?.dispose();
    this.coordinates = null;
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
