// WHAT: IElevationProvider that serves the three shipped fixture areas
//       offline and delegates everything else to a real provider.
// HOW:  Fixture JSON files are code-split (dynamic import) so they cost
//       nothing until an area matches. Matching uses `sameArea`; a match
//       decodes the fixture and returns it with source 'fixture'.
// WHY:  BUILD_PLAN Phase 6 — development must never depend on the network,
//       and Phase 8's invariant tests run across exactly these three areas.
//       Wrapping the network provider means app/ wires one object either way.

import type { SelectedArea } from '@mapdata/model/SelectedArea';
import type { MapArea } from '@mapdata/model/MapArea';

import { fixtureToField, sameArea } from './heightFieldFixture';
import type { Base64Codec, HeightFieldFixture } from './heightFieldFixture';
import type {
  ElevationRequestOptions,
  ElevationResult,
  IElevationProvider,
} from './IElevationProvider';

export interface FixtureEntry {
  readonly name: string;
  readonly description: string;
  readonly area: SelectedArea;
  readonly load: () => Promise<HeightFieldFixture>;
}

export class FixtureElevationProvider implements IElevationProvider {
  public constructor(
    private readonly fixtures: readonly FixtureEntry[],
    private readonly fallback: IElevationProvider,
    private readonly b64: Base64Codec,
  ) {}

  public list(): readonly Pick<FixtureEntry, 'name' | 'description' | 'area'>[] {
    return this.fixtures.map(({ name, description, area }) => ({ name, description, area }));
  }

  public async getHeightField(
    area: MapArea,
    options?: ElevationRequestOptions,
  ): Promise<ElevationResult> {
    const match = this.fixtures.find((f) => sameArea(f.area, area.selection));
    if (match === undefined) return this.fallback.getHeightField(area, options);

    const fixture = await match.load();
    options?.onProgress?.(1, 1);
    return { field: fixtureToField(fixture, this.b64), source: 'fixture', tileCount: 0, zoom: 0 };
  }
}
