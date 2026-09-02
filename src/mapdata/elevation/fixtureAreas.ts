// WHAT: The three offline fixture areas and how to load their data.
// HOW:  Area definitions live here (they are also the input to
//       scripts/make-fixtures.ts); the JSON payloads are imported lazily so
//       they are code-split and only downloaded when an area matches.
// WHY:  One list, used by the generator, the provider and Phase 8's tests, so
//       the areas cannot drift apart between them.

import type { SelectedArea } from '@mapdata/model/SelectedArea';

import type { FixtureEntry } from './FixtureElevationProvider';
import type { HeightFieldFixture } from './heightFieldFixture';

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

const loaders: Readonly<Record<string, () => Promise<HeightFieldFixture>>> = {
  lindisfarne: async () =>
    (await import('./fixtures/lindisfarne.json')).default as unknown as HeightFieldFixture,
  rievaulx: async () =>
    (await import('./fixtures/rievaulx.json')).default as unknown as HeightFieldFixture,
  glencoe: async () =>
    (await import('./fixtures/glencoe.json')).default as unknown as HeightFieldFixture,
};

export function fixtureEntries(): readonly FixtureEntry[] {
  return FIXTURE_AREAS.map((def) => {
    const load = loaders[def.name];
    if (load === undefined) {
      throw new Error(`No fixture loader registered for "${def.name}".`);
    }
    return { ...def, load };
  });
}
