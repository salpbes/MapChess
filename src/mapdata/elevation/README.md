# `src/mapdata/elevation/` — ground shape

**Belongs here:** `IElevationProvider`, the Terrarium tile fetcher, the RGB → metres decoder, tile assembly into one `HeightField`, and `sampleHeight(x, y)` / `sampleStats(polygon)`.

**Before anything else is written here:** the Phase 6 spike — fetch one tile in the browser, decode it, print min/max metres. If the URL pattern, CORS headers or coverage fail, switch to Mapbox Terrain-RGB and record it in `docs/DECISIONS.md`.

**Built in:** Phase 6.
