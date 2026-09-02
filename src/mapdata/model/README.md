# `src/mapdata/model/` — map data types

**Belongs here:** plain TypeScript types with no behaviour:

- `SelectedArea { centerLat, centerLon, sizeMeters, rotationDeg }`
- `MapArea` — the selected area plus derived local-metre corners
- `MapFeature` — normalised OSM feature (kind, geometry in local metres, names)
- `HeightField` — grid of metres with sampling metadata

Also the projection helpers: lat/lon ↔ local metres, and the board-orientation rule (south edge = White's back rank, file a = west).

**Does not belong here:** fetching, caching, or three.js vectors.

**Built in:** Phase 5.
