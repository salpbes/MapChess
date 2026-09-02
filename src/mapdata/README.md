# `src/mapdata/` — real-world data acquisition

**Belongs here:** everything that talks to the outside world for map data and turns the response into clean, typed structures.

| Subfolder    | Responsibility                                                                         |
| ------------ | -------------------------------------------------------------------------------------- |
| `elevation/` | `IElevationProvider`: terrain tile fetch, RGB → metres decode, `HeightField` sampling. |
| `features/`  | `IFeatureProvider`: Overpass queries, normalisation into `MapFeature[]`.               |
| `cache/`     | IndexedDB persistence and rate-limit guard for both providers.                         |
| `model/`     | Plain types shared by the above: `MapArea`, `MapFeature`, `HeightField`.               |

**Rules:**

- Every network call has a timeout, a retry limit, and a user-visible failure state.
- Raw Overpass JSON and raw tile pixels never leave this folder.
- Ship offline fixture areas so development never depends on the network.

**Built in:** Phases 5–7.
