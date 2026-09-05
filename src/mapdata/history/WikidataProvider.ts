// WHAT: Looks up what Wikidata records about the features OSM linked to it.
// HOW:  Collects the `wikidata` tags off the features, asks `wbgetentities` in
//       batches of 50, then asks once more for the labels of whatever those
//       answers pointed at. Rate-limited, cached per Q-id in IndexedDB, and
//       every failure resolves to an empty map rather than rejecting.
// WHY:  This is the only part of the board that is genuinely optional. The
//       game is playable without it, the board is complete without it, and a
//       Wikimedia outage must be invisible — so nothing here throws, and the
//       briefing simply says less. Wikidata is CC0, so nothing on screen owes
//       an attribution line for it.

import { RateLimiter } from '@mapdata/cache/RateLimiter';
import type { KeyValueStore } from '@mapdata/cache/KeyValueStore';
import type { MapFeature } from '@mapdata/model/MapFeature';
import { fetchJson } from '@mapdata/net/fetchJson';

import { isWikidataResponse, labelsOf, referencedIds, toFacts } from './historyFacts';
import type { HistoryFact, WikidataResponse } from './historyFacts';

export type HistoryFacts = ReadonlyMap<string, HistoryFact>;

export interface IHistoryProvider {
  /** Facts keyed by Q-id. Never rejects: an empty map means "nothing to add". */
  factsFor(features: readonly MapFeature[], signal?: AbortSignal): Promise<HistoryFacts>;
}

const ENDPOINT = 'https://www.wikidata.org/w/api.php';
/** `wbgetentities` accepts fifty ids per request. */
const BATCH = 50;
/** Courtesy gap between requests to a free service (D-024's rule, again). */
const MIN_INTERVAL_MS = 400;
const TIMEOUT_MS = 6000;

export class WikidataProvider implements IHistoryProvider {
  private readonly limiter = new RateLimiter(MIN_INTERVAL_MS);

  public constructor(private readonly cache: KeyValueStore<HistoryFact> | null = null) {}

  public async factsFor(
    features: readonly MapFeature[],
    signal?: AbortSignal,
  ): Promise<HistoryFacts> {
    const wanted = [...new Set(features.map((f) => f.wikidata).filter(isId))];
    if (wanted.length === 0) return new Map();

    const facts = new Map<string, HistoryFact>();
    const missing: string[] = [];
    for (const id of wanted) {
      const cached = await this.cached(id);
      if (cached === null) missing.push(id);
      else facts.set(id, cached);
    }
    if (missing.length === 0) return facts;

    try {
      const fetched = await this.lookup(missing, signal);
      for (const [id, fact] of fetched) {
        facts.set(id, fact);
        void this.cache?.put(id, fact);
      }
    } catch (error: unknown) {
      // Optional data: say so once and hand back whatever the cache had.
      console.warn('Wikidata lookup failed; the briefing will say less.', error);
    }
    return facts;
  }

  private async cached(id: string): Promise<HistoryFact | null> {
    if (this.cache === null) return null;
    try {
      return await this.cache.get(id);
    } catch (error: unknown) {
      console.warn(`Could not read cached history for ${id}.`, error);
      return null;
    }
  }

  private async lookup(ids: readonly string[], signal?: AbortSignal): Promise<HistoryFacts> {
    // Round one: the entities themselves, with their claims.
    const entities = await this.request(ids, 'claims|labels', signal);
    // Round two: "instance of" and heritage answer with Q-ids, not with words.
    const referenced = referencedIds(entities);
    const labels =
      referenced.length === 0
        ? new Map<string, string>()
        : labelsOf(await this.request(referenced, 'labels', signal));
    return toFacts(entities, labels);
  }

  private async request(
    ids: readonly string[],
    props: string,
    signal?: AbortSignal,
  ): Promise<WikidataResponse> {
    const merged: { entities: Record<string, unknown> } = { entities: {} };
    for (let i = 0; i < ids.length; i += BATCH) {
      await this.limiter.acquire();
      const url = new URL(ENDPOINT);
      url.searchParams.set('action', 'wbgetentities');
      url.searchParams.set('ids', ids.slice(i, i + BATCH).join('|'));
      url.searchParams.set('props', props);
      url.searchParams.set('languages', 'en');
      url.searchParams.set('format', 'json');
      // Wikimedia needs this to send CORS headers to a browser caller.
      url.searchParams.set('origin', '*');

      const page = await fetchJson<WikidataResponse>(url.toString(), {
        timeoutMs: TIMEOUT_MS,
        retries: 1,
        validate: (data) => {
          if (!isWikidataResponse(data)) throw new Error('not a Wikidata response');
          return data;
        },
        ...(signal === undefined ? {} : { signal }),
      });
      Object.assign(merged.entities, page.entities ?? {});
    }
    return merged as WikidataResponse;
  }
}

function isId(value: string | null): value is string {
  return value !== null;
}
