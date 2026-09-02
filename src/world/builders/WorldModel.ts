// WHAT: Everything the world renderer needs to draw one board in its landscape.
// HOW:  A plain bundle assembled by app/BoardComposer: the layout, and — when
//       terrain is known — the height field, the features, the per-cell land
//       cover and the vertical exaggeration the layout used. Null members mean
//       "plain board, no landscape".
// WHY:  BoardScene takes one argument instead of five, and the flat and warped
//       cases are the same call with fewer fields filled in.

import type { IBoardLayout } from '@domain/board/IBoardLayout';
import type { TerrainInputs } from '@domain/board/TerrainInputs';
import type { CellCover } from '@mapdata/board/classifyCellCover';
import type { HeightField } from '@mapdata/model/HeightField';
import type { MapFeature } from '@mapdata/model/MapFeature';

export interface Exaggeration {
  /** Multiplier from real metres to board Y. */
  readonly scale: number;
  /** Real metres that map to Y = 0. */
  readonly baseMeters: number;
}

export interface WorldModel {
  readonly layout: IBoardLayout;
  readonly terrain: TerrainInputs | null;
  readonly heights: HeightField | null;
  readonly features: readonly MapFeature[] | null;
  readonly cover: CellCover | null;
  readonly exaggeration: Exaggeration | null;
}

/** Real metres → board Y under the model's exaggeration; identity-from-zero when there is none. */
export function heightToY(model: WorldModel, meters: number): number {
  const e = model.exaggeration;
  return e === null ? 0 : (meters - e.baseMeters) * e.scale;
}
