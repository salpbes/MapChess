# `src/mapdata/features/` — rivers, coast, forests, peaks, names

**Belongs here:** `IFeatureProvider`, the single Overpass query per area (waterways, water bodies, coastline, forests/scrub, peaks/ridges, all `place=*` nodes with `name`, `old_name`, `historic`), and the normaliser that turns raw Overpass JSON into `MapFeature[]`.

**Does not belong here:** deciding what a feature _means_ for the game — that is `domain/theme/`.

**Rule:** Overpass is a free community service. Every request goes through the rate-limit guard in `cache/`. Develop against fixtures.

**Built in:** Phase 7.
