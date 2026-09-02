# `src/mapdata/cache/` — persistence and rate limiting

| File               | Responsibility                                                                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RateLimiter.ts`   | Minimum-interval gate for shared services (Nominatim 1.1 s, Overpass 2 s).                                                                                                      |
| `KeyValueStore.ts` | `KeyValueStore<T>`: `IndexedDbStore<T>` (one DB, one object store per data kind, caller-supplied runtime guard, every error degrades to a miss) and `MemoryStore<T>` for tests. |

**Stores:** `elevation-tiles` (key `z/x/y` → `Float32Array`), `features` (key = rounded area → normalised `MapFeature[]`). Add a store by extending `STORES` and bumping `DB_VERSION`.

**Does not belong here:** knowledge of what the cached data means.
