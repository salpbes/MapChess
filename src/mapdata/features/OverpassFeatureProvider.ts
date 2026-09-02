// WHAT: IFeatureProvider backed by the public Overpass API, cached and rate-limited.
// HOW:  Area → cache key → hit? return. Otherwise wait for the RateLimiter,
//       GET the query from the primary endpoint (fetchJson: 30 s timeout, one
//       retry), fall back to the secondary endpoint on failure, normalise, and
//       cache the normalised features keyed by area. Raw Overpass JSON is
//       parsed and discarded inside this call.
// WHY:  Overpass is a free community service that blocks clients that hammer
//       it (BUILD_PLAN §8). Two seconds between requests plus a persistent
//       cache means a development session asks it a handful of times, not
//       hundreds. Endpoint failover covers the frequent single-instance outages.

import type { KeyValueStore } from '@mapdata/cache/KeyValueStore';
import { RateLimiter } from '@mapdata/cache/RateLimiter';
import { paddedBounds } from '@mapdata/model/MapArea';
import type { MapArea } from '@mapdata/model/MapArea';
import type { MapFeature } from '@mapdata/model/MapFeature';
import type { SelectedArea } from '@mapdata/model/SelectedArea';
import { fetchJson, NetworkError } from '@mapdata/net/fetchJson';

import type { FeatureRequestOptions, FeatureResult, IFeatureProvider } from './IFeatureProvider';
import { normalizeFeatures, parseOverpassResponse } from './normalizeOverpass';
import { buildOverpassQuery } from './overpassQuery';

export interface CachedFeatures {
  readonly version: 1;
  readonly fetchedAt: string;
  readonly features: readonly MapFeature[];
}

export function isCachedFeatures(value: unknown): value is CachedFeatures {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return v.version === 1 && Array.isArray(v.features);
}

export interface OverpassOptions {
  readonly endpoints?: readonly string[];
  readonly marginMeters?: number;
  readonly minIntervalMs?: number;
  readonly timeoutMs?: number;
}

const DEFAULT_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
const DEFAULT_MARGIN_M = 200;
const DEFAULT_MIN_INTERVAL_MS = 2000;
const DEFAULT_TIMEOUT_MS = 30000;

export class OverpassFeatureProvider implements IFeatureProvider {
  private readonly endpoints: readonly string[];
  private readonly marginMeters: number;
  private readonly timeoutMs: number;
  private readonly limiter: RateLimiter;

  public constructor(
    private readonly cache: KeyValueStore<CachedFeatures>,
    options: OverpassOptions = {},
  ) {
    this.endpoints = options.endpoints ?? DEFAULT_ENDPOINTS;
    this.marginMeters = options.marginMeters ?? DEFAULT_MARGIN_M;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.limiter = new RateLimiter(options.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS);
  }

  public async getFeatures(
    area: MapArea,
    options: FeatureRequestOptions = {},
  ): Promise<FeatureResult> {
    const started = performance.now();
    const key = featureCacheKey(area.selection, this.marginMeters);

    const cached = await this.cache.get(key);
    if (cached !== null) {
      return { features: cached.features, source: 'cache', elapsedMs: performance.now() - started };
    }

    await this.limiter.acquire();
    options.signal?.throwIfAborted();

    const query = buildOverpassQuery(
      paddedBounds(area, this.marginMeters),
      Math.floor(this.timeoutMs / 1000) - 2,
    );
    const response = await this.fetchWithFailover(query, options.signal);
    const features = normalizeFeatures(response, area.projection);

    await this.cache.put(key, { version: 1, fetchedAt: new Date().toISOString(), features });
    return { features, source: 'network', elapsedMs: performance.now() - started };
  }

  private async fetchWithFailover(query: string, signal: AbortSignal | undefined) {
    let lastError: unknown = null;
    for (const endpoint of this.endpoints) {
      const url = `${endpoint}?data=${encodeURIComponent(query)}`;
      try {
        return await fetchJson(url, {
          timeoutMs: this.timeoutMs,
          retries: 1,
          validate: parseOverpassResponse,
          ...(signal === undefined ? {} : { signal }),
        });
      } catch (error: unknown) {
        if (error instanceof NetworkError && error.reason === 'aborted') throw error;
        lastError = error;
        console.warn(`Overpass endpoint failed, trying next: ${endpoint}`, error);
      }
    }
    throw lastError instanceof Error ? lastError : new Error('All Overpass endpoints failed');
  }
}

/** Rounded so a sub-metre nudge of the same area still hits the cache; rotation matters because features are in board metres. */
export function featureCacheKey(area: SelectedArea, marginMeters: number): string {
  return [
    'features-v1',
    area.centerLat.toFixed(5),
    area.centerLon.toFixed(5),
    String(Math.round(area.sizeMeters)),
    String(Math.round(area.rotationDeg) % 360),
    String(marginMeters),
  ].join('|');
}
