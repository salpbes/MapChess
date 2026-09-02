// WHAT: Tests for AreaProjection, describeArea and the orientation rule (D-007).
// HOW:  Known distances (1° of latitude ≈ 111.2 km), round trips, and rotation
//       cases checked against compass intuition: with rotation 0 the a1 corner
//       is geographically south-west; with rotation 180 it is north-east.
// WHY:  A sign error here would mirror or spin every board. These tests pin
//       the convention so no later phase re-derives it.

import { describe, expect, it } from 'vitest';

import { AreaProjection } from '@mapdata/model/AreaProjection';
import { cornerRing, describeArea } from '@mapdata/model/MapArea';
import { assertValidArea, normaliseBearing } from '@mapdata/model/SelectedArea';
import type { SelectedArea } from '@mapdata/model/SelectedArea';

const base: SelectedArea = { centerLat: 55.68, centerLon: -1.79, sizeMeters: 2000, rotationDeg: 0 };
const METERS_PER_DEG_LAT = 111195; // 6371008.8 m × π/180

describe('AreaProjection — local metres', () => {
  it('maps the centre to the origin', () => {
    const p = new AreaProjection(base);
    expect(p.toLocal({ lat: base.centerLat, lon: base.centerLon })).toEqual({ east: 0, north: 0 });
  });

  it('measures one degree of latitude as ~111.2 km north', () => {
    const p = new AreaProjection(base);
    const m = p.toLocal({ lat: base.centerLat + 1, lon: base.centerLon });
    expect(m.north).toBeCloseTo(METERS_PER_DEG_LAT, -1);
    expect(m.east).toBeCloseTo(0, 6);
  });

  it('shrinks longitude by cos(latitude)', () => {
    const p = new AreaProjection(base);
    const m = p.toLocal({ lat: base.centerLat, lon: base.centerLon + 1 });
    expect(m.east).toBeCloseTo(METERS_PER_DEG_LAT * Math.cos((base.centerLat * Math.PI) / 180), -1);
  });

  it('round-trips lat/lon → local → lat/lon', () => {
    const p = new AreaProjection(base);
    const q = { lat: 55.6871, lon: -1.7812 };
    const back = p.fromLocal(p.toLocal(q));
    expect(back.lat).toBeCloseTo(q.lat, 9);
    expect(back.lon).toBeCloseTo(q.lon, 9);
  });

  it('handles the antimeridian', () => {
    const p = new AreaProjection({ ...base, centerLat: 0, centerLon: 179.99 });
    const m = p.toLocal({ lat: 0, lon: -179.99 });
    expect(m.east).toBeGreaterThan(0);
    expect(m.east).toBeCloseTo(0.02 * METERS_PER_DEG_LAT, -1);
  });
});

describe('AreaProjection — board frame', () => {
  it('with rotation 0: east → +x, north → −z', () => {
    const p = new AreaProjection(base);
    expect(p.localToBoard({ east: 100, north: 0 })).toEqual({ x: 100, z: -0 });
    const n = p.localToBoard({ east: 0, north: 100 });
    expect(n.x).toBeCloseTo(0);
    expect(n.z).toBeCloseTo(-100);
  });

  it('with rotation 90: board-north points geographic east', () => {
    const p = new AreaProjection({ ...base, rotationDeg: 90 });
    const b = p.localToBoard({ east: 100, north: 0 });
    expect(b.x).toBeCloseTo(0);
    expect(b.z).toBeCloseTo(-100);
  });

  it('with rotation 180: everything flips', () => {
    const p = new AreaProjection({ ...base, rotationDeg: 180 });
    const b = p.localToBoard({ east: 100, north: 50 });
    expect(b.x).toBeCloseTo(-100);
    expect(b.z).toBeCloseTo(50);
  });

  it('round-trips through the board frame at an arbitrary rotation', () => {
    const p = new AreaProjection({ ...base, rotationDeg: 37 });
    const q = { lat: 55.6851, lon: -1.7962 };
    const back = p.fromBoard(p.toBoard(q));
    expect(back.lat).toBeCloseTo(q.lat, 9);
    expect(back.lon).toBeCloseTo(q.lon, 9);
  });

  it('preserves distances under rotation', () => {
    const p = new AreaProjection({ ...base, rotationDeg: 123 });
    const b = p.localToBoard({ east: 300, north: 400 });
    expect(Math.hypot(b.x, b.z)).toBeCloseTo(500);
  });
});

describe('describeArea — corners and the orientation rule', () => {
  it('puts a1 geographically south-west when rotation is 0', () => {
    const { corners } = describeArea(base);
    expect(corners.sw.lat).toBeLessThan(base.centerLat);
    expect(corners.sw.lon).toBeLessThan(base.centerLon);
    expect(corners.ne.lat).toBeGreaterThan(base.centerLat);
    expect(corners.ne.lon).toBeGreaterThan(base.centerLon);
    expect(corners.se.lat).toBeCloseTo(corners.sw.lat, 9);
    expect(corners.nw.lon).toBeCloseTo(corners.sw.lon, 9);
  });

  it('puts a1 geographically north-east when rotation is 180', () => {
    const { corners } = describeArea({ ...base, rotationDeg: 180 });
    expect(corners.sw.lat).toBeGreaterThan(base.centerLat);
    expect(corners.sw.lon).toBeGreaterThan(base.centerLon);
  });

  it('makes a square of the requested size', () => {
    const area = describeArea(base);
    const sw = area.projection.toLocal(area.corners.sw);
    const se = area.projection.toLocal(area.corners.se);
    const nw = area.projection.toLocal(area.corners.nw);
    expect(Math.hypot(se.east - sw.east, se.north - sw.north)).toBeCloseTo(2000, 6);
    expect(Math.hypot(nw.east - sw.east, nw.north - sw.north)).toBeCloseTo(2000, 6);
  });

  it('bounds enclose all corners and grow when rotated 45°', () => {
    const flat = describeArea(base).bounds;
    const turned = describeArea({ ...base, rotationDeg: 45 }).bounds;
    expect(turned.maxLat - turned.minLat).toBeGreaterThan(flat.maxLat - flat.minLat);
    expect(turned.maxLat - turned.minLat).toBeCloseTo((flat.maxLat - flat.minLat) * Math.SQRT2, 6);
  });

  it('produces a closed GeoJSON ring starting at a1', () => {
    const { corners } = describeArea(base);
    const ring = cornerRing(corners);
    expect(ring).toHaveLength(5);
    expect(ring[0]).toEqual([corners.sw.lon, corners.sw.lat]);
    expect(ring[4]).toEqual(ring[0]);
  });

  it('rejects impossible areas', () => {
    expect(() => describeArea({ ...base, centerLat: 91 })).toThrow(RangeError);
    expect(() => describeArea({ ...base, sizeMeters: 0 })).toThrow(RangeError);
    expect(() => {
      assertValidArea({ ...base, rotationDeg: Number.NaN });
    }).toThrow(RangeError);
  });
});

describe('normaliseBearing', () => {
  it('wraps into [0, 360)', () => {
    expect(normaliseBearing(0)).toBe(0);
    expect(normaliseBearing(360)).toBe(0);
    expect(normaliseBearing(-90)).toBe(270);
    expect(normaliseBearing(725)).toBe(5);
  });
});
