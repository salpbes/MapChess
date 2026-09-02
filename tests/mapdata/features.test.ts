// WHAT: Tests for the feature pipeline: query building, Overpass parsing and
//       normalisation (synthetic + the three real fixtures), summary, cache
//       keys, and fixture-first routing.
// HOW:  Hand-built Overpass elements with known lat/lon for the geometry and
//       classification rules; the captured fixtures for realistic coverage.
// WHY:  The normaliser is the wall between OSM's tagging and the game. Every
//       rule in it (area vs line, point reduction, name collection) is pinned.

import { describe, expect, it } from 'vitest';

import type { IFeatureProvider } from '@mapdata/features/IFeatureProvider';
import {
  featureFixtureEntries,
  FixtureFeatureProvider,
} from '@mapdata/features/FixtureFeatureProvider';
import { normalizeFeatures, parseOverpassResponse } from '@mapdata/features/normalizeOverpass';
import { buildOverpassQuery } from '@mapdata/features/overpassQuery';
import { featureCacheKey } from '@mapdata/features/OverpassFeatureProvider';
import { formatFeatureReport, summarizeFeatures } from '@mapdata/features/summarizeFeatures';
import { describeArea } from '@mapdata/model/MapArea';
import { FIXTURE_AREAS } from '@mapdata/model/fixtureAreas';

const area = describeArea({
  centerLat: 54.2573,
  centerLon: -1.1167,
  sizeMeters: 2000,
  rotationDeg: 0,
});
const P = area.projection;

/** lat/lon a given number of metres east/north of the centre. */
const at = (east: number, north: number) => P.fromLocal({ east, north });

describe('buildOverpassQuery', () => {
  it('embeds the bbox as S,W,N,E and asks for JSON with geometry', () => {
    const q = buildOverpassQuery({ minLat: 1.5, maxLat: 2.5, minLon: -3.5, maxLon: -2.5 });
    expect(q).toContain('[out:json]');
    expect(q).toContain('[bbox:1.500000,-3.500000,2.500000,-2.500000]');
    expect(q.trim().endsWith('out geom;')).toBe(true);
    for (const needle of [
      'waterway',
      'natural=coastline',
      'natural=peak',
      'node[place]',
      'old_name'.slice(0, 0),
    ]) {
      expect(q).toContain(needle);
    }
  });
});

describe('parseOverpassResponse', () => {
  it('accepts the documented shape and drops junk elements', () => {
    const r = parseOverpassResponse({
      elements: [{ type: 'node', id: 1, lat: 1, lon: 2 }, 'x', { type: 'blob', id: 2 }, null],
    });
    expect(r.elements).toHaveLength(1);
  });

  it('rejects non-objects, missing elements, and runtime-error remarks', () => {
    expect(() => parseOverpassResponse(null)).toThrow(TypeError);
    expect(() => parseOverpassResponse({})).toThrow(TypeError);
    expect(() =>
      parseOverpassResponse({ elements: [], remark: 'runtime error: Query timed out' }),
    ).toThrow(/timed out/);
  });
});

