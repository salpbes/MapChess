// WHAT: IFeatureProvider that serves the three shipped fixture areas offline
//       and delegates everything else to a real provider.
// HOW:  Fixtures are raw Overpass responses (code-split JSON). On a matching
//       area they are parsed and normalised with the same functions the
//       network path uses, so the fixture exercises the real pipeline.
// WHY:  BUILD_PLAN §8 — "cache aggressively, develop against fixtures".
//       Overpass was unavailable for two minutes while these fixtures were
//       being generated; that is the normal case, not the exception.

import { sameArea } from '@mapdata/elevation/heightFieldFixture';
import type { MapArea } from '@mapdata/model/MapArea';
import { FIXTURE_AREAS } from '@mapdata/model/fixtureAreas';
import type { FixtureAreaDef } from '@mapdata/model/fixtureAreas';

import type { FeatureRequestOptions, FeatureResult, IFeatureProvider } from './IFeatureProvider';
import { normalizeFeatures, parseOverpassResponse } from './normalizeOverpass';

export interface FeatureFixtureEntry extends FixtureAreaDef {
  readonly load: () => Promise<unknown>;
}

const loaders: Readonly<Record<string, () => Promise<unknown>>> = {
  lindisfarne: async () => (await import('./fixtures/lindisfarne.json')).default,
  rievaulx: async () => (await import('./fixtures/rievaulx.json')).default,
  glencoe: async () => (await import('./fixtures/glencoe.json')).default,
};

export function featureFixtureEntries(): readonly FeatureFixtureEntry[] {
  return FIXTURE_AREAS.map((def) => {
    const load = loaders[def.name];
    if (load === undefined) throw new Error(`No feature fixture registered for "${def.name}".`);
    return { ...def, load };
  });
}

export class FixtureFeatureProvider implements IFeatureProvider {
  public constructor(
    private readonly fixtures: readonly FeatureFixtureEntry[],
    private readonly fallback: IFeatureProvider,
  ) {}

  public async getFeatures(area: MapArea, options?: FeatureRequestOptions): Promise<FeatureResult> {
    const match = this.fixtures.find((f) => sameArea(f.area, area.selection));
    if (match === undefined) return this.fallback.getFeatures(area, options);

    const started = performance.now();
    const raw = await match.load();
    const features = normalizeFeatures(parseOverpassResponse(raw), area.projection);
    return { features, source: 'fixture', elapsedMs: performance.now() - started };
  }
}
