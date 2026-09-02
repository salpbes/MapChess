// WHAT: The place-search seam and the Nominatim implementation.
// HOW:  `IGeocoder.search(query)` → a short list of named places with a centre
//       point. `NominatimGeocoder` calls the public OSM Nominatim endpoint via
//       fetchJson (timeout, retry) behind a 1 req/s RateLimiter, as its usage
//       policy demands. `parseNominatim` is exported so the response shape is
//       unit-tested against a captured fixture.
// WHY:  The picker needs "take me to Lindisfarne"; nothing else in the app
//       cares how. Raw Nominatim JSON never leaves this file.

import { RateLimiter } from '@mapdata/cache/RateLimiter';
import type { LatLon } from '@mapdata/model/SelectedArea';
import { fetchJson } from '@mapdata/net/fetchJson';

export interface PlaceResult {
  readonly name: string;
  /** Full human-readable address line. */
  readonly displayName: string;
  readonly center: LatLon;
}

export interface IGeocoder {
  search(query: string, signal?: AbortSignal): Promise<readonly PlaceResult[]>;
}

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const MAX_RESULTS = 6;
/** Nominatim usage policy: absolute maximum of one request per second. */
const MIN_INTERVAL_MS = 1100;

export class NominatimGeocoder implements IGeocoder {
  private readonly limiter = new RateLimiter(MIN_INTERVAL_MS);

  public async search(query: string, signal?: AbortSignal): Promise<readonly PlaceResult[]> {
    const q = query.trim();
    if (q === '') return [];

    await this.limiter.acquire();
    const params = new URLSearchParams({
      q,
      format: 'jsonv2',
      limit: String(MAX_RESULTS),
      addressdetails: '0',
    });
    return fetchJson(`${NOMINATIM_URL}?${params.toString()}`, {
      timeoutMs: 8000,
      retries: 1,
      validate: parseNominatim,
      ...(signal === undefined ? {} : { signal }),
    });
  }
}

/** Accepts the array Nominatim returns; skips entries missing the fields we need. */
export function parseNominatim(data: unknown): PlaceResult[] {
  if (!Array.isArray(data)) {
    throw new TypeError('Nominatim response is not an array');
  }
  const out: PlaceResult[] = [];
  for (const item of data) {
    if (typeof item !== 'object' || item === null) continue;
    const rec = item as Record<string, unknown>;
    const lat = Number(rec.lat);
    const lon = Number(rec.lon);
    const displayName = typeof rec.display_name === 'string' ? rec.display_name : '';
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || displayName === '') continue;
    const name =
      typeof rec.name === 'string' && rec.name !== ''
        ? rec.name
        : (displayName.split(',')[0] ?? displayName);
    out.push({ name, displayName, center: { lat, lon } });
  }
  return out;
}
