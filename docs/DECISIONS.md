# MapChess — Decisions

A short record of every non-obvious choice. One entry per decision; newest at the bottom. Never delete an entry — if a decision is reversed, add a new entry that supersedes it.

---

## D-001 — Board area: 2 km per side

**Date:** 2026-09-02 · **Phase:** 0

**Decision:** The selected real-world square is 2000 m per side, fixed. Each of the 64 cells therefore averages ~250 m across before warping.

**Why:** 1 km is town-scale — a single village fills the board and hills are too subtle at 30 m elevation resolution. 3 km is landscape-scale — settlements collapse into single cells and rivers become thin. 2 km is the point where a river valley, a couple of named places and a ridge all fit and stay recognisable.

**Rejected:** a user-adjustable slider. It adds UI, and every layout constant (attraction radii, minimum cell area, vertical exaggeration) would need to scale with it. Revisit only if 2 km proves wrong in Phase 8 across the three fixture areas.

## D-002 — Art style: stylised low-poly

**Date:** 2026-09-02 · **Phase:** 0

**Decision:** Flat-shaded geometry, a restrained palette, no photographic textures.

**Why:** 30 m terrain data is coarse; a naturalistic look would expose that. Low-poly also keeps the board legible — BUILD_PLAN §8: when landscape and readability conflict, the board wins. It is also cheap to render, which matters once 64 terraced platforms, water and labels are on screen.

## D-003 — Desktop first, mobile later

**Date:** 2026-09-02 · **Phase:** 0

**Decision:** Build for mouse and keyboard. Use pointer events (not mouse events) and avoid hover-only affordances so a touch pass in Phase 12 is cheap, but do not test on mobile before then.

## D-004 — Repository lives at the workspace root

**Date:** 2026-09-02 · **Phase:** 0

**Decision:** BUILD_PLAN §4 draws a `mapchess/` root folder. The workspace folder `MapChess/` _is_ that root; there is no nested project folder.

## D-005 — Toolchain versions and lint enforcement of layering

**Date:** 2026-09-02 · **Phase:** 0

**Decision:** TypeScript 6 (`strict` plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), Vite 8, Vitest 4, three.js r185, chess.js 1.4, ESLint 10 flat config with typescript-eslint `strictTypeChecked`.

The rule "`domain/` never imports three.js and never touches the DOM" is enforced by ESLint (`no-restricted-imports` and `no-restricted-globals` scoped to `src/domain/**`), not by convention.

**Why:** the layering rule is what keeps the chess game headless-testable, and it will be tested most in Phase 8 when board geometry and rendering are being built side by side. A lint error is cheaper than discovering the leak later.

## D-006 — Path aliases per layer

**Date:** 2026-09-02 · **Phase:** 0

**Decision:** `@app/*`, `@domain/*`, `@mapdata/*`, `@world/*`, `@game/*`, `@ai/*`, `@ui/*`, `@shared/*`, declared in both `tsconfig.json` and `vite.config.ts`.

**Why:** an import line that reads `from '@world/scene/Camera'` states which layer it crosses into. That makes the lint layering rules simple to write, and makes a `domain/` file importing `@world/` visibly wrong in review.

## D-007 — Board orientation convention

**Date:** 2026-09-02 · **Phase:** 0 (implemented in Phase 5)

**Decision:** Recorded now so it is never re-derived: **the south edge of the selected area is White's back rank, and file a is west.** After the area's rotation is applied, "south" means the edge of the rotated square that faces the player when the picker's arrow points up.

Coordinate mapping (three.js is Y-up): longitude → +X (east), latitude → −Z (north), elevation → +Y. Converted once in `mapdata/model/`; every layer above it works in local metres, Y-up.

**Why:** piece placement, default camera, and move-animation direction all read this one rule. Stating it before any of them exist prevents three slightly different interpretations.

## D-008 — One three.js unit is one metre

**Date:** 2026-09-02 · **Phase:** 1

**Decision:** World coordinates are board-local metres. The 2 km board is 2000 units wide; a cell is 250 units. Camera near/far, orbit limits, light positions and skirt depth are all derived from `BoardBounds`, never written as literals.

**Why:** elevation arrives in metres (Phase 6). Any other unit means a scale factor that has to be applied in exactly the right places, and forgotten in one of them. Deriving camera constants from bounds means the warped board, whatever its height range, frames itself.

**Rejected:** normalising the board to 8 units (one per cell). Convenient for a flat board, wrong the moment real heights arrive.

