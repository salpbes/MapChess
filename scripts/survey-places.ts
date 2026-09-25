// WHAT: Measures candidate places for the curated list, against real data, and
//       prints a ranked table.
// HOW:  For each candidate: fetch the Terrarium tiles and decode them with
//       pngjs exactly as make-fixtures does, fetch the same Overpass query the
//       app sends, then run the real board build — buildTerrainInputs →
//       WarpedBoardLayout → classifyCellCover → buildCellFacts → buildBoardTheme.
//       Reports the relief across the 64 cells the player actually stands
//       pieces on, how many named places the gazetteer will have, and how many
//       kinds of ground the board will show.
// WHY:  A famous battle is not the same thing as a good board. Most fields were
//       chosen by their generals for being flat, and flat ground makes a board
//       indistinguishable from a chessboard. Measuring beats remembering:
//       the list includes places known to be flat as controls, and a method
//       that cannot tell them from Gettysburg is not worth trusting.
//
// Run: npx tsx scripts/survey-places.ts [name-filter]

import { PNG } from 'pngjs';

import { WarpedBoardLayout } from '@domain/board/WarpedBoardLayout';
import { buildBoardTheme } from '@domain/theme/buildBoardTheme';
import { buildTerrainInputs } from '@mapdata/board/buildTerrainInputs';
import { classifyCellCover } from '@mapdata/board/classifyCellCover';
import { assembleHeightField, tileKey } from '@mapdata/elevation/assembleHeightField';
import type { TileKey } from '@mapdata/elevation/assembleHeightField';
import { decodeTerrarium } from '@mapdata/elevation/terrarium';
import { TILE_SIZE, tileRangeFor, tilesIn, zoomForResolution } from '@mapdata/elevation/TileMath';
import { normalizeFeatures, parseOverpassResponse } from '@mapdata/features/normalizeOverpass';
import { buildOverpassQuery } from '@mapdata/features/overpassQuery';
import { describeArea, paddedBounds } from '@mapdata/model/MapArea';
import type { SelectedArea } from '@mapdata/model/SelectedArea';
import { buildCellFacts } from '@mapdata/theme/buildCellFacts';

const URL_TEMPLATE = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const UA = 'MapChess/0.0.1 (curated-place survey; https://github.com/salpbes/MapChess)';
const STEP_M = 10;
const MARGIN_M = 200;
const MIN_ZOOM = 10;
const MAX_ZOOM = 14;
const SIZE_M = 2000;

interface Candidate {
  readonly name: string;
  readonly era: string;
  readonly lat: number;
  readonly lon: number;
  /** Set on places picked BECAUSE they are flat, to check the method discriminates. */
  readonly control?: true;
  /** Measured as it will be offered: some boards are turned to face their story. */
  readonly rotationDeg?: number;
}

const CANDIDATES: readonly Candidate[] = [
  // Medieval and earlier
  { name: 'Battle (Hastings 1066)', era: 'medieval', lat: 50.9116, lon: 0.4874 },
  { name: 'Stirling (1297)', era: 'medieval', lat: 56.1244, lon: -3.947 },
  { name: 'Thermopylae (480 BC)', era: 'ancient', lat: 38.7961, lon: 22.5361 },
  { name: 'Morgarten (1315)', era: 'medieval', lat: 47.0986, lon: 8.6386 },
  { name: 'Castillon (1453)', era: 'medieval', lat: 44.8536, lon: 0.0361 },

  // 18th–19th century
  { name: 'Gettysburg (1863)', era: '19th', lat: 39.8064, lon: -77.235 },
  { name: 'Plains of Abraham (1759)', era: '18th', lat: 46.8009, lon: -71.216 },
  { name: 'Isandlwana (1879)', era: '19th', lat: -28.3597, lon: 30.6553 },
  { name: 'Lookout Mountain (1863)', era: '19th', lat: 35.0086, lon: -85.3389 },
  { name: 'Waterloo (1815)', era: '19th', lat: 50.68, lon: 4.4064 },

  // WW1
  // Turned so White's back rank is the beach: the first coordinate was offshore.
  { name: 'Anzac Cove, Gallipoli (1915)', era: 'ww1', lat: 40.24, lon: 26.2918, rotationDeg: 100 },
  { name: 'Fort Douaumont, Verdun (1916)', era: 'ww1', lat: 49.2108, lon: 5.4342 },
  { name: 'Vimy Ridge (1917)', era: 'ww1', lat: 50.3794, lon: 2.7739 },
  { name: 'Kobarid / Caporetto (1917)', era: 'ww1', lat: 46.2461, lon: 13.5789 },

  // WW2
  { name: 'Monte Cassino (1944)', era: 'ww2', lat: 41.4894, lon: 13.8139 },
  { name: 'Pointe du Hoc (1944)', era: 'ww2', lat: 49.3956, lon: -0.9894 },
  { name: 'Arnhem bridge (1944)', era: 'ww2', lat: 51.9775, lon: 5.9111 },
  { name: 'Mamayev Kurgan (1942)', era: 'ww2', lat: 48.7422, lon: 44.5372 },

  // Controls: chosen by their generals for being flat. If these score well, the
  // measurement is not measuring anything.
  { name: 'Agincourt (1415) [control]', era: 'medieval', lat: 50.4639, lon: 2.1339, control: true },
  { name: 'Culloden (1746) [control]', era: '18th', lat: 57.4778, lon: -4.0939, control: true },
  { name: 'El Alamein (1942) [control]', era: 'ww2', lat: 30.83, lon: 28.95, control: true },
];

