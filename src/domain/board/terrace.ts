// WHAT: Turns per-cell height statistics into level platform heights.
// HOW:  Rule from BUILD_PLAN §2: use the cell's mean height when it is fairly
//       flat, drop to its minimum when the spread inside it exceeds one piece
//       base height (a cut terrace reads right; a floating one does not).
//       Then vertical exaggeration: the whole board's relief is scaled so it
//       spans a target fraction of the board width — never more (mountains
//       would block the camera) and never less (flat coasts would vanish),
//       with a floor so a truly flat area still shows a whisper of relief.
// WHY:  Pure numbers in, pure numbers out; the same function serves the
//       layout, the tests and, later, the terrain mesh so they agree.

import type { HeightStats } from './TerrainInputs';

export interface TerraceParams {
  /** Total relief across the board as a fraction of board width. */
  readonly reliefFraction: number;
  /** Relief below this (metres, real) is treated as flat and stretched no further than `flatReliefFraction`. */
  readonly flatThresholdMeters: number;
  readonly flatReliefFraction: number;
  /** Spread inside one cell (real metres) above which the platform uses the minimum. */
  readonly pieceBaseHeightMeters: number;
}

export const DEFAULT_TERRACE_PARAMS: TerraceParams = {
  reliefFraction: 0.17,
  flatThresholdMeters: 25,
  flatReliefFraction: 0.05,
  pieceBaseHeightMeters: 12,
};

export interface TerraceResult {
  /** Platform height per cell, in board metres (already exaggerated), same order as input. */
  readonly platformY: readonly number[];
  /** Multiplier applied to real metres. */
  readonly scale: number;
  /** Real-metre value that maps to Y = 0 (the board's lowest platform). */
  readonly baseMeters: number;
  readonly realReliefMeters: number;
}

/** Real (unexaggerated) platform height for one cell. */
export function platformHeightMeters(stats: HeightStats, pieceBaseHeightMeters: number): number {
  return stats.max - stats.min > pieceBaseHeightMeters ? stats.min : stats.mean;
}

export function terrace(
  cellStats: readonly HeightStats[],
  boardSizeMeters: number,
  params: TerraceParams = DEFAULT_TERRACE_PARAMS,
): TerraceResult {
  const real = cellStats.map((s) => platformHeightMeters(s, params.pieceBaseHeightMeters));
  const lo = Math.min(...real);
  const hi = Math.max(...real);
  const realRelief = hi - lo;

  const targetFraction =
    realRelief < params.flatThresholdMeters
      ? // Stretch gently toward the flat cap, proportional to how much relief there is.
        params.flatReliefFraction * (realRelief / params.flatThresholdMeters)
      : params.reliefFraction;
  const targetRelief = boardSizeMeters * targetFraction;
  const scale = realRelief > 1e-6 ? targetRelief / realRelief : 0;

  return {
    platformY: real.map((h) => (h - lo) * scale),
    scale,
    baseMeters: lo,
    realReliefMeters: realRelief,
  };
}
