// WHAT: What the warped lattice needs to know about the terrain, in the
//       domain's own words.
// HOW:  Lines that should run along cell edges (rivers, coast), points that
//       should sit inside a cell (peaks, villages), and something that can
//       report heights inside a polygon. All positions in board metres.
// WHY:  domain/ may not import mapdata/. This is the translation target; an
//       adapter in mapdata/board/ fills it from MapFeature[] and HeightField.
//       It also means the lattice can be tested with hand-drawn rivers.

import type { BoardPoint } from './types';

export interface LineAttractor {
  readonly points: readonly BoardPoint[];
  /** 1 = a river or the coast; smaller values pull less. */
  readonly weight: number;
  readonly label?: string;
}

export interface PointAttractor {
  readonly point: BoardPoint;
  /** Higher wins when two points fall in the same cell. */
  readonly priority: number;
  readonly label?: string;
}

export interface HeightStats {
  readonly min: number;
  readonly mean: number;
  readonly max: number;
}

export interface IHeightSampler {
  stats(polygon: readonly BoardPoint[]): HeightStats;
}

export interface TerrainInputs {
  readonly boardSizeMeters: number;
  readonly lines: readonly LineAttractor[];
  readonly points: readonly PointAttractor[];
  readonly heights: IHeightSampler;
}

/** A sampler that reports flat ground everywhere; the warped layout with no terrain is a flat board. */
export const FLAT_HEIGHTS: IHeightSampler = {
  stats: () => ({ min: 0, mean: 0, max: 0 }),
};