async function fetchTile(z: number, x: number, y: number): Promise<Float32Array> {
  const url = URL_TEMPLATE.replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(y));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → HTTP ${String(res.status)}`);
  const png = PNG.sync.read(Buffer.from(await res.arrayBuffer()));
  return decodeTerrarium(new Uint8Array(png.data), TILE_SIZE * TILE_SIZE);
}

async function heightsFor(area: SelectedArea) {
  const map = describeArea(area);
  const zoom = zoomForResolution(STEP_M, area.centerLat, MIN_ZOOM, MAX_ZOOM);
  const half = area.sizeMeters / 2 + MARGIN_M;
  const corners = [
    map.projection.fromBoard({ x: -half, z: half }),
    map.projection.fromBoard({ x: half, z: half }),
    map.projection.fromBoard({ x: half, z: -half }),
    map.projection.fromBoard({ x: -half, z: -half }),
  ];
  const range = tileRangeFor(
    {
      minLat: Math.min(...corners.map((c) => c.lat)),
      maxLat: Math.max(...corners.map((c) => c.lat)),
      minLon: Math.min(...corners.map((c) => c.lon)),
      maxLon: Math.max(...corners.map((c) => c.lon)),
    },
    zoom,
  );
  const tiles = new Map<TileKey, Float32Array>();
  for (const t of tilesIn(range)) tiles.set(tileKey(t), await fetchTile(t.z, t.x, t.y));
  return assembleHeightField(map, range, tiles, { stepMeters: STEP_M, marginMeters: MARGIN_M });
}

/*
  The same two endpoints the app falls back between, and the same reason: the
  public instance answers a dense area with 504 under load and then serves the
  identical query on a retry. Without this the survey measures Overpass's
  Tuesday rather than the ground.
*/
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

async function overpass(area: SelectedArea) {
  const bounds = paddedBounds(describeArea(area), 200);
  const body = buildOverpassQuery(bounds);

  let last = 'no attempt made';
  for (let round = 0; round < 3; round += 1) {
    for (const endpoint of ENDPOINTS) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain', 'User-Agent': UA },
          body,
        });
        if (res.ok) return parseOverpassResponse(await res.json());
        last = `HTTP ${String(res.status)} from ${new URL(endpoint).host}`;
      } catch (error: unknown) {
        last = `${String(error)} from ${new URL(endpoint).host}`;
      }
      await new Promise((r) => setTimeout(r, 4000 * (round + 1)));
    }
  }
  throw new Error(`Overpass → ${last}`);
}

interface Result {
  readonly c: Candidate;
  readonly relief: number;
  readonly named: number;
  readonly covers: number;
  readonly water: boolean;
  readonly top: string;
}

async function measure(c: Candidate): Promise<Result> {
  const area: SelectedArea = {
    centerLat: c.lat,
    centerLon: c.lon,
    sizeMeters: SIZE_M,
    rotationDeg: c.rotationDeg ?? 0,
  };
  const heights = await heightsFor(area);
  const raw = await overpass(area);
  const features = normalizeFeatures(raw, describeArea(area).projection);

  const terrain = buildTerrainInputs(SIZE_M, heights, features);
  const layout = new WarpedBoardLayout(terrain);
  const cover = classifyCellCover(layout, features, heights);
  const { scale, baseMeters } = layout.terraceInfo;
  const yToMeters = (y: number) => (scale > 0 ? y / scale + baseMeters : baseMeters);
  const facts = buildCellFacts(layout, features, cover, { yToMeters });
  buildBoardTheme(facts);

  // The relief the PLAYER sees: across the 64 cells, not the whole tile.
  const cellHeights = facts.map((f) => f.heightMeters);
  const relief = Math.max(...cellHeights) - Math.min(...cellHeights);

  const named = new Set(
    features.map((f) => f.names.name).filter((n): n is string => n !== undefined),
  ).size;
  const covers = new Set(facts.map((f) => f.cover)).size;
  const water = facts.some((f) => f.cover === 'water') || facts.some((f) => f.coastal);
  const top = [
    ...new Set(features.map((f) => f.names.name).filter((n): n is string => n !== undefined)),
  ]
    .slice(0, 3)
    .join(', ');

  return { c, relief, named, covers, water, top };
}

async function main(): Promise<void> {
  const filter = process.argv[2]?.toLowerCase();
  const list =
    filter === undefined
      ? CANDIDATES
      : CANDIDATES.filter((c) => c.name.toLowerCase().includes(filter));

  const results: Result[] = [];
  for (const c of list) {
    try {
      const r = await measure(c);
      results.push(r);
      console.info(
        `${r.c.name.padEnd(32)} relief ${r.relief.toFixed(0).padStart(4)}m  ` +
          `named ${String(r.named).padStart(3)}  covers ${String(r.covers)}  ` +
          `${r.water ? 'water ' : '      '}| ${r.top}`,
      );
    } catch (error: unknown) {
      console.info(`${c.name.padEnd(32)} FAILED: ${String(error)}`);
    }
    // Overpass is a shared public service; do not hammer it.
    await new Promise((r) => setTimeout(r, 4000));
  }

  console.info('\n=== ranked by relief ===');
  for (const r of [...results].sort((a, b) => b.relief - a.relief)) {
    const flag = r.c.control === true ? '  <- CONTROL (expected flat)' : '';
    console.info(
      `${r.relief.toFixed(0).padStart(4)}m  named ${String(r.named).padStart(3)}  ` +
        `${r.c.era.padEnd(9)} ${r.c.name}${flag}`,
    );
  }
}

main().catch((error: unknown) => {
  console.error('FAILED:', error);
  process.exitCode = 1;
});
