// WHAT: The one place worth calling a board by — the biggest settlement on it,
//       or failing that anything named at all.
// HOW:  Ranks every named `place` feature by its OSM settlement class, then
//       falls back to historic sites, churches and peaks. Ties break on the
//       name, so the same board always answers the same way.
// WHY:  A board is chosen by dragging a square across a map, so nothing in the
//       system knows what the player would call it — the coordinates are all
//       there is, and "40.9783, 39.8214" tells a player nothing about where
//       they are fighting. The features already fetched for the terrain know
//       the answer, so no reverse-geocode request is needed and it works
//       offline against the fixtures like everything else.

import type { MapFeature } from '@mapdata/model/MapFeature';

/** Settlement classes, largest first; anything unlisted ranks below them all. */
const SETTLEMENT_RANK: Readonly<Record<string, number>> = {
  city: 100,
  town: 90,
  village: 80,
  suburb: 75,
  hamlet: 70,
  locality: 50,
  isolated_dwelling: 40,
  farm: 35,
};

/** Used only when the board holds no named settlement whatsoever. */
const FALLBACK_RANK: Readonly<Record<MapFeature['kind'], number>> = {
  historic: 30,
  worship: 25,
  peak: 20,
  saddle: 10,
  place: 0,
  ridge: 0,
  ford: 0,
  waterway: 0,
  water: 0,
  coastline: 0,
  wood: 0,
  scrub: 0,
};

export function primaryPlaceName(features: readonly MapFeature[]): string | null {
  let best: { name: string; rank: number } | null = null;

  for (const feature of features) {
    const name = feature.names.name ?? feature.names.oldName;
    if (name === undefined || name.length === 0) continue;

    const rank =
      feature.kind === 'place'
        ? (SETTLEMENT_RANK[feature.subtype ?? ''] ?? 45)
        : FALLBACK_RANK[feature.kind];
    if (rank === 0) continue;

    // Same rank, same answer every time: the earlier name alphabetically wins.
    if (best === null || rank > best.rank || (rank === best.rank && name < best.name)) {
      best = { name, rank };
    }
  }

  return best?.name ?? null;
}
