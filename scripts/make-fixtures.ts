// WHAT: Generates the offline elevation fixtures in src/mapdata/elevation/fixtures/.
// HOW:  For each area in FIXTURE_AREAS: compute the tile range exactly as the
//       browser provider does, fetch the Terrarium PNGs (Node fetch), decode
//       with pngjs, run the shared assembleHeightField, and write a compact
//       JSON fixture. Re-run whenever FIXTURE_AREAS or the assembly changes.
// WHY:  Fixtures must be produced by the same code path the app uses, or a
//       fixture-passing test says nothing about the real thing. Only the PNG
//       decoder differs (pngjs here, canvas in the browser).
//
// Run: npm run make-fixtures

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PNG } from 'pngjs';

import { assembleHeightField, tileKey } from '@mapdata/elevation/assembleHeightField';
import type { TileKey } from '@mapdata/elevation/assembleHeightField';
import { FIXTURE_AREAS } from '@mapdata/elevation/fixtureAreas';
import { fieldToFixture } from '@mapdata/elevation/heightFieldFixture';
import type { Base64Codec } from '@mapdata/elevation/heightFieldFixture';
import { decodeTerrarium } from '@mapdata/elevation/terrarium';
import { TILE_SIZE, tileRangeFor, tilesIn, zoomForResolution } from '@mapdata/elevation/TileMath';
import { describeArea } from '@mapdata/model/MapArea';

// Keep in step with TerrariumElevationProvider defaults.
const URL_TEMPLATE = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const STEP_M = 10;
const MARGIN_M = 200;
const MIN_ZOOM = 8;
const MAX_ZOOM = 15;

const nodeBase64: Base64Codec = {
  encode: (bytes) => Buffer.from(bytes).toString('base64'),
  decode: (text) => new Uint8Array(Buffer.from(text, 'base64')),
};

const outDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'mapdata',
  'elevation',
  'fixtures',
);
mkdirSync(outDir, { recursive: true });

async function fetchTile(z: number, x: number, y: number): Promise<Float32Array> {
  const url = URL_TEMPLATE.replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(y));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → HTTP ${String(res.status)}`);
  const png = PNG.sync.read(Buffer.from(await res.arrayBuffer()));
  if (png.width !== TILE_SIZE || png.height !== TILE_SIZE) {
    throw new Error(
      `${url} is ${String(png.width)}×${String(png.height)}, expected ${String(TILE_SIZE)}²`,
    );
  }
  return decodeTerrarium(new Uint8Array(png.data), TILE_SIZE * TILE_SIZE);
}

for (const def of FIXTURE_AREAS) {
  const area = describeArea(def.area);
  const zoom = zoomForResolution(STEP_M, def.area.centerLat, MIN_ZOOM, MAX_ZOOM);
  const half = def.area.sizeMeters / 2 + MARGIN_M;
  const corners = [
    area.projection.fromBoard({ x: -half, z: half }),
    area.projection.fromBoard({ x: half, z: half }),
    area.projection.fromBoard({ x: half, z: -half }),
    area.projection.fromBoard({ x: -half, z: -half }),
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
  for (const t of tilesIn(range)) {
    tiles.set(tileKey(t), await fetchTile(t.z, t.x, t.y));
  }

  const field = assembleHeightField(area, range, tiles, {
    stepMeters: STEP_M,
    marginMeters: MARGIN_M,
  });
  const fixture = fieldToFixture(
    field,
    def.area,
    {
      name: def.name,
      description: def.description,
      source: `Terrarium z${String(zoom)}, ${String(tiles.size)} tiles, AWS Open Data (Mapzen/Tilezen), ${new Date().toISOString().slice(0, 10)}`,
    },
    nodeBase64,
  );
  const file = join(outDir, `${def.name}.json`);
  writeFileSync(file, JSON.stringify(fixture));
  console.info(
    `${def.name.padEnd(12)} z${String(zoom)} ${String(tiles.size)} tiles  ${String(field.cols)}×${String(field.rows)} @ ${String(STEP_M)} m  ${field.minMeters.toFixed(1)}…${field.maxMeters.toFixed(1)} m  → ${file}`,
  );
}
