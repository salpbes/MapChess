// WHAT: The list of places offered by name.
// WHY:  It is content, not logic, which is exactly why it is worth a test: a
//       typo in a latitude puts a battlefield in the sea and nothing else
//       notices. The blurb length matters too — the list is read on a phone,
//       and a line that wraps to four is what this replaced.

import { describe, expect, it } from 'vitest';

import { CURATED_PLACES } from '@app/curatedPlaces';
import { FIXTURE_AREAS } from '@mapdata/model/fixtureAreas';

describe('curated places', () => {
  it('offers enough to choose from without needing to scroll forever', () => {
    expect(CURATED_PLACES.length).toBeGreaterThanOrEqual(8);
    expect(CURATED_PLACES.length).toBeLessThanOrEqual(20);
  });

  it('gives every place a name and a reason to go there', () => {
    for (const place of CURATED_PLACES) {
      expect(place.name.trim(), place.name).not.toBe('');
      expect(place.blurb.trim(), place.name).not.toBe('');
      // One line on a phone. The rows were four lines deep before the list was
      // widened, and a blurb that long is the other half of that problem.
      expect(place.blurb.length, `${place.name}: "${place.blurb}"`).toBeLessThanOrEqual(60);
    }
  });

  it('puts every board somewhere real', () => {
    for (const { name, area } of CURATED_PLACES) {
      expect(Math.abs(area.centerLat), name).toBeLessThanOrEqual(90);
      expect(Math.abs(area.centerLon), name).toBeLessThanOrEqual(180);
      // Nobody meant to play at Null Island.
      expect(Math.abs(area.centerLat) + Math.abs(area.centerLon), name).toBeGreaterThan(0.5);
      expect(area.sizeMeters, name).toBeGreaterThan(0);
    }
  });

  it('names each place once', () => {
    const names = CURATED_PLACES.map((p) => p.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  it('takes the offline areas from the fixture data rather than copying them', () => {
    const offline = CURATED_PLACES.filter((p) => p.offline === true);
    expect(offline).toHaveLength(FIXTURE_AREAS.length);
    for (const place of offline) {
      const def = FIXTURE_AREAS.find((f) => f.name === place.name);
      expect(def, place.name).toBeDefined();
      // Identity, not equality: a copied coordinate is one that can drift.
      expect(place.area).toBe(def?.area);
    }
  });
});
