// WHAT: Builds the theming layer's CellFacts from the WorldModel's ingredients.
// HOW:  For each cell: real height from the layout's exaggeration (or the
//       height field), land cover from CellCover, features inside the cell
//       (points by containment, lines by any vertex inside, polygons by
//       centroid-in-polygon or containing the centroid) at distance 0, plus
//       named features within a radius at their true distance. Coastal = the
//       board has a coastline and the cell is within one cell of it.
// WHY:  domain/theme cannot see MapFeature. This is where OSM's shapes become
//       the theme's facts, and where "which cell does this river belong to"
//       is decided once.

import type { IBoardLayout } from '@domain/board/IBoardLayout';
import { containsPoint, pointInPolygon } from '@domain/board/polygon';
import type { BoardPoint, Cell } from '@domain/board/types';
import type { CellFacts, ThemeFeature } from '@domain/theme/types';
import type { CellCover } from '@mapdata/board/classifyCellCover';
import type { MapFeature } from '@mapdata/model/MapFeature';

const NEARBY_RADIUS_METERS = 450;
const THEME_KINDS = new Set<string>([
  'peak',
  'saddle',
  'ridge',
  'ford',
  'place',
  'historic',
  'worship',
  'waterway',
  'water',
  'coastline',
  'wood',
  'scrub',
]);

export interface ThemeInputOptions {
  /** Board Y → real metres; identity when the board is flat. */
  readonly yToMeters: (y: number) => number;
}

export function buildCellFacts(
  layout: IBoardLayout,
  features: readonly MapFeature[],
  cover: CellCover,
  options: ThemeInputOptions,
): CellFacts[] {
  const relevant = features.filter((f) => THEME_KINDS.has(f.kind));
  const coastal = relevant.some((f) => f.kind === 'coastline');
  const coastPoints = relevant
    .filter((f) => f.kind === 'coastline')
    .flatMap((f) => (f.geometry.type === 'line' ? f.geometry.points : []));
  const cellWidth = (layout.bounds.maxX - layout.bounds.minX) / 8;

  return layout.cells.map((cell) => {
    const inside: ThemeFeature[] = [];
    const nearby: ThemeFeature[] = [];
    for (const f of relevant) {
      const d = distanceToCell(f, cell);
      if (d === 0) inside.push(toTheme(f, 0));
      else if (d <= NEARBY_RADIUS_METERS && hasName(f)) nearby.push(toTheme(f, d));
    }
    nearby.sort((a, b) => a.distanceMeters - b.distanceMeters);
    const nearCoast =
      coastal &&
      coastPoints.some((p) => Math.hypot(p.x - cell.centroid.x, p.z - cell.centroid.z) < cellWidth);
    return {
      square: cell.square,
      heightMeters: options.yToMeters(cell.platformY),
      cover: cover.get(cell.square) ?? 'grass',
      features: [...inside, ...nearby],
      coastal: nearCoast,
    };
  });
}

function hasName(f: MapFeature): boolean {
  return (
    f.names.name !== undefined ||
    f.names.oldName !== undefined ||
    f.names.historicName !== undefined
  );
}

function toTheme(f: MapFeature, distanceMeters: number): ThemeFeature {
  return {
    kind: f.kind,
    subtype: f.subtype,
    names: {
      ...(f.names.name === undefined ? {} : { name: f.names.name }),
      ...(f.names.oldName === undefined ? {} : { oldName: f.names.oldName }),
      ...(f.names.historicName === undefined ? {} : { historicName: f.names.historicName }),
      ...(f.names.altName === undefined ? {} : { altName: f.names.altName }),
    },
    distanceMeters,
    elevationMeters: f.elevationMeters,
  };
}

/** 0 if the feature touches the cell; otherwise the distance from the cell centroid to the feature's nearest vertex. */
function distanceToCell(f: MapFeature, cell: Cell): number {
  const g = f.geometry;
  if (g.type === 'point') {
    if (containsPoint(cell.polygon, g.point)) return 0;
    return dist(g.point, cell.centroid);
  }
  const pts = g.type === 'line' ? g.points : g.ring;
  if (g.type === 'polygon' && pointInPolygon(g.ring, cell.centroid)) return 0;
  let best = Number.POSITIVE_INFINITY;
  for (const p of pts) {
    if (containsPoint(cell.polygon, p)) return 0;
    const d = dist(p, cell.centroid);
    if (d < best) best = d;
  }
  return best;
}

function dist(a: BoardPoint, b: BoardPoint): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
