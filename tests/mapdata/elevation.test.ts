// WHAT: Tests for the pure elevation pipeline: tile maths, Terrarium decoding,
//       HeightField sampling, mosaic assembly, fixture round-trip, and the
//       fixture-first provider against the shipped fixture files.
// HOW:  Synthetic tiles with known heights; the real fixtures for a smoke
//       check (min/max within the ranges printed when they were generated).
// WHY:  Everything here runs in Node with no network; only the PNG → RGBA step
//       is browser-bound and that is a dozen lines in the provider.

import { describe, expect, it } from 'vitest';

import { assembleHeightField, tileKey } from '@mapdata/elevation/assembleHeightField';
import type { TileKey } from '@mapdata/elevation/assembleHeightField';
import { FixtureElevationProvider } from '@mapdata/elevation/FixtureElevationProvider';
import { FIXTURE_AREAS, fixtureEntries } from '@mapdata/elevation/fixtureAreas';
import { fieldToFixture, fixtureToField, sameArea } from '@mapdata/elevation/heightFieldFixture';
import type { Base64Codec } from '@mapdata/elevation/heightFieldFixture';
import type { IElevationProvider } from '@mapdata/elevation/IElevationProvider';
import { decodeTerrarium, encodeTerrarium } from '@mapdata/elevation/terrarium';
import {
  latLonToTile,
  latLonToTileFrac,
  metersPerPixel,
  TILE_SIZE,
  tileCount,
  tileFracToLatLon,
  tileRangeFor,
  tilesIn,
  zoomForResolution,
} from '@mapdata/elevation/TileMath';
import { createHeightField, sampleHeight, sampleStats } from '@mapdata/model/HeightField';
import { describeArea } from '@mapdata/model/MapArea';

const nodeBase64: Base64Codec = {
  encode: (bytes) => Buffer.from(bytes).toString('base64'),
  decode: (text) => new Uint8Array(Buffer.from(text, 'base64')),
};

describe('TileMath', () => {
  it('matches the spike tile index for Lindisfarne at z13', () => {
    expect(latLonToTile({ lat: 55.6785, lon: -1.7937 }, 13)).toEqual({ z: 13, x: 4055, y: 2563 });
  });

  it('round-trips fractional tile coordinates', () => {
    const p = { lat: 54.2573, lon: -1.1167 };
    const f = latLonToTileFrac(p, 14);
    const back = tileFracToLatLon(f.x, f.y, 14);
    expect(back.lat).toBeCloseTo(p.lat, 8);
    expect(back.lon).toBeCloseTo(p.lon, 8);
  });

  it('halves pixel size per zoom and shrinks it with latitude', () => {
    expect(metersPerPixel(13, 0)).toBeCloseTo(19.1, 1);
    expect(metersPerPixel(14, 0)).toBeCloseTo(metersPerPixel(13, 0) / 2, 6);
    expect(metersPerPixel(13, 60)).toBeCloseTo(metersPerPixel(13, 0) / 2, 6);
  });

  it('picks the coarsest zoom that meets the target resolution', () => {
    // At 55.7° N, z13 ≈ 10.8 m/px, z14 ≈ 5.4 m/px → 10 m target needs z14.
    expect(zoomForResolution(10, 55.7, 8, 15)).toBe(14);
    expect(zoomForResolution(11, 55.7, 8, 15)).toBe(13);
    expect(zoomForResolution(0.001, 0, 8, 15)).toBe(15);
  });

  it('lists an inclusive tile range', () => {
    const r = tileRangeFor({ minLat: 55.66, maxLat: 55.7, minLon: -1.82, maxLon: -1.77 }, 14);
    expect(r.maxX).toBeGreaterThanOrEqual(r.minX);
    expect(r.maxY).toBeGreaterThanOrEqual(r.minY);
    expect([...tilesIn(r)]).toHaveLength(tileCount(r));
  });
});

