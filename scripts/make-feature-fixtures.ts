// WHAT: Generates the offline feature fixtures in src/mapdata/features/fixtures/.
// HOW:  For each FIXTURE_AREA: build the exact query the app sends, fetch it
//       from Overpass (with an identifying User-Agent — the public instance
//       returns 406 to generic ones), strip fields the normaliser never reads
//       (`nodes`, `bounds`) to shrink the file, and write the raw response.
//       Fixtures are raw Overpass JSON on purpose: the normaliser runs on them
//       at load time, so tests exercise the real parsing path.
// WHY:  Overpass is rate-limited and often down; development and Phase 8/10
//       tests must not depend on it. Two seconds between requests, as the
//       service asks.
//
// Run: npm run make-fixtures:features

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildOverpassQuery } from '@mapdata/features/overpassQuery';
import { describeArea, paddedBounds } from '@mapdata/model/MapArea';
import { FIXTURE_AREAS } from '@mapdata/model/fixtureAreas';

const ENDPOINT = 'https://overpass-api.de/api/interpreter';
const MARGIN_M = 200; // keep in step with OverpassFeatureProvider
const USER_AGENT = 'MapChess/0.0.1 (fixture generator; https://github.com/)';

const outDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'mapdata',
  'features',
  'fixtures',
);
mkdirSync(outDir, { recursive: true });

interface RawElement {
  nodes?: unknown;
  bounds?: unknown;
  [key: string]: unknown;
}

/** Overpass answers 429/504 when its per-IP slots are busy; wait and try again. */
async function fetchWithBackoff(query: string, label: string): Promise<Response> {
  const waits = [10000, 20000, 40000];
  for (let attempt = 0; ; attempt += 1) {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
      body: `data=${encodeURIComponent(query)}`,
    });
    if (res.ok) return res;
    const wait = waits[attempt];
    if ((res.status !== 429 && res.status !== 504) || wait === undefined) {
      throw new Error(
        `${label}: Overpass HTTP ${String(res.status)} ${(await res.text()).slice(0, 200)}`,
      );
    }
    console.warn(`${label}: HTTP ${String(res.status)}, waiting ${String(wait / 1000)} s…`);
    await new Promise((r) => setTimeout(r, wait));
  }
}

for (const def of FIXTURE_AREAS) {
  const area = describeArea(def.area);
  const query = buildOverpassQuery(paddedBounds(area, MARGIN_M));
  const started = Date.now();
  const res = await fetchWithBackoff(query, def.name);
  const json = (await res.json()) as { elements: RawElement[]; [key: string]: unknown };

  for (const el of json.elements) {
    delete el.nodes;
    delete el.bounds;
  }
  const slim = {
    version: json.version,
    generator: json.generator,
    osm3s: json.osm3s,
    mapchess: { area: def.area, marginMeters: MARGIN_M, fetchedAt: new Date().toISOString() },
    elements: json.elements,
  };

  const file = join(outDir, `${def.name}.json`);
  const text = JSON.stringify(slim);
  writeFileSync(file, text);
  console.info(
    `${def.name.padEnd(12)} ${String(json.elements.length).padStart(4)} elements  ${(text.length / 1024).toFixed(0).padStart(4)} KB  ${String(Date.now() - started)} ms  → ${file}`,
  );
  await new Promise((r) => setTimeout(r, 2000));
}
