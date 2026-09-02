# `src/mapdata/` — real-world data acquisition

**Belongs here:** everything that talks to the outside world for map data and turns the response into clean, typed structures.

| Subfolder    | Responsibility                                                                                            |
| ------------ | --------------------------------------------------------------------------------------------------------- |
| `model/`     | Plain types and the projection: `SelectedArea`, `MapArea`, `AreaProjection`, `MapFeature`, `HeightField`. |
| `net/`       | `fetchJson` — the only way out to the network: timeout, retries, typed `NetworkError`.                    |
| `cache/`     | `RateLimiter` now; IndexedDB persistence for tiles and features from Phase 6.                             |
| `geocode/`   | `IGeocoder` + Nominatim place search (Phase 5).                                                           |
| `elevation/` | `IElevationProvider`: terrain tile fetch, RGB → metres decode, `HeightField` sampling.                    |
| `features/`  | `IFeatureProvider`: Overpass queries, normalisation into `MapFeature[]`.                                  |

**Rules:**

- Every network call has a timeout, a retry limit, and a user-visible failure state.
- Raw Overpass JSON and raw tile pixels never leave this folder.
- Ship offline fixture areas so development never depends on the network.

**Built in:** Phases 5–7.
