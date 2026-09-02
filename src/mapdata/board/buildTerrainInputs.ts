// WHAT: Builds the domain's TerrainInputs from a HeightField and MapFeature[].
// HOW:  Waterways and coastline become line attractors (rivers weight 1,
//       streams less, coast 1), clipped to the board plus a small margin so a
//       river 5 km away cannot tug a corner. Peaks and settlements become
//       point attractors with a priority order (peak > village > hamlet > …).
//       Heights are served by wrapping HeightField.sampleStats.
// WHY:  domain/board may not import mapdata/. This adapter is the one place
//       where "what OSM calls it" becomes "what the lattice should do about it".

import type {
  IHeightSampler,
  LineAttractor,
  PointAttractor,
  TerrainInputs,
} from '@domain/board/TerrainInputs';
import type { BoardPoint } from '@domain/board/types';
import { sampleStats } from '@mapdata/model/HeightField';
import type { HeightField } from '@mapdata/model/HeightField';
import type { MapFeature } from '@mapdata/model/MapFeature';

const LINE_WEIGHT: Readonly<Record<string, number>> = {
  river: 1,
  canal: 0.9,
  stream: 0.55,
  drain: 0.2,
  ditch: 0.15,
};

/** Higher wins the cell when several point features fall in it. */
const POINT_PRIORITY: Readonly<Record<string, number>> = {
  peak: 100,
  city: 95,
  town: 90,
  village: 80,
  saddle: 70,
  hamlet: 60,
  historic: 50,
  locality: 40,
  isolated_dwelling: 30,
  farm: 25,
  worship: 20,
};

const CLIP_MARGIN_METERS = 150;
const MIN_LINE_POINTS = 2;

export function buildTerrainInputs(
  boardSizeMeters: number,
  heights: HeightField,
  features: readonly MapFeature[],
): TerrainInputs {
  const half = boardSizeMeters / 2 + CLIP_MARGIN_METERS;
  const inside = (p: BoardPoint): boolean => Math.abs(p.x) <= half && Math.abs(p.z) <= half;

  const lines: LineAttractor[] = [];
  const points: PointAttractor[] = [];

  for (const f of features) {
    if (f.kind === 'waterway' || f.kind === 'coastline') {
      if (f.geometry.type !== 'line') continue;
      const weight = f.kind === 'coastline' ? 1 : (LINE_WEIGHT[f.subtype ?? ''] ?? 0.4);
      for (const piece of clipPolyline(f.geometry.points, inside)) {
        if (piece.length >= MIN_LINE_POINTS)
          lines.push({ points: piece, weight, label: f.names.name ?? f.id });
      }
      continue;
    }

    if (
      f.kind === 'peak' ||
      f.kind === 'saddle' ||
      f.kind === 'place' ||
      f.kind === 'historic' ||
      f.kind === 'worship'
    ) {
      if (f.geometry.type !== 'point' || !inside(f.geometry.point)) continue;
      const key = f.kind === 'place' ? (f.subtype ?? 'locality') : f.kind;
      const priority = POINT_PRIORITY[key];
      if (priority === undefined) continue;
      points.push({ point: f.geometry.point, priority, label: f.names.name ?? f.id });
    }
  }

  // Deterministic order regardless of Overpass element order.
  lines.sort((a, b) => b.weight - a.weight || (a.label ?? '').localeCompare(b.label ?? ''));
  points.sort((a, b) => b.priority - a.priority || (a.label ?? '').localeCompare(b.label ?? ''));

  const sampler: IHeightSampler = {
    stats: (polygon) => {
      const s = sampleStats(heights, polygon);
      return { min: s.min, mean: s.mean, max: s.max };
    },
  };

  return { boardSizeMeters, lines, points, heights: sampler };
}

/** Splits a polyline into the runs of consecutive points that pass `keep`. */
function clipPolyline(
  points: readonly BoardPoint[],
  keep: (p: BoardPoint) => boolean,
): BoardPoint[][] {
  const runs: BoardPoint[][] = [];
  let current: BoardPoint[] = [];
  for (const p of points) {
    if (keep(p)) {
      current.push(p);
    } else if (current.length > 0) {
      runs.push(current);
      current = [];
    }
  }
  if (current.length > 0) runs.push(current);
  return runs;
}