## D-009 — Polygon winding: counter-clockwise viewed from above, north up

**Date:** 2026-09-02 · **Phase:** 1

**Decision:** `Cell.polygon` is wound counter-clockwise when viewed from +Y looking down with −Z (north) at the top of the screen. `signedArea()` returns a positive number for this winding. Flat cells list corners SW → SE → NE → NW.

**Why:** three.js treats counter-clockwise as front-facing. Matching that convention in the domain means `CellBuilder` can emit the polygon's vertices straight into a triangle fan with no reordering, and Phase 8's convexity check is simply "every consecutive cross product has the same sign".

## D-010 — Cells are merged into one mesh per shade

**Date:** 2026-09-02 · **Phase:** 1

**Decision:** `CellBuilder` builds a prism per cell (flat top + skirt), then merges all light cells into one geometry and all dark cells into another. The board is two draw calls.

**Consequence:** individual cells are not separate `Object3D`s. Phase 3's raycast picking will map a hit triangle index back to a square, or use a separate invisible pick layer. Recorded so this is not a surprise then.

**Why:** BUILD_PLAN §6 Phase 9 — "merge geometry by material, no thousands of draw calls". Starting merged means the warped board (up to ~64 × 3 × (n+2n) triangles, still trivial) never gets a chance to become 64+ draw calls.

## D-011 — Domain chess vocabulary is human-readable, chess.js stays inside one file

**Date:** 2026-09-02 · **Phase:** 2

**Decision:** The domain speaks `'white' | 'black'` and `'pawn' | … | 'king'`, not chess.js's `'w'`/`'p'`. Translation happens only in `src/domain/chess/chessJsAdapter.ts`. No other file imports `chess.js`.

`Move` carries derived facts a renderer needs — `capturedSquare` (differs from `to` for en passant) and `castle.rookFrom/rookTo` — so Phase 3 animates without knowing any rules.

**Why:** Phase 10 reads "rook" and "bishop" to assign identities; a `'r'` there would be a bug magnet. And confining chess.js to one adapter keeps the swap cost, if ever needed, to one file.

## D-012 — Illegal moves are typed errors with a reason, not booleans

**Date:** 2026-09-02 · **Phase:** 2

**Decision:** `IChessEngine.move()` throws `IllegalMoveError` with a `reason` union (`'promotion-required'`, `'not-your-turn'`, `'game-over'`, …). `isLegal()` exists for the boolean case. The engine validates against its own legal-move list _before_ calling chess.js, so chess.js's generic "Invalid move" never surfaces.

**Why:** BUILD_PLAN §5 forbids silent catches, and the UI needs to say _why_ — "choose a promotion piece" is a prompt, "not your turn" is a hint, "game over" is a state. A `false` cannot carry that.

## D-013 — Procedural low-poly pieces instead of GLB models

**Date:** 2026-09-02 · **Phase:** 3

**Decision:** Pieces are generated in code (`PieceGeometry.ts`): lathe profiles for all six types, an extruded silhouette head for the knight, a cross for the king, a shared plinth disc wider than the body. Behind `IPieceMeshFactory`, so a GLB loader can replace them without touching `PieceLayer` or the game.

**Why:** No licence to verify, no download, fits the low-poly style (D-002), and the origin is at the feet by construction so the bounding-box offset the plan warns about is not needed. Profiles are data — the look is tuned by editing numbers.

**Rejected:** sourcing third-party GLBs (licence provenance cannot be verified from inside this workflow); crude cylinder placeholders (would need redoing).

## D-014 — `game/` talks to the world through `IBoardView`

**Date:** 2026-09-02 · **Phase:** 3

**Decision:** `GameLoop` depends on `IBoardView` (show position, play move, highlights) and `IPromotionChooser`, not on `PieceLayer`/`HighlightLayer`/`MoveAnimator` directly. `world/pieces/BoardView.ts` implements it.

**Why:** keeps three.js out of `game/`, which makes the whole click → move → animate state machine unit-testable with a fake view (`tests/game/GameLoop.test.ts`). It also means Phase 4's AI player and Phase 11's undo are changes to `GameLoop` only.

## D-015 — Cell picking by point-in-polygon, not per-cell objects

**Date:** 2026-09-02 · **Phase:** 3

**Decision:** `BoardPicker` raycasts the merged cell meshes, takes the hit point's (x, z), and finds the `Cell` whose polygon contains it (`domain/board/polygon.containsPoint`). Piece hits resolve through `PieceLayer.squareOf`.

