# `src/mapdata/cache/` — persistence and rate limiting

| File             | Responsibility                                                                                                             |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `RateLimiter.ts` | Minimum-interval gate for shared services (Nominatim now, Overpass in Phase 7).                                            |
| `TileCache.ts`   | `ITileCache`: key → `Float32Array`. `IndexedDbTileCache` (every error degrades to a miss) and `MemoryTileCache` for tests. |

**Does not belong here:** knowledge of what the cached data means. This layer stores and retrieves opaque typed arrays.

**Phase 7** adds a second store for normalised features, keyed by area.