describe('Terrarium decoding', () => {
  it('decodes the documented formula', () => {
    // 0 m → R=128, G=0, B=0
    expect(decodeTerrarium(new Uint8Array([128, 0, 0, 255]), 1)[0]).toBe(0);
    // 1000.5 m → 33768.5 = 131·256 + 232 + 0.5 → B = 128
    expect(decodeTerrarium(new Uint8Array([131, 232, 128, 255]), 1)[0]).toBeCloseTo(1000.5, 6);
    // −22 m
    expect(decodeTerrarium(new Uint8Array([127, 234, 0, 255]), 1)[0]).toBe(-22);
  });

  it('round-trips through the fixture encoder to sub-decimetre precision', () => {
    for (const h of [-22, 0, 17.7, 204.6, 918.4, 2969.6]) {
      const [r, g, b] = encodeTerrarium(h);
      expect(decodeTerrarium(new Uint8Array([r, g, b, 255]), 1)[0]).toBeCloseTo(h, 2);
    }
  });

  it('rejects a short buffer', () => {
    expect(() => decodeTerrarium(new Uint8Array(7), 2)).toThrow(RangeError);
  });
});

describe('HeightField sampling', () => {
  // 3×3 grid, step 10 m, origin (0,0): height = x + 2z (a plane).
  const plane = createHeightField(
    0,
    0,
    10,
    3,
    3,
    new Float32Array([0, 10, 20, 20, 30, 40, 40, 50, 60]),
  );

  it('tracks min and max', () => {
    expect(plane.minMeters).toBe(0);
    expect(plane.maxMeters).toBe(60);
  });

  it('interpolates bilinearly on a plane exactly', () => {
    expect(sampleHeight(plane, 5, 5)).toBeCloseTo(15);
    expect(sampleHeight(plane, 12.5, 7.5)).toBeCloseTo(27.5);
    expect(sampleHeight(plane, 20, 20)).toBeCloseTo(60);
  });

  it('clamps outside the field', () => {
    expect(sampleHeight(plane, -100, -100)).toBe(0);
    expect(sampleHeight(plane, 999, 999)).toBe(60);
  });

  it('reports min/mean/max inside a polygon', () => {
    const square = [
      { x: 0, z: 20 },
      { x: 20, z: 20 },
      { x: 20, z: 0 },
      { x: 0, z: 0 },
    ];
    const s = sampleStats(plane, square);
    expect(s.min).toBe(0);
    expect(s.max).toBe(60);
    expect(s.mean).toBeCloseTo(30, 5);
    expect(s.count).toBeGreaterThanOrEqual(9);
  });

  it('still answers for a polygon smaller than the grid step', () => {
    const tiny = [
      { x: 11, z: 11 },
      { x: 13, z: 11 },
      { x: 13, z: 13 },
      { x: 11, z: 13 },
    ];
    const s = sampleStats(plane, tiny);
    expect(s.count).toBe(5);
    expect(s.mean).toBeCloseTo(36, 0);
  });
});

describe('assembleHeightField', () => {
  const area = describeArea({
    centerLat: 55.6785,
    centerLon: -1.7937,
    sizeMeters: 400,
    rotationDeg: 0,
  });
  const z = 14;
  const range = tileRangeFor(area.bounds, z);

  const constantTiles = (h: number): Map<TileKey, Float32Array> => {
    const m = new Map<TileKey, Float32Array>();
    for (const t of tilesIn(range))
      m.set(tileKey(t), new Float32Array(TILE_SIZE * TILE_SIZE).fill(h));
    return m;
  };

  it('produces a board-aligned grid covering board + margin', () => {
    const f = assembleHeightField(area, range, constantTiles(42), {
      stepMeters: 10,
      marginMeters: 50,
    });
    expect(f.originX).toBe(-250);
    expect(f.originZ).toBe(-250);
    expect(f.cols).toBe(51);
    expect(f.rows).toBe(51);
    expect(f.minMeters).toBeCloseTo(42, 4);
    expect(f.maxMeters).toBeCloseTo(42, 4);
  });

  it('reads missing tiles as sea level instead of failing', () => {
    const f = assembleHeightField(area, range, new Map(), { stepMeters: 10, marginMeters: 0 });
    expect(f.minMeters).toBe(0);
    expect(f.maxMeters).toBe(0);
  });

  it('preserves a north–south gradient with the right sign (north is −Z)', () => {
    // Height increases with tile pixel row → increases southward (+Z on the board).
    const tiles = new Map<TileKey, Float32Array>();
    for (const t of tilesIn(range)) {
      const d = new Float32Array(TILE_SIZE * TILE_SIZE);
      for (let r = 0; r < TILE_SIZE; r += 1)
        for (let c = 0; c < TILE_SIZE; c += 1)
          d[r * TILE_SIZE + c] = (t.y - range.minY) * TILE_SIZE + r;
      tiles.set(tileKey(t), d);
    }
    const f = assembleHeightField(area, range, tiles, { stepMeters: 10, marginMeters: 0 });
    expect(sampleHeight(f, 0, 150)).toBeGreaterThan(sampleHeight(f, 0, -150));
  });
});

