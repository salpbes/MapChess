// WHAT: Runs the whole board build against real data for one place, and prints
//       whatever it fails with.
// WHY:  "This area will not load" is otherwise only reproducible by hand in a
//       browser. This is what found that a dense area's Overpass query comes
//       back 504 from the public instance and then succeeds on a retry — the
//       failure is the service's load, not anything about the place.
// HOW:  Fetches the same Overpass query and the same terrain tiles the app
//       does, then runs buildTerrainInputs → WarpedBoardLayout → cover → facts
//       → buildBoardTheme, which is exactly BoardComposer.tryCompose.
// Run: npx tsx scripts/probe-area.ts <lat> <lon> [name]

import { buildTerrainInputs } from '@mapdata/board/buildTerrainInputs';
import { classifyCellCover } from '@mapdata/board/classifyCellCover';
import { WarpedBoardLayout } from '@domain/board/WarpedBoardLayout';
import { buildBoardTheme } from '@domain/theme/buildBoardTheme';
import { normalizeFeatures, parseOverpassResponse } from '@mapdata/features/normalizeOverpass';
import { buildOverpassQuery } from '@mapdata/features/overpassQuery';
import { describeArea, paddedBounds } from '@mapdata/model/MapArea';
import { buildCellFacts } from '@mapdata/theme/buildCellFacts';
import { createHeightField } from '@mapdata/model/HeightField';
import type { SelectedArea } from '@mapdata/model/SelectedArea';

const UA = 'MapChess/0.0.1 (area probe; https://github.com/)';

async function overpass(area: SelectedArea) {
  const bounds = paddedBounds(describeArea(area), 200);
  const body = buildOverpassQuery(bounds);
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain', 'User-Agent': UA },
    body,
  });
  if (!res.ok) throw new Error(`Overpass ${String(res.status)}`);
  return parseOverpassResponse(await res.json());
}

async function main(): Promise<void> {
  const lat = Number(process.argv[2]);
  const lon = Number(process.argv[3]);
  const label = process.argv[4] ?? `${String(lat)},${String(lon)}`;
  const area: SelectedArea = { centerLat: lat, centerLon: lon, sizeMeters: 2000, rotationDeg: 0 };
  const map = describeArea(area);

  const raw = await overpass(area);
  const features = normalizeFeatures(raw, map.projection);
  console.info(
    `${label}: ${String(raw.elements.length)} elements → ${String(features.length)} features`,
  );

  /*
    A synthetic gentle slope rather than real tiles: the suspect is the feature
    pipeline, and this keeps the probe to one network service.
  */
  const n = 64;
  const step = 2400 / (n - 1);
  const data = new Float32Array(n * n);
  for (let r = 0; r < n; r += 1) {
    for (let c = 0; c < n; c += 1) data[r * n + c] = 40 + c * 0.6 + r * 0.25;
  }
  const heights = createHeightField(-1200, -1200, step, n, n, data);

  const terrain = buildTerrainInputs(2000, heights, features);
  const layout = new WarpedBoardLayout(terrain);
  const cover = classifyCellCover(layout, features, heights);
  const { scale, baseMeters } = layout.terraceInfo;
  const facts = buildCellFacts(layout, features, cover, {
    yToMeters: (y) => (scale > 0 ? y / scale + baseMeters : baseMeters),
  });
  buildBoardTheme(facts);
  console.info(`${label}: OK`);
}

main().catch((error: unknown) => {
  console.error('FAILED:', error);
  process.exitCode = 1;
});