**Why:** resolves the D-010 consequence without un-merging the board or maintaining a triangle → square table. Exact because cells tile without overlap, and layout-agnostic — the warped board is picked correctly with no changes.

## D-016 — Shadows on from Phase 3

**Date:** 2026-09-02 · **Phase:** 3

**Decision:** One directional shadow-casting light with an orthographic shadow camera sized from `BoardBounds` (2048² map). Cells receive, pieces cast and receive.

**Why:** upright pieces on a flat-shaded board float visually without a contact shadow. Sizing the frustum from bounds means the warped board needs no retuning. Frame-rate cost is measured in Phase 9 alongside the terrain; if it bites, the map size is one constant.

## D-017 — Engine: `stockfish` npm package, lite single-threaded build, copied to `public/engine/`

**Date:** 2026-09-02 · **Phase:** 4

**Decision:** Use `stockfish-18-lite-single.js/.wasm` from the `stockfish` npm package (nmrugg, Stockfish 18, ≈7 MB). `scripts/copy-engine.mjs` copies the glue, the wasm and the licence into `public/engine/` on `postinstall`, `predev` and `prebuild`. The folder is git-ignored.

**Verified before building on it:** the BUILD_PLAN names `stockfish.wasm` (niklasf). Its README requires WebAssembly threads and `SharedArrayBuffer`, i.e. COOP/COEP headers — exactly what §3 says to avoid. The nmrugg package ships explicit single-threaded builds and its README recommends the lite single build for browser use. Probed under Node: responds to `uci`, exposes `Skill Level 0–20`, `UCI_LimitStrength`, `UCI_Elo 1320–3190`, `Threads max 1`.

**Why copy rather than import:** the Emscripten glue resolves its `.wasm` as a sibling of its own URL. Letting Vite bundle and hash the JS would break that lookup; a 7 MB binary also does not belong in git.

**Licence:** Stockfish is GPL-3.0. It runs as a separate worker binary communicating over UCI, the licence file ships beside it, and Phase 12 must add a visible credit and source link. If MapChess is ever to be distributed under a non-GPL licence, this is the decision to revisit.

**Rejected:** `stockfish.wasm` (needs SAB); the full 40+ MB single build (slow first load for no benefit against a human); asm.js fallback (slow and weak).

## D-018 — The engine is trusted but verified; failures degrade to a legal fallback

**Date:** 2026-09-02 · **Phase:** 4

**Decision:** `GameLoop` checks every engine reply with `IChessEngine.isLegal` before playing it. On an illegal reply, a timeout, a crash or a stale reply after `newGame()`, it emits `ai-error` and plays a fallback (first capture, else first legal move). Every engine wait in `StockfishAI` has a timeout (think time + 4 s grace; 30 s for the handshake).

**Why:** BUILD_PLAN Phase 4 — "it always plays a legal move" and §5 — every external call has a timeout and a user-visible failure state. The guard costs one legal-move lookup per AI move and means a broken engine download produces a weak opponent, not a frozen game.

## D-019 — Picker basemap: OpenFreeMap; MapLibre worker registered explicitly

**Date:** 2026-09-02 · **Phase:** 5

**Decision:** The 2D picker uses MapLibre GL JS 6 with the OpenFreeMap "liberty" vector style (`https://tiles.openfreemap.org/styles/liberty`): free, no API key, OSM data, attribution rendered by the map itself.

MapLibre 6 finds its worker with `new URL('./maplibre-gl-worker.mjs', import.meta.url)`. Under Vite that resolves to the wrong place both in dev (dependency pre-bundling) and in production (bundling), so the map silently never loads tiles — no error, just a blank map. Fix: import the worker through Vite (`maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url`) and call `setWorkerUrl()` once. Verified in dev and with `vite preview`.

**Rejected:** MapLibre demo tiles (country outlines only, useless at 2 km); raw OSM tile server (tile usage policy discourages app use); Mapbox/MapTiler (keys).

## D-020 — Place search: Nominatim behind `IGeocoder`, rate-limited

**Date:** 2026-09-02 · **Phase:** 5

**Decision:** Search uses the public OSM Nominatim API (`jsonv2`, max 6 results) via `fetchJson` (8 s timeout, 1 retry) behind a `RateLimiter` at 1.1 s between requests, search-on-submit only (no autocomplete), as its usage policy requires. Raw responses are parsed in one exported function with a captured fixture test.

