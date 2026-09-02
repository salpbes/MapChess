// WHAT: Decides what each cell is made of: grass, wood, scrub, water or sand.
// HOW:  For every cell, tests its centroid and four corners against the wood,
//       scrub and water polygons; a cover wins when it holds the centroid or a
//       majority of corners. Cells near sea level on a coastal board that
//       nothing else claims become sand. Everything else is grass.
// WHY:  Phase 9 colours the board by land cover so a valley reads as a valley.
//       Kept out of domain/ (it reads MapFeature) and out of world/ (it is a
//       decision, not a mesh). Phase 10 may reuse it for identity scoring.

import type { IBoardLayout } from '@domain/board/IBoardLayout';
import { pointInPolygon } from '@domain/board/polygon';
import type { Square } from '@domain/board/Square';
import type { BoardPoint } from '@domain/board/types';
import { sampleStats } from '@mapdata/model/HeightField';
import type { HeightField } from '@mapdata/model/HeightField';
import type { MapFeature } from '@mapdata/model/MapFeature';

export type CoverKind = 'grass' | 'wood' | 'scrub' | 'water' | 'sand';

export const COVER_KINDS: readonly CoverKind[] = ['grass', 'wood', 'scrub', 'water', 'sand'];

export type CellCover = ReadonlyMap<Square, CoverKind>;

/** Cells whose ground averages below this (real metres) on a coastal board are tidal sand. */
const SAND_MAX_METERS = 1.5;

export function classifyCellCover(
  layout: IBoardLayout,
  features: readonly MapFeature[],
  heights: HeightField | null,
): CellCover {
  const polygonsOf = (kind: MapFeature['kind']): readonly (readonly BoardPoint[])[] =>
    features
      .filter((f) => f.kind === kind && f.geometry.type === 'polygon')
      .map((f) => (f.geometry.type === 'polygon' ? f.geometry.ring : []));
  const water = polygonsOf('water');
  const wood = polygonsOf('wood');
  const scrub = polygonsOf('scrub');
  const coastal = features.some((f) => f.kind === 'coastline');

  const out = new Map<Square, CoverKind>();
  for (const cell of layout.cells) {
    const probes = [cell.centroid, ...cell.polygon];
    const score = (polys: readonly (readonly BoardPoint[])[]): number =>
      probes.reduce(
        (n, p, i) => n + (polys.some((poly) => pointInPolygon(poly, p)) ? (i === 0 ? 3 : 1) : 0),
        0,
      );

    // Centroid counts 3, corners 1 each: centroid alone or three corners wins.
    const w = score(water);
    const f = score(wood);
    const s = score(scrub);
    let cover: CoverKind = 'grass';
    if (w >= 3) cover = 'water';
    else if (f >= 3 && f >= s) cover = 'wood';
    else if (s >= 3) cover = 'scrub';
    else if (
      coastal &&
      heights !== null &&
      sampleStats(heights, cell.polygon).mean < SAND_MAX_METERS
    )
      cover = 'sand';
    out.set(cell.square, cover);
  }
  return out;
}
