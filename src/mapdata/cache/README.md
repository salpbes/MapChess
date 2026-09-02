# `src/mapdata/cache/` — persistence and rate limiting

**Belongs here:** IndexedDB storage for decoded height fields and normalised features (keyed by area), and the rate-limit guard that throttles outbound requests to Overpass and the tile server.

**Does not belong here:** knowledge of what the cached data means. This layer stores and retrieves opaque typed blobs.

**Do not build before:** the Phase 6 elevation spike has passed.

**Built in:** Phase 6 (elevation), extended in Phase 7 (features).
