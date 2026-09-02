# `src/mapdata/model/` — map data types and the projection

**Belongs here:** plain TypeScript types and the one piece of geometry every map layer shares.

| File                | Responsibility                                                                                       |
| ------------------- | ---------------------------------------------------------------------------------------------------- |
| `SelectedArea.ts`   | `SelectedArea { centerLat, centerLon, sizeMeters, rotationDeg }`, `LatLon`, validation.              |
| `AreaProjection.ts` | lat/lon ↔ local metres ↔ board frame (`BoardPoint`), applying the rotation. **The** axis convention. |
| `MapArea.ts`        | `describeArea()` → four board corners (named a1/h1/h8/a8, not by compass), bounding box, ring.       |

Later: `MapFeature` (normalised OSM feature in board metres) and `HeightField` (grid of metres).

**The orientation rule (D-007) lives here:** `rotationDeg` is the bearing of the board's north edge; the board frame is +X east (files a→h), +Z south (White), Y up. Nothing above this folder thinks about latitude.

**Does not belong here:** fetching, caching, or three.js vectors.
