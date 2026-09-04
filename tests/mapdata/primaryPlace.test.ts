// WHAT: Tests for the name a board is called by.
// HOW:  Hand-built features, plus a run over each of the three offline fixture
//       areas to check the answer is a real place a player would recognise.
// WHY:  This name is what the menu shows instead of coordinates, so getting it
//       wrong means the player is told they are fighting somewhere they are
//       not. The ranking also has to be stable: the same board must not rename
//       itself between visits because two features tied.

import { describe, expect, it } from 'vitest';

import { featureFixtureEntries } from '@mapdata/features/FixtureFeatureProvider';
import { normalizeFeatures, parseOverpassResponse } from '@mapdata/features/normalizeOverpass';
import { primaryPlaceName } from '@mapdata/features/primaryPlace';
import { FIXTURE_AREAS } from '@mapdata/model/fixtureAreas';
import { describeArea } from '@mapdata/model/MapArea';
import type { FeatureKind, MapFeature } from '@mapdata/model/MapFeature';

function place(name: string, subtype: string, kind: FeatureKind = 'place'): MapFeature {
  return {
    id: `${kind}/${name}`,
    kind,
    subtype,
    names: { name },
    elevationMeters: null,
    geometry: { type: 'point', point: { x: 0, z: 0 } },
  };
}

describe('primaryPlaceName', () => {
  it('prefers the largest settlement', () => {
    const features = [
      place('Little Farm', 'farm'),
      place('Great Town', 'town'),
      place('Middle Village', 'village'),
    ];
    expect(primaryPlaceName(features)).toBe('Great Town');
  });

  it('falls back to a historic site when there is no settlement', () => {
    expect(primaryPlaceName([place('The Old Abbey', 'abbey', 'historic')])).toBe('The Old Abbey');
  });

  it('will name a board after a peak rather than nothing', () => {
    expect(primaryPlaceName([place('Sharp Fell', 'peak', 'peak')])).toBe('Sharp Fell');
  });

  it('ignores rivers and woods, which are not where you are', () => {
    const features: MapFeature[] = [
      {
        id: 'way/1',
        kind: 'waterway',
        subtype: 'river',
        names: { name: 'River Rye' },
        elevationMeters: null,
        geometry: { type: 'line', points: [{ x: 0, z: 0 }] },
      },
      {
        id: 'way/2',
        kind: 'wood',
        subtype: null,
        names: { name: 'Abbot Hagg Wood' },
        elevationMeters: null,
        geometry: { type: 'polygon', ring: [{ x: 0, z: 0 }] },
      },
    ];
    expect(primaryPlaceName(features)).toBeNull();
  });

  it('returns null for an empty or nameless board', () => {
    expect(primaryPlaceName([])).toBeNull();
    expect(primaryPlaceName([{ ...place('x', 'village'), names: {} }])).toBeNull();
  });

  it('answers the same way every time when two places tie', () => {
    const tied = [place('Zed Village', 'village'), place('Alpha Village', 'village')];
    expect(primaryPlaceName(tied)).toBe('Alpha Village');
    expect(primaryPlaceName([...tied].reverse())).toBe('Alpha Village');
  });

  it('names each offline fixture area after somewhere real', async () => {
    for (const entry of featureFixtureEntries()) {
      const def = FIXTURE_AREAS.find((a) => a.name === entry.name);
      if (def === undefined) throw new Error(entry.name);
      const features = normalizeFeatures(
        parseOverpassResponse(await entry.load()),
        describeArea(def.area).projection,
      );
      const name = primaryPlaceName(features);
      expect(name, entry.name).not.toBeNull();
      expect((name ?? '').length, entry.name).toBeGreaterThan(2);
    }
    // Holy Island, Rievaulx and Achtriochtan, as of these fixtures.
  });
});
