// WHAT: Web Mercator tile arithmetic.
// HOW:  Standard slippy-map formulas: lat/lon → fractional tile coordinates at
//       a zoom, and the inverse for tile corners. `zoomForResolution` picks the
//       coarsest zoom whose ground pixel size is at or below a target, since
//       finer tiles cost more requests for no more real detail (the source
//       data is ~30 m).
// WHY:  Both the elevation fetcher and, later, any other tiled source need
//       exactly this and nothing else. Pure, so it is tested without a network.

import type { LatLon } from '@mapdata/model/SelectedArea';

export const TILE_SIZE = 256;
/** Earth circumference in metres at the equator over 2^z gives metres per tile. */
const EQUATOR_M = 40075016.686;
const DEG = Math.PI / 180;
const MAX_LAT = 85.05112878;

export interface TileCoord {
  readonly z: number;
  readonly x: number;
  readonly y: number;
}

/** Fractional tile coordinates: integer part is the tile, fraction is position within it. */
export function latLonToTileFrac(p: LatLon, z: number): { x: number; y: number } {
  const lat = Math.max(-MAX_LAT, Math.min(MAX_LAT, p.lat));
  const n = 2 ** z;
  const x = ((p.lon + 180) / 360) * n;
  const latRad = lat * DEG;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { x, y };
}

export function latLonToTile(p: LatLon, z: number): TileCoord {
  const f = latLonToTileFrac(p, z);
  return { z, x: Math.floor(f.x), y: Math.floor(f.y) };
}

/** Geographic position of a fractional tile coordinate (tile corner when integers). */
export function tileFracToLatLon(x: number, y: number, z: number): LatLon {
  const n = 2 ** z;
  const lon = (x / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
  return { lat: latRad / DEG, lon };
}

/** Ground size of one pixel at this zoom and latitude, in metres. */
export function metersPerPixel(z: number, lat: number): number {
  return (EQUATOR_M * Math.cos(lat * DEG)) / (TILE_SIZE * 2 ** z);
}

/** Coarsest zoom whose pixels are no larger than `targetMeters`, clamped to [minZ, maxZ]. */
export function zoomForResolution(
  targetMeters: number,
  lat: number,
  minZ: number,
  maxZ: number,
): number {
  for (let z = minZ; z <= maxZ; z += 1) {
    if (metersPerPixel(z, lat) <= targetMeters) return z;
  }
  return maxZ;
}

export interface TileRange {
  readonly z: number;
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

/** Inclusive tile range covering a lat/lon box. */
export function tileRangeFor(
  bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number },
  z: number,
): TileRange {
  const a = latLonToTile({ lat: bounds.maxLat, lon: bounds.minLon }, z);
  const b = latLonToTile({ lat: bounds.minLat, lon: bounds.maxLon }, z);
  return {
    z,
    minX: Math.min(a.x, b.x),
    maxX: Math.max(a.x, b.x),
    minY: Math.min(a.y, b.y),
    maxY: Math.max(a.y, b.y),
  };
}

export function tileCount(r: TileRange): number {
  return (r.maxX - r.minX + 1) * (r.maxY - r.minY + 1);
}

export function* tilesIn(r: TileRange): Generator<TileCoord> {
  for (let y = r.minY; y <= r.maxY; y += 1) {
    for (let x = r.minX; x <= r.maxX; x += 1) {
      yield { z: r.z, x, y };
    }
  }
}