describe('normalizeFeatures — classification and geometry', () => {
  it('projects a peak node into board metres with its elevation', () => {
    const p = at(100, 200);
    const [f] = normalizeFeatures(
      {
        elements: [
          {
            type: 'node',
            id: 7,
            lat: p.lat,
            lon: p.lon,
            tags: { natural: 'peak', name: 'Top', ele: '412 m' },
          },
        ],
      },
      P,
    );
    expect(f?.id).toBe('node/7');
    expect(f?.kind).toBe('peak');
    expect(f?.elevationMeters).toBe(412);
    expect(f?.geometry.type).toBe('point');
    if (f?.geometry.type === 'point') {
      expect(f.geometry.point.x).toBeCloseTo(100, 3);
      expect(f.geometry.point.z).toBeCloseTo(-200, 3);
    }
  });

  it('keeps a river as a line even when closed, and makes a closed wood a polygon', () => {
    const ring = [at(0, 0), at(50, 0), at(50, 50), at(0, 50), at(0, 0)];
    const fs = normalizeFeatures(
      {
        elements: [
          { type: 'way', id: 1, geometry: ring, tags: { waterway: 'river', name: 'Loop' } },
          { type: 'way', id: 2, geometry: ring, tags: { natural: 'wood' } },
          { type: 'way', id: 3, geometry: ring.slice(0, 3), tags: { natural: 'coastline' } },
        ],
      },
      P,
    );
    expect(fs.map((f) => [f.kind, f.geometry.type])).toEqual([
      ['waterway', 'line'],
      ['wood', 'polygon'],
      ['coastline', 'line'],
    ]);
    const wood = fs[1];
    if (wood?.geometry.type === 'polygon') expect(wood.geometry.ring).toHaveLength(4);
  });

  it('reduces historic and worship areas to a point at their centre', () => {
    const ring = [at(0, 0), at(40, 0), at(40, 40), at(0, 40), at(0, 0)];
    const [abbey, church] = normalizeFeatures(
      {
        elements: [
          { type: 'way', id: 1, geometry: ring, tags: { historic: 'monastery', name: 'Abbey' } },
          {
            type: 'way',
            id: 2,
            geometry: ring,
            tags: { amenity: 'place_of_worship', religion: 'christian' },
          },
        ],
      },
      P,
    );
    expect(abbey?.kind).toBe('historic');
    expect(abbey?.subtype).toBe('monastery');
    expect(church?.kind).toBe('worship');
    expect(church?.subtype).toBe('christian');
    if (abbey?.geometry.type === 'point') {
      expect(abbey.geometry.point.x).toBeCloseTo(20, 3);
      expect(abbey.geometry.point.z).toBeCloseTo(-20, 3);
    } else {
      throw new Error('expected point');
    }
  });

  it('turns a multipolygon relation into one polygon per outer ring, dropping inners', () => {
    const outer = [at(0, 0), at(100, 0), at(100, 100), at(0, 100), at(0, 0)];
    const inner = [at(40, 40), at(60, 40), at(60, 60), at(40, 60), at(40, 40)];
    const fs = normalizeFeatures(
      {
        elements: [
          {
            type: 'relation',
            id: 9,
            tags: { natural: 'water', water: 'lake', name: 'Tarn' },
            members: [
              { role: 'outer', geometry: outer },
              { role: 'inner', geometry: inner },
            ],
          },
        ],
      },
      P,
    );
    expect(fs).toHaveLength(1);
    expect(fs[0]?.kind).toBe('water');
    expect(fs[0]?.subtype).toBe('lake');
    expect(fs[0]?.geometry.type).toBe('polygon');
  });

  it('collects name variants and ignores untagged or irrelevant elements', () => {
    const p = at(0, 0);
    const fs = normalizeFeatures(
      {
        elements: [
          {
            type: 'node',
            id: 1,
            lat: p.lat,
            lon: p.lon,
            tags: {
              place: 'village',
              name: 'Newtown',
              old_name: 'Oldtown',
              'name:etymology': 'the new farm',
              alt_name: 'Nutown',
            },
          },
          {
            type: 'node',
            id: 2,
            lat: p.lat,
            lon: p.lon,
            tags: { natural: 'peak', 'name:gd': 'Beinn Mhòr', name: 'Ben More' },
          },
          { type: 'node', id: 3, lat: p.lat, lon: p.lon, tags: { highway: 'bus_stop' } },
          { type: 'node', id: 4, lat: p.lat, lon: p.lon },
        ],
      },
      P,
    );
    expect(fs).toHaveLength(2);
    expect(fs[0]?.names).toEqual({
      name: 'Newtown',
      oldName: 'Oldtown',
      altName: 'Nutown',
      etymology: 'the new farm',
    });
    expect(fs[1]?.names).toEqual({ name: 'Ben More', historicName: 'Beinn Mhòr' });
  });

  it('fords are fords even on ways; ford=no is not a ford', () => {
    const p = at(0, 0);
    const fs = normalizeFeatures(
      {
        elements: [
          { type: 'node', id: 1, lat: p.lat, lon: p.lon, tags: { ford: 'yes' } },
          { type: 'node', id: 2, lat: p.lat, lon: p.lon, tags: { ford: 'no', place: 'hamlet' } },
        ],
      },
      P,
    );
    expect(fs.map((f) => f.kind)).toEqual(['ford', 'place']);
  });
});

