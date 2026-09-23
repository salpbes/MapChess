// WHAT: The list of places offered by name.
// WHY:  It is content, not logic, which is exactly why it is worth a test: a
//       typo in a latitude puts a battlefield in the sea and nothing else
//       notices. The blurb length matters too — the list is read on a phone,
//       and a line that wraps to four is what this replaced.

import { describe, expect, it } from 'vitest';

import {
  CURATED_PLACES,
  ERA_ORDER,
  curatedByEra,
  curatedPlaceAt,
  isBattlefield,
  namedBriefing,
} from '@app/curatedPlaces';
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
      const def = FIXTURE_AREAS.find((f) => f.name === place.name.toLowerCase());
      expect(def, place.name).toBeDefined();
      // Identity, not equality: a copied coordinate is one that can drift.
      expect(place.area).toBe(def?.area);
    }
  });

  it('files every place under an era, and every era it shows has something in it', () => {
    for (const place of CURATED_PLACES) expect(ERA_ORDER, place.name).toContain(place.era);
    const groups = curatedByEra();
    expect(groups.map((g) => g.places.length).every((n) => n > 0)).toBe(true);
    // Every place appears exactly once across the sections.
    expect(groups.flatMap((g) => g.places)).toHaveLength(CURATED_PLACES.length);
    // In the order the list promises, the quiet places last.
    expect(groups.map((g) => g.era)).toEqual(
      ERA_ORDER.filter((e) => groups.some((g) => g.era === e)),
    );
    expect(groups[groups.length - 1]?.era).toBe('offline');
  });

  it('keeps the offline places out of the battlefields', () => {
    for (const place of CURATED_PLACES) {
      expect(isBattlefield(place), place.name).toBe(place.offline !== true);
    }
  });

  it('recognises a chosen place from its area, and only the exact area', () => {
    const cassino = CURATED_PLACES.find((p) => p.name === 'Monte Cassino');
    expect(cassino).toBeDefined();
    if (cassino === undefined) return;
    expect(curatedPlaceAt(cassino.area)).toBe(cassino);
    // A copy is still the place: it is the ground that matters, not the object.
    expect(curatedPlaceAt({ ...cassino.area })).toBe(cassino);
    // Fifty metres off the mountain is somewhere of the player's own choosing.
    expect(
      curatedPlaceAt({ ...cassino.area, centerLat: cassino.area.centerLat + 0.0005 }),
    ).toBeNull();
    expect(curatedPlaceAt({ ...cassino.area, rotationDeg: 90 })).toBeNull();
  });

  it("heads a battlefield with its battle, and keeps the map's own name", () => {
    const cassino = CURATED_PLACES.find((p) => p.name === 'Monte Cassino');
    if (cassino === undefined) throw new Error('Monte Cassino missing');
    const briefing = {
      title: 'The field of San Silvestro',
      lines: [{ label: 'Ground', text: 'a mountainside' }],
      remark: 'Steep.',
    };
    const named = namedBriefing(briefing, cassino, 'San Silvestro');
    expect(named.title).toBe('Monte Cassino');
    expect(named.lines[0]).toEqual({ label: 'History', text: cassino.blurb });
    expect(named.lines[1]).toEqual({ label: 'Field', text: 'San Silvestro' });
    // Nothing the ground says about itself is lost.
    expect(named.lines.slice(2)).toEqual(briefing.lines);
    expect(named.remark).toBe(briefing.remark);
    // No "Field" line when the map has no name, or the same one.
    expect(namedBriefing(briefing, cassino, null).lines[1]).toEqual(briefing.lines[0]);
  });
});