**Why:** free and OSM-native. The seam means Photon or a self-hosted instance is a one-file swap. The rate limiter is a class in `mapdata/cache/` because Overpass (Phase 7) needs the same guard.

## D-021 — The picker draws the board footprint from `describeArea()`

**Date:** 2026-09-02 · **Phase:** 5

**Decision:** The square on the map is a GeoJSON polygon rebuilt from `describeArea()` on every change, with the a1→h1 edge (White's back rank) drawn as a separate heavy white line. Dragging inside the square moves it; dragging elsewhere pans; a slider sets `rotationDeg`.

**Why:** one geometry, not two. What the player sees is exactly the footprint Phases 6–8 will fill, so the picker and the board cannot disagree about where the board is or which side is White.

## D-022 — Elevation source: Terrarium tiles on AWS Open Data (spike passed)

**Date:** 2026-09-02 · **Phase:** 6

**Decision:** `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`, zoom chosen for ~10 m ground pixels (z14 in the UK), decoded as `R·256 + G + B/256 − 32768`.

**Spike result (before any code was written):** GET returns 256² RGB PNG, `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods: GET`, ~55–130 KB per tile, 170–460 ms. Decoded in-browser for four areas: Lindisfarne −22 … 18 m (tile includes sea), Rievaulx 67 … 205 m, Glen Coe 98 … 918 m, Zermatt 1515 … 2970 m. URL pattern, CORS and coverage all confirmed; the Mapbox fallback was not needed.

**Pipeline:** the board-aligned `HeightField` is produced by resampling the tile mosaic at board grid points (board → lat/lon → fractional tile pixel, bilinear). One pass handles rotation and Mercator distortion, so nothing downstream sees tiles. A tile that fails after retries reads as 0 m and is logged, rather than failing the board.

**Caveat:** Terrarium is ~30 m source data (SRTM/others) resampled; z14 pixels are finer than the data. It is smooth, not sharp — fine for a board of 250 m cells.

## D-023 — Fixtures are generated by the same code path as the app

**Date:** 2026-09-02 · **Phase:** 6

**Decision:** `npm run make-fixtures` (`scripts/make-fixtures.ts`) fetches real tiles under Node, decodes with `pngjs`, and runs the _same_ `assembleHeightField` the browser uses. Output: `src/mapdata/elevation/fixtures/{lindisfarne,rievaulx,glencoe}.json`, Int16 decimetres base64 (155 KB each, 42–100 KB gzipped), code-split so they download only when their area is selected. `FixtureElevationProvider` serves them for a matching `SelectedArea` and delegates everything else.

**Why:** a fixture produced by a different path proves nothing. Only the PNG decoder differs between Node and browser, and the Terrarium formula is unit-tested against hand-built pixels. The three areas are BUILD_PLAN's flat coastal / river valley / hilly, and are the input to Phase 8's invariant tests.

## D-024 — Features: one Overpass query, `out geom`, normalised to a closed kind list

**Date:** 2026-09-02 · **Phase:** 7

**Decision:** One Overpass QL union per area (bbox = board + 200 m) for waterways, water bodies, coastline, wood/forest, scrub/heath/moor/wetland, peaks, saddles, ridges/cliffs, fords, `place=*`, `historic=*` and places of worship, with `out geom` so way and relation geometry arrives inline. Normalised into twelve `FeatureKind`s; closed ways are polygons only for area kinds; historic/worship/ford/peak/place areas collapse to a centre point; multipolygon relations contribute one polygon per outer ring, inner rings dropped.

**Probe results (before code):** Rievaulx 265 KB / 1.7 s / 107 elements; Lindisfarne 100 KB / 92; Glen Coe 220 KB / 98. Names found: all three have `name`; Glen Coe has Gaelic `name:gd`; `old_name` appeared on the first non-fixture area tried (Malham: Cawden/Cowden, Langscar/Lanscar). Coverage is patchy exactly as BUILD_PLAN §1 warns.

**Operational facts learned:** overpass-api.de returns **406** to generic User-Agents (Node's default) — browsers are fine, scripts must identify themselves; it returns **429/504** when its per-IP slots are busy, which happened three times in a row while generating fixtures. Hence: 2 s rate limiter, 30 s timeout, IndexedDB cache keyed by rounded area, endpoint failover (overpass-api.de → overpass.private.coffee), and a fixture-first provider.

**Rejected:** clipping geometry to the board here (Phase 8 needs a margin and will clip itself); a bridge/crossing kind derived from highway×waterway intersections (buildings-adjacent and expensive; `ford` covers Phase 10's "crossing" for now); caching raw JSON (would let it leak beyond `features/`).

## D-025 — Feature fixtures are raw Overpass responses, slimmed

**Date:** 2026-09-02 · **Phase:** 7

**Decision:** `src/mapdata/features/fixtures/*.json` hold the actual Overpass response for each fixture area with `nodes` and `bounds` stripped (50–130 KB; 11–26 KB gzipped, code-split). `FixtureFeatureProvider` parses and normalises them with the production functions at load time. The three areas are the same `FIXTURE_AREAS` list as elevation, now in `mapdata/model/fixtureAreas.ts`.

**Why:** raw fixtures make the tests exercise the normaliser on real tagging, not on my idea of it. Keeping the raw files inside `features/` honours "raw Overpass JSON never leaves this folder". Sharing the area list guarantees heights and features describe the same ground.

## D-026 — Lattice warp: snap to axis-aligned lines only, repair by blending back

**Date:** 2026-09-02 · **Phase:** 8

**Decision:** `warpLattice` runs three rounds of attract → relax → cap/pin, then a repair loop. Two rules came out of tuning ("expect two or three attempts" — this was attempt three):

1. **Line pull is a snap, not a spring, and only within half a cell.** A vertex within the 0.35-cell cap of a river moves fully onto it; between 0.35 and 0.5 the pull fades; beyond 0.5 nothing. The first version (pull ∝ 1 − d/R with R = 0.9) moved vertices only ~15 % of the way and squeezed cells from both sides. Half a cell means only the nearer lattice line ever reaches a feature.
2. **Pull strength is weighted by the segment's axis alignment** (1 on-axis, 0 at 45°). A quad grid can only trace a river along its edges when the river runs roughly with a lattice axis; a diagonal river pulled onto vertices becomes a staircase that is worse than leaving it. Measured on synthetic rivers: a N–S meander went from 44 m mean distance-to-edge (flat) to 8 m; a 45° river is untouched.

Point attractors slide their cell toward the feature (50 %) and push its corners out (0.18 cells), so a village near an edge ends inside the cell rather than still on the edge.

**Repair:** any quad that is flipped, non-convex, under 0.5 cell² or with inradius under 0.30 cells has its four corners blended 50 % toward their grid positions, repeatedly (max 40 passes), then hard-reset if still bad. The grid is valid, so this always converges. The inradius floor equals the piece plinth radius (also lowered to 0.30 in `PieceGeometry`), so every cell can hold a full-size piece by construction — BUILD_PLAN §2's "piece size stays constant".

**Rejected:** the prototype's single-pass spring pull (too weak); scaling pieces to cells (forbidden by the plan); a Voronoi/watershed board (not chess).

## D-027 — Vertical exaggeration: 17 % of width, but flat areas stay gentle

**Date:** 2026-09-02 · **Phase:** 8

**Decision:** Platform height per cell = mean of the cell's heights, or the minimum if max − min > 12 m (one piece-base height). Total relief across the board is scaled to 17 % of board width — unless the real relief is under 25 m, in which case it is scaled to at most 5 % × (relief / 25 m). Glen Coe (830 m real) becomes 340 m of platform relief; Lindisfarne (≈20 m) becomes ≈30 m.

**Why:** BUILD_PLAN §2's 15–20 % clamp, plus §8's warning that flat areas "look like nothing" — but stretching 2 m of tidal flat to 340 m would look like a mistake. The flat cap keeps Lindisfarne honest; Phase 10 leans on water and names there instead.

## D-028 — Runtime layout swap lives in `BoardComposer` (app) + `BoardScene` (world)

**Date:** 2026-09-02 · **Phase:** 8

**Decision:** `app/BoardComposer` holds the latest heights and features for the current area and emits a `FlatBoardLayout` immediately, then a `WarpedBoardLayout` when both have arrived (a generation counter drops stale results). `world/builders/BoardScene` applies a layout to the running scene: rebuilds cells, repoints `PieceLayer`/`HighlightLayer`/`BoardPicker`, rebuilds the debug overlay, reframes camera/controls/lights.

**Verified:** nothing in `game/`, `domain/chess/`, `ai/` or `world/pieces/` changed for the swap beyond adding `setLayout()` to three classes. `?debug` toggles flat/warped on the same terrain.
