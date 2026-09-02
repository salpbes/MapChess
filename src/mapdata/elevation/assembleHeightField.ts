// WHAT: Resamples a mosaic of Web Mercator tiles into a board-aligned HeightField.
// HOW:  Builds a regular grid in the board frame covering the board plus a
//       margin. For each grid point: board → lat/lon → fractional tile pixel
//       → bilinear read from the mosaic. This one pass handles the board's
//       rotation and the Mercator distortion together, so downstream code
//       only ever sees an axis-aligned grid in metres.
// WHY:  Pure function of (area, tiles) → HeightField, so it is tested with
//       synthetic tiles in Node and shared verbatim by the browser provider
//       and the fixture-generation script.

import { createHeightField } from '@mapdata/model/HeightField';
import type { HeightField } from '@mapdata/model/HeightField';
import type { MapArea } from '@mapdata/model/MapArea';

import { latLonToTileFrac, TILE_SIZE } from './TileMath';
import type { TileCoord, TileRange } from './TileMath';

export type TileKey = string & { readonly __brand: 'TileKey' };

export function tileKey(t: TileCoord): TileKey {
  return `${String(t.z)}/${String(t.x)}/${String(t.y)}` as TileKey;
}

export interface AssembleOptions {
  /** Grid spacing of the output, metres. */
  readonly stepMeters: number;
  /** Extra ground beyond the board edge on every side, metres. */
  readonly marginMeters: number;
}

/**
 * @param tiles decoded heights per tile, each TILE_SIZE² values row-major.
 *              Missing tiles read as 0 m (sea level) rather than failing the whole board.
 */
export function assembleHeightField(
  area: MapArea,
  range: TileRange,
  tiles: ReadonlyMap<TileKey, Float32Array>,
  options: AssembleOptions,
): HeightField {
  const half = area.selection.sizeMeters / 2 + options.marginMeters;
  const step = options.stepMeters;
  const cols = Math.ceil((2 * half) / step) + 1;
  const rows = cols;
  const originX = -half;
  const originZ = -half;

  const mosaicW = (range.maxX - range.minX + 1) * TILE_SIZE;
  const mosaicH = (range.maxY - range.minY + 1) * TILE_SIZE;
  const readMosaic = (px: number, py: number): number => {
    const cx = clamp(px, 0, mosaicW - 1);
    const cy = clamp(py, 0, mosaicH - 1);
    const tx = range.minX + Math.floor(cx / TILE_SIZE);
    const ty = range.minY + Math.floor(cy / TILE_SIZE);
    const tile = tiles.get(tileKey({ z: range.z, x: tx, y: ty }));
    if (tile === undefined) return 0;
    return tile[(cy % TILE_SIZE) * TILE_SIZE + (cx % TILE_SIZE)] ?? 0;
  };

  const data = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r += 1) {
    const z = originZ + r * step;
    for (let c = 0; c < cols; c += 1) {
      const x = originX + c * step;
      const ll = area.projection.fromBoard({ x, z });
      const f = latLonToTileFrac(ll, range.z);
      // Pixel centres sit at +0.5; subtract so integer pixel coords address centres.
      const px = (f.x - range.minX) * TILE_SIZE - 0.5;
      const py = (f.y - range.minY) * TILE_SIZE - 0.5;
      data[r * cols + c] = bilinear(readMosaic, px, py);
    }
  }

  return createHeightField(originX, originZ, step, cols, rows, data);
}

function bilinear(read: (px: number, py: number) => number, px: number, py: number): number {
  const x0 = Math.floor(px);
  const y0 = Math.floor(py);
  const tx = px - x0;
  const ty = py - y0;
  const h00 = read(x0, y0);
  const h10 = read(x0 + 1, y0);
  const h01 = read(x0, y0 + 1);
  const h11 = read(x0 + 1, y0 + 1);
  const top = h00 + (h10 - h00) * tx;
  const bottom = h01 + (h11 - h01) * tx;
  return top + (bottom - top) * ty;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