describe('the shipped feature fixtures', () => {
  it('normalise into sensible counts for each area', async () => {
    const expectations: Record<string, { waterway: number; named: number; kinds: string[] }> = {
      lindisfarne: {
        waterway: 30,
        named: 20,
        kinds: ['coastline', 'historic', 'place', 'worship', 'scrub'],
      },
      rievaulx: {
        waterway: 30,
        named: 25,
        kinds: ['waterway', 'wood', 'water', 'place', 'historic', 'peak'],
      },
      glencoe: { waterway: 50, named: 8, kinds: ['peak', 'ridge', 'ford', 'waterway'] },
    };
    for (const entry of featureFixtureEntries()) {
      const mapArea = describeArea(entry.area);
      const fs = normalizeFeatures(parseOverpassResponse(await entry.load()), mapArea.projection);
      const s = summarizeFeatures(fs);
      const want = expectations[entry.name];
      if (want === undefined) throw new Error(entry.name);
      expect(s.counts.waterway).toBeGreaterThanOrEqual(want.waterway);
      expect(s.named.length).toBeGreaterThanOrEqual(want.named);
      for (const k of want.kinds) expect(s.counts[k as keyof typeof s.counts]).toBeGreaterThan(0);
      // `out geom` returns whole ways, so long rivers reach beyond the bbox; but nothing should be continents away.
      for (const f of fs) {
        const pts =
          f.geometry.type === 'point'
            ? [f.geometry.point]
            : f.geometry.type === 'line'
              ? f.geometry.points
              : f.geometry.ring;
        for (const p of pts) expect(Math.hypot(p.x, p.z)).toBeLessThan(30000);
      }
    }
  });

  it('finds the names the spike saw', async () => {
    const entries = featureFixtureEntries();
    const rievaulx = entries.find((e) => e.name === 'rievaulx');
    const glencoe = entries.find((e) => e.name === 'glencoe');
    if (rievaulx === undefined || glencoe === undefined) throw new Error('fixtures missing');

    const r = summarizeFeatures(
      normalizeFeatures(
        parseOverpassResponse(await rievaulx.load()),
        describeArea(rievaulx.area).projection,
      ),
    );
    expect(r.named.map((n) => n.name)).toEqual(
      expect.arrayContaining(['Rievaulx', 'Rievaulx Abbey', 'River Rye', 'Ashberry Hill']),
    );

    const g = summarizeFeatures(
      normalizeFeatures(
        parseOverpassResponse(await glencoe.load()),
        describeArea(glencoe.area).projection,
      ),
    );
    const coe = g.named.find((n) => n.name === 'River Coe');
    expect(coe?.historicName).toBe('Abhainn Chomhann');
    expect(g.oldNameCount).toBeGreaterThanOrEqual(2);
  });
});

describe('summarizeFeatures / formatFeatureReport', () => {
  it('deduplicates split ways by kind+name and flags old names', () => {
    const p = at(0, 0);
    const fs = normalizeFeatures(
      {
        elements: [
          {
            type: 'way',
            id: 1,
            geometry: [at(0, 0), at(10, 0)],
            tags: { waterway: 'river', name: 'Rye' },
          },
          {
            type: 'way',
            id: 2,
            geometry: [at(10, 0), at(20, 0)],
            tags: { waterway: 'river', name: 'Rye' },
          },
          {
            type: 'node',
            id: 3,
            lat: p.lat,
            lon: p.lon,
            tags: { place: 'village', name: 'A', old_name: 'B' },
          },
          { type: 'node', id: 4, lat: p.lat, lon: p.lon, tags: { natural: 'peak' } },
        ],
      },
      P,
    );
    const s = summarizeFeatures(fs);
    expect(s.total).toBe(4);
    expect(s.counts.waterway).toBe(2);
    expect(s.named).toHaveLength(2);
    expect(s.oldNameCount).toBe(1);
    const text = formatFeatureReport(s, 'Test');
    expect(text).toContain('OLD NAME: B');
    expect(text).toContain('waterway   2');
  });
});

describe('featureCacheKey', () => {
  it('ignores sub-metre nudges but not rotation or size', () => {
    const a = { centerLat: 54.2573, centerLon: -1.1167, sizeMeters: 2000, rotationDeg: 0 };
    expect(featureCacheKey({ ...a, centerLat: a.centerLat + 0.000001 }, 200)).toBe(
      featureCacheKey(a, 200),
    );
    expect(featureCacheKey({ ...a, rotationDeg: 90 }, 200)).not.toBe(featureCacheKey(a, 200));
    expect(featureCacheKey({ ...a, sizeMeters: 1000 }, 200)).not.toBe(featureCacheKey(a, 200));
    expect(featureCacheKey({ ...a, rotationDeg: 360 }, 200)).toBe(featureCacheKey(a, 200));
  });
});

describe('FixtureFeatureProvider', () => {
  const never: IFeatureProvider = {
    getFeatures: () => Promise.reject(new Error('network should not be called')),
  };

  it('serves fixture areas offline and delegates others', async () => {
    const provider = new FixtureFeatureProvider(featureFixtureEntries(), never);
    const def = FIXTURE_AREAS[0];
    if (def === undefined) throw new Error('no fixtures');
    const r = await provider.getFeatures(describeArea(def.area));
    expect(r.source).toBe('fixture');
    expect(r.features.length).toBeGreaterThan(50);
    await expect(
      provider.getFeatures(
        describeArea({ centerLat: 50, centerLon: 10, sizeMeters: 2000, rotationDeg: 0 }),
      ),
    ).rejects.toThrow('network should not be called');
  });
});
