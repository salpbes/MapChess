// WHAT: Lazy loaders for the elevation fixture payloads.
// HOW:  The area list itself lives in mapdata/model/fixtureAreas.ts (shared
//       with features). The JSON payloads are imported dynamically so they are
//       code-split and only downloaded when an area matches.
// WHY:  One list, used by the generator, the provider and Phase 8's tests, so
//       the areas cannot drift apart between them.

import { FIXTURE_AREAS } from '@mapdata/model/fixtureAreas';

import type { FixtureEntry } from './FixtureElevationProvider';
import type { HeightFieldFixture } from './heightFieldFixture';

export { FIXTURE_AREAS } from '@mapdata/model/fixtureAreas';
export type { FixtureAreaDef } from '@mapdata/model/fixtureAreas';

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
