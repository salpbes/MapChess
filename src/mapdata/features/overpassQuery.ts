// WHAT: The one Overpass QL query MapChess sends per area.
// HOW:  A union of the tag filters for everything the board cares about,
//       inside a lat/lon bounding box, with `out geom` so way and relation
//       geometry comes back inline (no second request for nodes).
// WHY:  BUILD_PLAN Phase 7 — one query per area. Keeping the QL in a single
//       function with a documented filter list makes "why is X missing from
//       the board?" a one-file question.

import type { GeoBounds } from '@mapdata/model/MapArea';

/** Verified 2026-09-02 against overpass-api.de on all three fixture areas (D-024). */
export function buildOverpassQuery(bounds: GeoBounds, timeoutSeconds = 25): string {
  const bbox = [bounds.minLat, bounds.minLon, bounds.maxLat, bounds.maxLon]
    .map((v) => v.toFixed(6))
    .join(',');
  return `[out:json][timeout:${String(timeoutSeconds)}][bbox:${bbox}];
(
  way[waterway~"^(river|stream|canal|drain|ditch)$"];
  way[natural=water];relation[natural=water];way[landuse=reservoir];
  way[natural=coastline];
  way[natural=wood];way[landuse=forest];relation[natural=wood];relation[landuse=forest];
  way[natural~"^(scrub|heath|moor|wetland|grassland)$"];
  node[natural=peak];node[natural=saddle];way[natural~"^(ridge|arete|cliff)$"];
  node[ford];way[ford];
  node[place];
  node[historic];way[historic];
  node[amenity=place_of_worship];way[amenity=place_of_worship];
);
out geom;`;
}
