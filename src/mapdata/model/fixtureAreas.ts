// WHAT: The three offline fixture areas shared by elevation and features.
// HOW:  Plain data. Elevation and feature fixture generators, providers and
//       Phase 8's invariant tests all read this one list.
// WHY:  If the two fixture sets were keyed by separate lists they would drift;
//       a board that has heights for one area and rivers for another is worse
//       than no fixture at all.

import type { SelectedArea } from './SelectedArea';

export interface FixtureAreaDef {
  readonly name: string;
  readonly description: string;
  readonly area: SelectedArea;
}

/** Flat coastal · river valley · hilly — BUILD_PLAN Phase 6. All 2 km, rotation 0. */
export const FIXTURE_AREAS: readonly FixtureAreaDef[] = [
  {
    name: 'lindisfarne',
    description: 'Holy Island of Lindisfarne — flat coastal, tidal flats, very little relief',
    area: { centerLat: 55.6785, centerLon: -1.7937, sizeMeters: 2000, rotationDeg: 0 },
  },
  {
    name: 'rievaulx',
    description: 'Rievaulx, North Yorkshire — the River Rye valley below the abbey',
    area: { centerLat: 54.2573, centerLon: -1.1167, sizeMeters: 2000, rotationDeg: 0 },
  },
  {
    name: 'glencoe',
    description: 'Glen Coe, Highlands — steep hillsides either side of the glen',
    area: { centerLat: 56.6667, centerLon: -5.0, sizeMeters: 2000, rotationDeg: 0 },
  },
];