describe('height field fixtures', () => {
  it('round-trips a field to 0.1 m', () => {
    const src = createHeightField(-5, -5, 5, 2, 2, new Float32Array([-22.04, 0, 17.66, 2969.6]));
    const area = { centerLat: 1, centerLon: 2, sizeMeters: 10, rotationDeg: 0 };
    const fx = fieldToFixture(src, area, { name: 't', description: 'd', source: 's' }, nodeBase64);
    const back = fixtureToField(fx, nodeBase64);
    expect([...back.data].map((v) => +v.toFixed(1))).toEqual([-22, 0, 17.7, 2969.6]);
    expect(back.cols).toBe(2);
    expect(back.stepMeters).toBe(5);
  });

  it('compares areas with tolerance and rotation wrap', () => {
    const a = { centerLat: 55.6785, centerLon: -1.7937, sizeMeters: 2000, rotationDeg: 0 };
    expect(sameArea(a, { ...a, centerLat: 55.678501 })).toBe(true);
    expect(sameArea(a, { ...a, rotationDeg: 359.8 })).toBe(true);
    expect(sameArea(a, { ...a, rotationDeg: 5 })).toBe(false);
    expect(sameArea(a, { ...a, centerLon: -1.8 })).toBe(false);
  });

  it('ships three fixtures that decode to sensible ranges', async () => {
    const entries = fixtureEntries();
    expect(entries.map((e) => e.name)).toEqual(['lindisfarne', 'rievaulx', 'glencoe']);
    const expected: Record<string, [number, number]> = {
      lindisfarne: [-5, 40],
      rievaulx: [50, 260],
      glencoe: [50, 1100],
    };
    for (const e of entries) {
      const field = fixtureToField(await e.load(), nodeBase64);
      const [lo, hi] = expected[e.name] ?? [0, 0];
      expect(field.cols).toBe(241);
      expect(field.minMeters).toBeGreaterThan(lo);
      expect(field.maxMeters).toBeLessThan(hi);
      expect(field.maxMeters - field.minMeters).toBeGreaterThan(5);
    }
  });
});

describe('FixtureElevationProvider', () => {
  const neverNetwork: IElevationProvider = {
    getHeightField: () => Promise.reject(new Error('network provider should not be called')),
  };

  it('serves a matching area from the fixture without touching the fallback', async () => {
    const provider = new FixtureElevationProvider(fixtureEntries(), neverNetwork, nodeBase64);
    const def = FIXTURE_AREAS[1];
    if (def === undefined) throw new Error('missing fixture');
    const result = await provider.getHeightField(describeArea(def.area));
    expect(result.source).toBe('fixture');
    expect(result.field.minMeters).toBeGreaterThan(50);
  });

  it('delegates unknown areas to the fallback', async () => {
    const provider = new FixtureElevationProvider(fixtureEntries(), neverNetwork, nodeBase64);
    await expect(
      provider.getHeightField(
        describeArea({ centerLat: 50, centerLon: 10, sizeMeters: 2000, rotationDeg: 0 }),
      ),
    ).rejects.toThrow('network provider should not be called');
  });
});
