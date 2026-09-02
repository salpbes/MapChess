// WHAT: IElevationProvider backed by Terrarium tiles from AWS Open Data.
// HOW:  Picks a zoom for ~10 m pixels at the area's latitude, lists the tiles
//       covering the (rotated, margined) board, and for each: cache → else
//       fetchBlob → decode PNG (createImageBitmap + OffscreenCanvas) →
//       decodeTerrarium → cache. Up to four tiles in flight. Then hands the
//       mosaic to assembleHeightField. A tile that fails after retries is
//       logged and read as sea level rather than failing the board.
// WHY:  Verified by the Phase 6 spike (D-022): the S3 endpoint serves 256²
//       RGB PNGs with `Access-Control-Allow-Origin: *`, no key, worldwide.
//       The image decode is the only browser-bound step, so it is the only
//       thing this file does that the fixture script does not.

import type { KeyValueStore } from '@mapdata/cache/KeyValueStore';
import { paddedBounds } from '@mapdata/model/MapArea';
import type { MapArea } from '@mapdata/model/MapArea';
import { fetchBlob } from '@mapdata/net/fetchJson';

import { assembleHeightField, tileKey } from './assembleHeightField';
import type { TileKey } from './assembleHeightField';
import type {
  ElevationRequestOptions,
  ElevationResult,
  IElevationProvider,
} from './IElevationProvider';
import { decodeTerrarium } from './terrarium';
import { TILE_SIZE, tileCount, tileRangeFor, tilesIn, zoomForResolution } from './TileMath';
import type { TileCoord } from './TileMath';

export interface TerrariumOptions {
  /** URL template with {z} {x} {y}. */
  readonly urlTemplate?: string;
  /** Desired ground resolution of the assembled field, metres per sample. */
  readonly stepMeters?: number;
  /** Extra ground beyond the board edge, metres. */
  readonly marginMeters?: number;
  readonly maxConcurrent?: number;
}

const DEFAULT_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const DEFAULT_STEP_M = 10;
const DEFAULT_MARGIN_M = 200;
const DEFAULT_CONCURRENCY = 4;
/** Terrarium is published for zooms 0–15. */
const MIN_ZOOM = 8;
const MAX_ZOOM = 15;

export class TerrariumElevationProvider implements IElevationProvider {
  private readonly urlTemplate: string;
  private readonly stepMeters: number;
  private readonly marginMeters: number;
  private readonly maxConcurrent: number;

  public constructor(
    private readonly cache: KeyValueStore<Float32Array>,
    options: TerrariumOptions = {},
  ) {
    this.urlTemplate = options.urlTemplate ?? DEFAULT_URL;
    this.stepMeters = options.stepMeters ?? DEFAULT_STEP_M;
    this.marginMeters = options.marginMeters ?? DEFAULT_MARGIN_M;
    this.maxConcurrent = options.maxConcurrent ?? DEFAULT_CONCURRENCY;
  }

  public async getHeightField(
    area: MapArea,
    options: ElevationRequestOptions = {},
  ): Promise<ElevationResult> {
    const zoom = zoomForResolution(this.stepMeters, area.selection.centerLat, MIN_ZOOM, MAX_ZOOM);
    const range = tileRangeFor(paddedBounds(area, this.marginMeters), zoom);
    const total = tileCount(range);
    const tiles = new Map<TileKey, Float32Array>();
    let fromNetwork = 0;
    let done = 0;

    const queue = [...tilesIn(range)];
    const worker = async (): Promise<void> => {
      for (;;) {
        const tile = queue.shift();
        if (tile === undefined) return;
        options.signal?.throwIfAborted();
        const key = tileKey(tile);
        const cached = await this.cache.get(key);
        if (cached !== null) {
          tiles.set(key, cached);
        } else {
          const fetched = await this.fetchTile(tile, options.signal);
          if (fetched !== null) {
            fromNetwork += 1;
            tiles.set(key, fetched);
            await this.cache.put(key, fetched);
          }
        }
        done += 1;
        options.onProgress?.(done, total);
      }
    };
    await Promise.all(Array.from({ length: Math.min(this.maxConcurrent, total) }, worker));

    const field = assembleHeightField(area, range, tiles, {
      stepMeters: this.stepMeters,
      marginMeters: this.marginMeters,
    });
    return { field, source: fromNetwork === 0 ? 'cache' : 'network', tileCount: total, zoom };
  }

  private async fetchTile(
    tile: TileCoord,
    signal: AbortSignal | undefined,
  ): Promise<Float32Array | null> {
    const url = this.urlTemplate
      .replace('{z}', String(tile.z))
      .replace('{x}', String(tile.x))
      .replace('{y}', String(tile.y));
    try {
      const blob = await fetchBlob(url, {
        timeoutMs: 10000,
        retries: 2,
        ...(signal === undefined ? {} : { signal }),
      });
      return await decodePng(blob);
    } catch (error: unknown) {
      if (signal?.aborted === true) throw error;
      console.error(`Elevation tile ${tileKey(tile)} failed; reading it as sea level.`, error);
      return null;
    }
  }
}

async function decodePng(blob: Blob): Promise<Float32Array> {
  const bitmap = await createImageBitmap(blob);
  try {
    if (bitmap.width !== TILE_SIZE || bitmap.height !== TILE_SIZE) {
      throw new Error(`Unexpected tile size ${String(bitmap.width)}×${String(bitmap.height)}`);
    }
    const canvas = new OffscreenCanvas(TILE_SIZE, TILE_SIZE);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (ctx === null) throw new Error('2D canvas context unavailable');
    ctx.drawImage(bitmap, 0, 0);
    const rgba = ctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE).data;
    return decodeTerrarium(rgba, TILE_SIZE * TILE_SIZE);
  } finally {
    bitmap.close();
  }
}
