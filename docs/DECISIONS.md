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

## D-029 — Inside the board the terraces are the ground; the terrain mesh is a margin

**Date:** 2026-09-02 · **Phase:** 9

**Decision:** `TerrainBuilder` draws the `HeightField` (every second sample, exaggerated with the layout's own scale) but drops every triangle whose centre lies inside the board footprint. Cell skirts extend down to below the lowest surrounding ground (`skirtDepthFor`), so the board's cut edge meets the landscape with no gap.

**Why:** a continuous terrain under mean-height platforms pokes through them wherever the ground is above the platform, and z-fights where it is level. Removing it makes the terraces read unambiguously as the playing surface, and the surrounding true relief tells you what was flattened. Water ribbons use platform height inside the board and terrain height outside for the same reason.

**Rejected:** rendering terrain everywhere with platforms slightly raised (floating pieces); terrain-only with no terraces (unreadable board — BUILD_PLAN §8, readability wins).

## D-030 — Land-cover colouring keeps the checkerboard

**Date:** 2026-09-02 · **Phase:** 9

**Decision:** Each cell is classified as grass / wood / scrub / water / sand from the feature polygons (centroid counts 3, corners 1 each; majority wins) or, on coastal boards, from mean elevation < 1.5 m. Every cover has a light and a dark variant so the a1-dark checker pattern survives; risers are one earth colour; every platform edge gets a thin dark outline.

**Why:** a cell must read both as "forest" and as "a dark square". Two shades per cover does both; the outline covers the case where neighbouring cells share a cover and a shade would otherwise be the only cue. Merged by (cover, shade) so the whole board is at most a dozen draw calls.

## D-031 — Piece identities: per-colour halves, two-pass greedy, knights before bishops

**Date:** 2026-09-02 · **Phase:** 10

**Decision:** Each colour draws its sixteen identities from the 32 cells of its own half (ranks 1–4 / 5–8). Each piece type has a scorer with a primary rule and terrain-only fallbacks (rook: summit → ridge → headland → highest ground; bishop: place of worship → religious name → historic → old name → wood; knight: ford → pass → horse/cattle/crossing name → stream → moor; king/queen: settlement rank → historic → named; pawns: minor places → named → borrowed → low ground). Assignment is two-pass: every piece with a strong match (≥ 600) takes it first; the rest fill from what is left. Within a pass, knights pick before bishops.

**Why:** a single greedy pass let a knight's weak fallback ("any named cell") take the church before the bishop was considered, and let the second bishop take the only ford. Two passes fix both without a global optimiser, and stay deterministic and explainable ("the summit of Ashberry Hill, 99 m").

**Rejected:** identities tied to the piece's home square's own cell (a1 is rarely a peak); a global assignment solver (correct but opaque — the reason string matters more than optimality).

## D-032 — Cell names are unique across the board; borrowed and generated names are phrased, not embedded

**Date:** 2026-09-02 · **Phase:** 10

**Decision:** After the fallback chain, a uniqueness pass keeps one cell per duplicate name (the one holding the named point feature, else the first) and re-names the others with height-relative or positional words ("Upper Abbot Hagg Wood", "Abbot Hagg Wood Edge"; "Above River Rye", "Beside River Rye"). Reason strings append "at X" / "of X" only for real names; borrowed and generated names would read as nonsense there.

**Why:** a wood spanning six cells and a river along eight gave eight pawns the same name and produced "the ridge at Near Nessend". Unique names make the reveal legible and give Phase 11's move list something to say.

## D-033 — Resignation lives in `game/`, not in the rules

**Date:** 2026-09-03 · **Phase:** 11

**Decision:** `GameStatus` stays exactly what chess.js can derive from a position — playing, checkmate, draw. Giving up is a decision by a player, so it is held as `resignedBy: Color | null` inside `GameLoop` and folded together with the position by `outcomeOf(status, resignedBy)` into a `GameOutcome` that the UI renders. Resignation outranks the position, because the position after a resignation still looks perfectly playable.

**Why:** adding a `resigned` kind to `GameStatus` would mean `domain/chess/` — the layer whose whole purpose is "what do the rules say" — carrying a state the rules have no opinion about, and `ChessEngine` would need somewhere to remember it across `load()` and `undo()`. One derived value in the loop keeps the engine a pure function of the position.

**Rejected:** modelling a resignation as a special move in the history (it would corrupt the FEN replay and the move list); ending the game by loading a mated position (a lie the move list would expose).

## D-034 — One autosaved game in `localStorage`, stored as moves plus the area

**Date:** 2026-09-03 · **Phase:** 11

**Decision:** A single save under `mapchess.savedGame`, written on every `history-changed` and `game-over` — there is no save button. The record is `{ version, savedAt, area, players, difficulty, moves, resignedBy }`, where `moves` are `MoveRequest`s (from, to, optional promotion) replayed through the engine on load, not a FEN. Every field is validated by `isSavedGame` on read; anything that fails — a save from another version, a truncated write, storage that throws — is discarded as "no save". `SelectedArea` is the only map data saved; the terrain, the 64 cells and all their names are rebuilt from those four numbers.

**Why:** a FEN would resume the position but lose the move list, the repetition history and the ability to take back — the three things the rest of Phase 11 is made of. Replaying is also self-checking: a save that no longer applies stops at the bad move instead of producing a position nobody played. Saving the area rather than the derived board means a save can never disagree with the board it rebuilds, and stays a few hundred bytes.

**Rejected:** saving the `WorldModel` or the `BoardTheme` (megabytes, and stale the moment the theming code changes); several save slots (a menu problem, not a game problem, and nobody asked); IndexedDB (already used for tiles and features, but a save this small does not need an async API in the shutdown path).

## D-035 — Take-back rewinds to the human's turn; resignation is final

**Date:** 2026-09-03 · **Phase:** 11

**Decision:** `GameLoop.undo()` takes back plies until a human is to move — one in hot-seat, two against the computer — so the board always comes back to the player. It is refused while the loop is busy (including while the engine is thinking), and refused entirely after a resignation. It is _allowed_ after checkmate or a draw, which quietly re-opens play: the game-over screen hides on `move-undone`.

**Why:** taking back one ply against the computer would hand the turn straight back to the computer, which is not what "take that back" means. Un-ending a mate is the single most common reason anyone reaches for undo. A resignation is not a mistake in a position, it is a decision, and a decision that can be un-decided is not one.

**Rejected:** undo during the engine's turn by cancelling the search (Stockfish would have to be interrupted mid-`go`, and the generation counter already handles the race for `newGame`); an unlimited redo stack (no observed need, and it doubles the state the trackers must reverse).

## D-036 — `history-changed` carries the whole history

**Date:** 2026-09-03 · **Phase:** 11

**Decision:** After any change to the move list — a move, a take-back, a new game, a restore — the loop emits `history-changed` with the complete `Move[]`. The move list, the captured-pieces display and the save system all rebuild from that payload rather than keeping their own copies. `move-undone` still carries each reversed move, for the one listener that needs to reverse something (`ThemeTracker`'s identity stack).

**Why:** three listeners each maintaining an incremental copy of the same list is three chances to drift, and undo would need bespoke handling in every one of them. Rebuilding a hundred-row list costs nothing next to a frame of the 3D scene.

## D-037 — Changing the area starts a new game

**Date:** 2026-09-03 · **Phase:** 11

**Decision:** Confirming a new area in the picker (or choosing an example area) begins a new game with the current seating.

**Why:** Phase 10 left mid-game area changes keeping the old identities — a rook still called "Ashberry Hill" standing on a Glen Coe ridge. The alternatives were to re-theme mid-game (identities would change under the player's hand, and the move-list tooltips would retroactively lie) or to keep pretending. A new board is a new game; this removes the edge case rather than handling it.

## D-038 — Castling is offered on the rook, and the labels have an off switch

**Date:** 2026-09-03 · **Phase:** 11 (follow-up)

**Decision:** With the king selected, clicking your own castling rook plays the castle, and the rook's square is highlighted as a destination alongside the king's. Clicking the king's own destination (g1/c1) still works. Separately, the place-name labels are smaller (2.2 % of board width, was 2.8 %), fewer (10, was 16) and slightly translucent, with an on/off button in the bottom-right corner remembered in `localStorage`.

**Why:** nobody found castling. The king's destination is two files away across what looks like empty board, and the one piece a player reaches for — the rook — silently re-selected itself instead. Offering both is how every other chess program does it, and the highlight makes it discoverable without a tutorial. The labels are the best thing on the board from above and the worst thing between the camera and a piece from a low angle; that trade-off changes with every orbit, so it belongs on a button rather than in a tuned constant.

**Rejected:** click-king-then-rook as the _only_ castling gesture (breaks the muscle memory of players who know the two-square move); drag-and-drop pieces (a much larger change to `PointerInput` for no rules benefit); hiding labels automatically at low camera angles (surprising, and the angle where it matters differs per board).

## D-039 — A piece that cannot move says why

**Date:** 2026-09-03 · **Phase:** 11 (follow-up)

**Decision:** Selecting your own piece that has no legal move emits `selection-blocked` with one of three reasons, which the status bar flashes: `pinned` ("moving it would expose your king"), `in-check` ("your king is in check — that piece cannot help"), or `no-moves` ("it has nowhere to go"). The reason comes from a new seam method, `IChessEngine.isPinned(square)`, implemented by lifting the piece off a copy of the position and asking whether its king is then attacked — the definition of an absolute pin, asked directly.

**Why:** a real game reached a position where a developed knight was pinned to the king by a bishop on b4. Clicking it highlighted the square and produced nothing else, and the reasonable conclusion was that the program was broken. The rules were right and the interface was silent, which is a worse failure than being wrong loudly. An empty legal-move list cannot tell a pin from a piece that is simply walled in, so the engine had to be asked a question it could not previously answer.

**Rejected:** drawing the pinning line in 3D (pretty, and a lot of geometry for a message that reads in a second); greying out unmovable pieces before they are clicked (it would broadcast tactical information the player has not earned — spotting your own pins is part of the game).

## D-040 — The bishop is not a solid of revolution

**Date:** 2026-09-03 · **Phase:** 11 (follow-up)

**Decision:** The bishop's mitre is an extruded 2D silhouette sitting on a lathed stem and brim, in the same way the knight's head sits on a lathed neck — with the diagonal slit cut into the outline. The pawn stays fully turned, and was simplified to a plain collar and ball at 0.52 cell units. `createPieceGeometry`'s `knightHead` became a general `upright(outline, thickness, unit)` used by both.

**Why:** the pawn and the bishop were reported as indistinguishable in play. The first attempt kept both as lathes and pushed their profiles apart — slimmer stem, wide brim, tapered mitre, finial — and it was still not enough, because a lathe seen from any angle is the same rounded silhouette and low-poly shading gives every one of them the same soft vertical banding. The knight has never once been mistaken for another piece, and the reason is structural rather than stylistic: it is the only piece that is not rotationally symmetric, so it has flat faces that take the light differently and an orientation that changes as the board turns. Giving the bishop the same property is what makes it a different _kind_ of object rather than a differently proportioned blob — and the slit is the one feature of a bishop everybody already recognises, which a lathe cannot produce at all.

**Note on testing:** this is the first tested file in `world/`. BUILD_PLAN §3 exempts the 3D scene, and rightly — but `LatheGeometry` and `ExtrudeGeometry` are pure arithmetic needing no WebGL, and the pieces are told apart by silhouette alone. The height order, the plinth footprint and which heads are round are now assertions rather than things noticed in a screenshot.

**Rejected:** boolean subtraction for the slit (three.js has no CSG and one notch does not justify the dependency); making the bishop taller than the queen for separation (trades one confusion for another); colouring the bishop differently (the two sides are already the only colours on the board, and a third would read as a third player).

## D-041 — Five levels, and the two easiest are limited by depth, not by Skill Level

**Date:** 2026-09-03 · **Phase:** 11 (follow-up)

**Decision:** `learner` / `beginner` / `casual` / `club` / `strong`. The two easiest cap the search at 1 and 3 plies with Skill Level 0; the middle two use `UCI_LimitStrength` with `UCI_Elo` 1320 and 1800; `strong` is the unrestricted engine. A weak level's reply is held back to a minimum of 450 ms so an instant answer does not look like a glitch. `StockfishAI` records the `option name …` lines the engine advertises during the handshake and sends only options that appear there. The default level is now `beginner` rather than `club`.

**Why:** Phase 4 implemented BUILD_PLAN's "difficulty via skill level and think time" literally, and `beginner` was reported as still too hard. Two reasons, and neither is fixable by turning the old dials down: Skill Level mostly perturbs the choice _among_ moves the engine already likes, so a Skill Level 1 engine searching several plies still finds every tactic and simply plays a slightly worse good move; and 300 ms is a deep search on a modern machine. Depth is the only limit that makes the engine genuinely fail to see something — at depth 1 it will take a free piece and not notice that its own move gives one away, which is what a beginner opponent has to do. `UCI_Elo` cannot fill the gap either: its floor of 1320 is already a competent club player, so it can be the middle of the range but never the bottom.

**Why check the advertised options:** UCI ignores an unknown `setoption` silently. A build without `UCI_LimitStrength` would leave every level playing at full strength with no error anywhere — the exact failure that is hardest to notice, because the game still works. Reading the handshake makes an unsupported option a skipped line rather than a silent full-strength opponent.

**Rejected:** lowering `UCI_Elo` below 1320 (the engine clamps it); random move selection for the weakest level (genuinely easy, but it reads as a broken opponent rather than a bad one, and there is nothing to learn from it); `go nodes 1` (weaker than depth 1 but wildly inconsistent between positions).

## D-042 — Hints are searched at full strength, whatever level is being played

**Date:** 2026-09-03 · **Phase:** 11 (follow-up)

**Decision:** A Hint button asks the engine what it would play in the current position and shows it — both squares highlighted in blue, and the move named in the status bar ("Try Nf3 — g1 to f3") — without playing it. `IChessAI.hint(fen)` is optional on the seam; `StockfishAI` implements it by applying `ADVICE_SETTINGS` (Skill Level 20, 600 ms), searching, and restoring the level's own options in a `finally`. The loop marks itself busy while the search runs, verifies the suggestion is legal before showing it, and clears the hint as soon as a move is played, taken back, or a new game starts. The button is available at every level, not just the easy ones.

**Why:** the point of Learner is to lose less; the point of a hint is to learn what you should have seen. Those need opposite strengths, so the advice deliberately ignores the opponent's setting — a Learner opponent searching one ply would suggest exactly the blunder it would play. Restoring the level's options in a `finally` matters more than it looks: UCI options persist in the engine, so a hint that failed halfway would leave a Learner playing at full strength for the rest of the game, with nothing in the interface to show it. Marking the loop busy during the search is the cheap fix for the opposite race — a suggestion arriving for a position the player has already left.

**Rejected:** restricting hints to the easy levels (it is the player's game, and a strong player wanting a second opinion is not cheating anyone); playing the suggested move on a second click (turns advice into autopilot, and the player learns nothing from a move their hand did not make); showing the engine's evaluation in centipawns (a number a learner cannot act on); a permanent "best move" arrow (advice you did not ask for stops being advice and becomes the game playing itself).

## D-043 — A hint explains itself in words, stays put, and is the only thing on the board that moves

**Date:** 2026-09-04 · **Phase:** 11 (follow-up)

**Decision:** The hint is a card, not a flash. It shows the piece's glyph, a short headline ("Win the bishop!", "Get out of danger", "Checkmate!"), a sentence saying why, the move as an instruction in plain words ("Move your knight from g1 to f3."), the notation beside it as a chip, and the name of the map cell it lands on. It stays until the move is played, taken back, or dismissed. It lives in the left-hand column under the move record, which yields the bottom of the column to it while it is showing; it started bottom-centre and covered the player's own back rank — the pieces the advice is usually about. No overlay over a full-screen board can avoid covering something, so the fix is to keep every overlay in the two columns the board does not reach. The two board squares pulse between 0.28 and 0.75 opacity every 1.6 s — the only animated overlay in the scene. `explainMove(engine, move)` derives the words in `game/`, asking the position in priority order: mate, promotion, capture, check, is the moving piece currently attacked, castle, then a positional fallback. `IChessEngine.isAttacked(square, byColor)` was added for the danger questions.

**Why:** the first version flashed "Try Nf3 — g1 to f3" in the status bar for five seconds. Everything about that is wrong for the reader it is for: algebraic notation is a barrier to exactly the person asking for help, "try this" gives no reason so nothing is learned, and five seconds is not long enough to look from the text to the board and find the squares. Naming the piece and the reason turns the hint from an answer into an explanation, and keeping the notation visible beside the words is how the notation stops being a mystery — the child reads "Move your knight from g1 to f3" and sees that this is what `Nf3` means.

**Corrected after D-046:** the hint was blue, and once sea squares became blue a hint landing on one vanished — precisely the square a beginner most needs pointed out. It is now violet, which is the only hue nothing else claims: the rules speak in amber, green and red, and the land speaks in green, blue and sand. The card's border and headline moved with it, so the card and the squares still read as one thing.

**Why the pulse:** a still translucent square has to compete with a landscape of rivers, woods and terraces. Motion is pre-attentive and nothing else in the scene moves, so a slow breathing highlight is found instantly without being loud. Promotion outranks capture and check in the headline because a move can be all three, and to a child the new queen is the news.

**Rejected:** an arrow drawn between the squares (the most eye-catching option, and the one hardest to make look right on a warped board with 64 different cell shapes — worth revisiting); reading the advice aloud (a dependency and a permission prompt for something not everyone wants); showing the engine's evaluation (a number a learner cannot act on); progressive hints that first show only the piece (good teaching, but it makes the button ambiguous — one press should do one thing).

## D-044 — Labels are haloed text with a marker per kind, and have a markers-only state

**Date:** 2026-09-04 · **Phase:** 11 (follow-up)

**Decision:** Place-name labels drop the filled dark pill and are drawn as text with a dark halo stroked behind the glyphs. Each place gets a marker glyph and a colour by kind — `▲` amber for peaks and saddles, `●` warm white for settlements, `◆` pale blue for historic and religious sites — so ten labels read as a legend rather than ten identical tags. Every place is built twice, as "▲ Ashberry Hill" and as a bare "▲" (smaller, lower), into two sibling groups; the bottom-right button now cycles **Names → Markers → Labels off** instead of on/off, remembered in `localStorage`.

**Why:** a filled pill blanks out a rectangle of landscape per label, and ten rectangles is a lot of board to lose for ten short words — the halo costs almost no coverage and stays readable over grass, water and sand alike. The markers-only state is the one that turned out to matter: it keeps "there is something here, and roughly what" while giving the board back, which is exactly the compromise a player wants mid-game but could not previously ask for. Building both forms up front means switching costs nothing and no rebuild is needed.

**Why geometric markers:** these boards span countries and faiths — the Trabzon test board's most prominent feature is a mosque — so a triangle, a dot and a diamond say what is needed without a pictogram that means something different somewhere else.

**Superseded in part by D-045:** the labels were laid flat after all, once playtesting showed the floating billboards were the thing in the way.

**Rejected:** fading labels by camera distance (automatic, and indistinguishable from a rendering glitch when it fires at the wrong moment); screen-space collision avoidance so labels never overlap (real improvement, real complexity, and the ten-label cap already keeps collisions rare).

## D-045 — Labels lie on the cell, wrap, and reveal their name on hover

**Date:** 2026-09-04 · **Phase:** 11 (follow-up)

**Decision:** Labels are no longer camera-facing billboards floating above the board. Each is a plane lying flat on its cell's platform, turned face-up and squared to the board so the text runs along the ranks and reads from White's side, lifted 1.2 m to clear the platform's top face and its outline. Long names wrap onto further lines at two-thirds of a cell's width. In markers-only mode, pointing at a cell reveals that one place's full name; `PointerInput` gained a move channel (suppressed while a button is held, so orbiting does not stream hover events), and `BoardScene.setHoveredSquare` drives it.

**Why:** I argued against flat labels when the marker scheme went in, on the grounds that they would be unreadable at low camera angles. Playtesting said the opposite mattered more — a billboard stands _between_ the camera and the pieces from every angle, while a flat label is part of the ground and only competes with the cell it names. The reading angle is a real cost, but it is one the player can fix by tilting the camera, and the hover reveal covers the case where they would rather not. Wrapping matters because these are real place names: "Yalıncak Merkez Camii" on one line is wider than the cell it belongs to, and a label wider than its cell no longer says which cell it means.

**Why hover rather than a permanent state:** markers-only exists so the board is clear while you play. Making every name readable on demand means the clear state costs nothing — there is no longer a reason to switch back to full names except to survey the whole map at once.

**Corrected after playtesting, twice:** the first version put the name and the marker at the same point _and_ left both visible, so a revealed name sat on its own marker and showed the glyph twice — the name text already begins with it. Hiding the marker fixed the duplicate. Moving the name aside — 0.36 cells towards White, clear of a piece standing on the centroid — fixed occlusion but broke something more important: the name no longer appeared where the marker was, so the eye had to jump across the cell to find what it had just pointed at.

The name is now back on the feature point, expanding in place from the glyph, and occlusion is solved by drawing labels **over** the scene instead (`depthTest: false`, `renderOrder` above everything). A label lies on the ground at exactly the spot a piece stands on, so honest depth means the label you most want to read is the one hidden — and these are annotations on a map, not objects in the world. The cost is that a label on a far cell can show through a near hill; that is the standard bargain for map overlays, and it beats a label that cannot be read at all. Pointing at a piece yields that piece's square, so a marker under a piece can still be revealed.

## D-046 — Sea squares are submerged, not beach

**Date:** 2026-09-04 · **Phase:** 11 (follow-up)

**Decision:** On a coastal board, a cell whose mean ground is at or below 0.25 m is classified `water`; between there and 1.5 m it stays `sand`. Water-covered cells keep their blue platform and gain a translucent sheet 3.5 units above it, so the square reads as submerged and a piece standing there stands in the shallows. The ground description says "open sea" at the coast and "open water" inland. All 64 squares stay playable, and the outer sea plane keeps its clamp below the lowest platform.

**Why:** OpenStreetMap gives the coast as a _line_, not a polygon (D-024's normalisation keeps it as `coastline`), so open water off the shore matched no water polygon. It fell through to the tidal-sand rule and a bay in the corner of a board was drawn as a pale beach across the whole bay — a board inventing land that is not there, which looks deliberate rather than broken. Elevation is the only thing that knows: Terrarium reports sea as a flat 0 m, so the margin only has to absorb sampling noise at the waterline.

**Why not flood the cells properly:** the sea plane is still clamped below the lowest platform, and the shallows are a per-cell sheet instead. Moving the global plane up to true sea level would have put it within a fraction of a metre of every near-shore platform, where the exaggeration scale decides whether a 0.5 m sand flat is wet or dry — a per-cell sheet is decided by the classifier, which is testable, rather than by a z-comparison that is not.

**Rejected:** skerries or jetties under pieces on water (charming, and per-cell geometry that can go wrong in ways nobody would notice until a particular coastline produced it); warning in the area picker about how much of a square is sea (an all-sea board is a legitimate thing to want to look at, and the board itself makes it obvious).

## D-047 — The game-over card writes an account of the ending

**Date:** 2026-09-04 · **Phase:** 11 (follow-up)

**Decision:** Under the result and its one-line explanation, the card carries two or three italic lines naming what actually happened, in place names: the move number counted as a player would write it, the piece that gave mate and the identity it carries, the ground it came to, and the square the losing king was cornered on — then a quiet tally of how many pieces fell. Resignations report who gave up, on which move, the material gap if there was one, and where the winner's king still stood. Draws place both kings. `chronicle()` is a pure function in `game/` over the outcome, the history and three lookups the caller supplies; `GameOverScreen` keeps the latest `history-changed` payload so the account is current when `game-over` arrives on the same move.

**Why:** "Checkmate — White wins" is the sentence every chess program has printed since 1978. This one is played on a real square of the world where every piece and every cell already has a name, and the last move is the moment that investment is worth the most — "Move 27: Black's queen of Ashberry Hill took the rook at Nether Meadow. White's king had nowhere left to stand at Scawton Croft." Nothing else in the game produces a sentence like that, and it is the one a player would repeat to somebody.

**Why a pure function with injected lookups:** every line is an assertion about the position — which piece, whose king, how many moves. Naming the winner's king instead of the loser's, or counting plies as moves, would be a lie told at the most memorable point in the game and one nobody would think to check. Taking `placeOf`, `pieceNameOf` and `kingSquareOf` as callbacks keeps it testable with stub names and keeps `ui/` free of the tracker's internals. It falls back to bare square names throughout, so a flat board with no map data still reads properly.

**Rejected:** a full move-by-move narrative (the move list is already there, and nobody reads a paragraph on a results screen); adjectives tuned to how one-sided the game was ("a crushing victory") — the facts are dramatic enough and a program guessing at tone gets it wrong in exactly the games a player cares about.

## D-048 — The menu names the place, and shows a map instead of a "Change" button

**Date:** 2026-09-04 · **Phase:** 11 (follow-up)

**Decision:** The menu's board row is now a panel: a drawn folded-map button on the left, and beside it "CURRENT WAR LOCATION" over the name of the place — "Rievaulx", "Holy Island", "Achtriochtan". The name comes from `primaryPlaceName(features)`, which ranks the named `place` features by settlement class and falls back to historic sites, churches and peaks; coordinates remain only as the fallback when the map named nothing. The two instruction lines under the menu buttons are gone. While terrain or features are downloading, the status pill carries a rotating chess tip.

**Why the name and not the coordinates:** "40.9783, 39.8214" tells a player nothing about where they are fighting, and it is the one thing on the menu that should make somebody want to press New game. The features are already fetched for the terrain, so the answer costs no request and works offline against the fixtures — a reverse-geocode call would have added a network dependency to a screen that must open instantly.

**Why the map replaces the button:** the board is the subject of the whole menu, so it earns the one picture on the screen. A labelled "Change…" button read as a form field next to two dropdowns.

**Why tips while loading:** a cold area takes a few seconds of tile and Overpass traffic, and a progress count is a poor thing to look at. Whoever is waiting came here to play chess, so it is the one moment where explaining en passant is welcome rather than in the way. They stop on failure — an error is something to act on, not something to read a joke under.

**Grown into a loading screen:** the pill became a full-screen veil that blurs the half-built board, with a card in the middle carrying the six piece types hopping one after another, the progress line and the tip. The veil takes `pointer-events: none` and only Retry takes a click, so the menu above it and the HUD below it both stay usable while tiles are in flight — a loading state that disables the interface is worse than one you can see past. It sits at `z-index: 15`, under the menu: at startup the menu is the thing to interact with, and on an area change mid-game the menu is closed and the card has the screen to itself. The hop respects `prefers-reduced-motion`.

**Why the instruction lines went:** they were read once and then were furniture. The camera hint still sits in the bottom-right cluster where it is out of the way, and castling now announces itself by highlighting the rook (D-038), which is what the second line was compensating for.

## D-049 — A gazetteer entry for the board, counted from the map and nothing else

**Date:** 2026-09-04 · **Phase:** 11 (follow-up)

**Decision:** A collapsible panel at the top of the left column headed "The field of Rievaulx", with up to five labelled lines — Ground, Water, Cover, Settled, Remembered — and one closing remark chosen from the numbers. Open or shut is remembered in `localStorage`, and the move record moves down while it is open. `buildBriefing()` is a pure function over the features, the height field and the land cover already fetched for the board.

**The rule this file exists under: there is no history in it, because there is no source for one.** OpenStreetMap records names, `old_name`, `historic=*` and elevation. It does not record dates or events. So every sentence is counted or quoted from that data — "73 m to 200 m, the top of it Ashberry Hill", "Doric Temple, Rievaulx Abbey and Rievaulx Methodist Church", "still called Abhainn Chomhann by somebody who edited the map". The voice is a dry gazetteer's; the facts are the map's. Writing "founded by Cistercians in 1132" for a real abbey would be a confident lie about a real place, and the fact that it happens to be true of Rievaulx is exactly why it is dangerous — the same sentence generated for the next abbey would not be.

**Why the remark keys on how many things are named, not on how long the entry is:** Ground, Cover and Settled always produce a sentence, so length says nothing about how much is actually known. An area with no names at all now gets "OpenStreetMap has almost nothing to say about this square of the world. The board named it anyway," which is both true and the funniest thing the data supports.

**Rejected:** fetching Wikipedia or Wikidata summaries for named features (real history, real source — and a network call per board, a licence question, and a long tail of articles about the wrong "Rievaulx"); a fixed template every area fills in (padding out an empty moor to five lines means inventing four of them).

## D-050 — Real history, from Wikidata, by the Q-id OSM already carries

**Date:** 2026-09-04 · **Phase:** 11 (follow-up)

**Decision:** The briefing gains up to four "On record" lines looked up from Wikidata: "Rievaulx Abbey — abbey, founded 1132, scheduled monument". The Q-id comes from the feature's own `wikidata` tag, which the normaliser now keeps. `WikidataProvider` batches `wbgetentities` fifty ids at a time, makes a second batched call to turn the referenced ids for "instance of" (P31) and heritage status (P1435) into words, rate-limits itself to one request per 400 ms, caches each fact by Q-id in IndexedDB, and resolves to an empty map on any failure. The briefing renders from OSM alone the moment the board is ready and re-renders if Wikidata answers; a generation counter drops an answer for a board the player has left.

**Why Wikidata and not Wikipedia:** both are CORS-enabled and both would work. Wikidata is CC0, so no attribution line is owed and none of it is prose — P571 is a timestamp, P1435 is an identifier. There is nothing in a date that can be subtly misworded, nothing to quote out of context, and nothing generated. The Wikipedia extract is richer and CC BY-SA, which means a credit in the UI and a share-alike question; it remains available if that trade is ever wanted.

**Why this is not the thing D-049 refused to do:** D-049 forbids _inventing_ history, and that stands. This is a lookup keyed by an identifier the map itself supplies, so there is no guessing which Rievaulx is meant and no sentence written by MapChess. The abbey is dated 1132 because Wikidata says `+1132-03-05T00:00:00Z`, not because it sounded right.

**Why a fact needs a date or a designation:** the first run printed "Aonach Dubh — mountain" and "River Coe — river". True, sourced, and worth nothing to a player looking at a mountain. A kind on its own is flavour beside a fact, not a fact, so `isWorthPrinting` requires P571 or P1435. Glen Coe consequently gets no history lines at all, which is the honest answer for a glen whose OSM entries carry two Q-ids between them.

**Rejected:** blocking the board on the lookup (it is the only genuinely optional data in the project — a Wikimedia outage must be invisible); shipping canned Wikidata fixtures for offline development (the three fixture areas would then disagree with the live database as it is edited, and a stale date is worse than none).

## D-051 — The HUD is paper

**Date:** 2026-09-04 · **Phase:** 11 (follow-up)

**Decision:** The gazetteer's aged-paper treatment now covers the whole in-game HUD: the status bar, the area bar, the move record, the game controls, the view controls and the hint card all sit on the same sheet stock, in the same serif, in the same ink. The palette lives in seven custom properties on `:root` (`--paper`, `--paper-edge`, `--paper-rule`, three inks and `--paper-serif`), and the ground itself — four gradients and an inset ageing shadow — is written once in a selector group rather than per panel. Buttons across the paper panels share one treatment.

**Why:** the briefing arrived as a sheet of parchment in a HUD of dark translucent slabs and read as a visitor rather than as part of the game. One of the two had to give, and paper is the one that means something here: this is a board carved out of a real map, and the panels around it are the notes you would keep beside it.

**What stays dark, and why:** the MapLibre area picker, the loading veil, the main menu, the game-over card and the promotion prompt. The picker is a map tool with its own conventions; the veil exists to dim the board and would defeat itself in cream; and the three modals are moments that interrupt play rather than parts of it. Converting them is a smaller decision than it looks and can follow.

**Kept against the grain:** the hint card's violet border and headline. D-043 pairs that colour with the pulsing squares on the board, and D-045 records what happened the last time the hint's colour collided with something — the tie between the card and the ground it points at outranks the palette.

## D-052 — The picker is loaded on demand; the build is path-relative

**Date:** 2026-09-05 · **Phase:** 12

**Decision:** `AreaBar` imports `AreaPicker` with a dynamic `import()` inside the open handler, keeping MapLibre out of the initial bundle. `vite.config.ts` sets `base: './'`.

**Why:** MapLibre and its stylesheet are 970 kB of JavaScript and 83 kB of CSS, and they are needed only if the player opens the picker — which many never will, since the game starts on an area already. Deferring it took the initial download from 1,740 kB to 770 kB (463 kB to 207 kB gzipped) and the stylesheet from 100 kB to 17.5 kB. Nothing else in the project is worth splitting: three.js is needed to draw the first frame.

**Why relative asset paths:** the built folder then runs from a domain root, a GitHub Pages project subpath, or a bare directory, with no configuration. MapChess is one page with no client-side routing, so there is nothing that needs a real base path, and `import.meta.env.BASE_URL` still resolves the engine correctly.

## D-053 — The credit line is in the app, not only in the README

**Date:** 2026-09-05 · **Phase:** 12

**Decision:** A small strip in the bottom-right corner, on screen for as long as the board is, naming OpenStreetMap (with a link to its copyright page), the Mapzen terrain tiles, and Wikidata. Each carries the full licence in its tooltip. The area picker keeps MapLibre's own attribution control for the basemap.

**Why:** the ODbL requires the attribution to be visible wherever the data is used, and this game is nothing but that data — a line in a README does not cover a running app that somebody opened from a URL. The terrain tiles ask for credit as well. Wikidata is CC0 and requires nothing; it is named anyway, because taking facts from a source without saying so is poor manners even where it is legal.

**Stockfish added later, and it is the one with a duty attached:** the engine is GPL-3.0 and ships compiled, so the link goes to the source repository rather than the project's front page. What the licence asks is that whoever holds the binary can get the code; the licence text itself ships beside the engine at `engine/LICENSE-stockfish.txt`.

**Rejected:** folding the credit into the menu or an "about" panel (invisible while playing, which is exactly when the data is on screen); shrinking it into a single "©" that expands (the required credit has to be legible, not discoverable).

## D-054 — A win estimate, off by default, never at the level being played

**Date:** 2026-09-05 · **Phase:** 12

**Decision:** A card in the left column showing a two-tone bar of each side's share, a sentence ("White is clearly ahead", "Mate in 3 for Black"), and the conventional number with the search depth beside it. Switched on by an icon in the dock and off by default, remembered in `localStorage`. The score is read from the engine's `info … score cp` lines by `parseInfoScore`, searched under `ANALYSIS_SETTINGS` — Skill Level 20, 350 ms — whatever level the opponent is set to, and turned into White-relative terms by `assess()`.

**Why not the play strength:** a Learner searches one ply, so its opinion of the position is as shallow as its play. An estimate is only worth showing if it is better than the player's own guess.

**Why off by default:** it costs an engine search after every move, and the easy levels exist so a beginner can enjoy losing slowly — a running commentary on how badly it is going is the opposite of that. It is there for whoever wants it.

**Why the bar, the words and the number together:** the bar answers "who is winning" without being read, which is what a beginner needs; the sentence answers it in language; the number is for whoever already knows what "+1.4" means. The depth is shown because it is the honest part — it says how hard the engine actually looked — and the card ends "a guess, not a promise", which it is: 350 ms of search, assuming an opponent who at low levels will not play those moves.

**Why it cannot collide with the opponent:** the engine searches one position at a time and `chooseMove` refuses when busy, which would drop the opponent to a random legal fallback. So an assessment is requested only when the engine is idle and the game is live, and `maybePlayAi` awaits any assessment in flight before asking for a move.

**Rejected:** evaluating continuously during the opponent's own search (there is one engine, and the game's move matters more); showing centipawns alone (jargon); hiding the number (the people most likely to switch this on are the ones who read it).

## D-055 — Watch mode can be paused, and only watch mode

**Date:** 2026-09-05 · **Phase:** 12

**Decision:** A pause button appears in the control dock when both seats are the computer, turning into a play button while held. `GameLoop.setPaused` stops `maybePlayAi` from asking for anything further, and a reply that arrives _after_ the pause is discarded rather than played. A new game is never born paused. Nothing else in the game can be paused.

**Why:** watch mode had no controls at all. Resign is disabled with no human seat and take-back needs a human to hand the board back to, so the only way out of a computer-versus-computer game was the menu — which throws the game away rather than holding it. Somebody watching a game wants to stop on a position and look at it.

**Why discard the reply in flight rather than play it:** pause should stop the board where the watcher is looking, not one move later. The search is wasted, which costs nothing anyone can see, and resuming simply asks again.

**Why not pause a game with a person in it:** there is nothing to pause. The board already waits indefinitely for a human move, and the computer's own reply is a second at most — a pause button there would be a control with no state to control.

## D-056 — The move just played, a noise, and a way back to the opening view

**Date:** 2026-09-05 · **Phase:** 12

**Decision:** Three small additions aimed at making the game followable rather than merely correct.

**The last move is lit** in a faded version of the selection colour — the same yellow, weaker, because "the piece in your hand" and "the move just played" are the same kind of fact and one of them is already over with. It is read straight off `engine.history` at draw time rather than remembered, so a take-back rewrites it for free and there is no second copy to fall out of step. Until now nothing at all said what the computer had done: you had to spot the difference.

**Sound is synthesised**, not loaded — an oscillator and a gain envelope per note, so there is no asset, no request and nothing to wait for. A knock for a move, something heavier for a capture, a rising pair for check, three notes at the end. It is off until pressed, and the press is what creates the `AudioContext`, because a browser will not start audio without a gesture and a page that makes noise on its own is intolerable. A remembered "on" therefore does not sound until the button is pressed once — deliberately, since the alternative is either silence that looks broken or noise nobody asked for.

**Everything queued in one turn of the event loop collapses to a single sound.** Restoring a saved game republishes every move it replays, and forty knocks in a row is not a game resuming, it is a fault. A capture outranks a plain move and the end of the game outranks both.

**Recentre** puts the camera back where it started. Panning is clamped to the board, but a player who has orbited underneath and zoomed in had no way home.

**Rejected:** recorded samples (a download, a licence, and a folder of files for four sounds); animating the last-move highlight (the hint already pulses, and two things breathing at once is a fairground).

## D-057 — A remembered setting is applied like any other, gesture or not

**Date:** 2026-09-05 · **Phase:** 12

**Decision:** `ViewControls` calls `onSoundChanged` at construction alongside the label and assessment settings. `Sounds` handles the browser's gesture requirement itself: it builds the context, tries to resume it, and if it will not resume yet, listens once for the next click or key press and resumes then.

**Why:** the first version skipped the call, on the reasoning that audio cannot start without a gesture and construction is not one. That was true and produced a bug anyway. With sound remembered as on, the button drew itself as on, nothing played, and pressing it turned the setting _off_ — two presses to be heard, and the first one looked broken. The gesture requirement is the audio layer's problem to solve, not a reason for the layer above to withhold a setting it has been asked to apply.

## D-058 — A move that gives something away is questioned, on the easiest level only

> **Reversed by D-062.** The prompt was removed. The reasoning below is kept for the record.

**Date:** 2026-09-05 · **Phase:** 12

**Decision:** At Learner, a human move that leaves material to be taken raises a modal before it is played: what falls, where, what takes it, and how bad it is in words rather than numbers. "Let me think again" is the highlighted button and the answer to Escape or a click outside; the piece stays selected so another square can be chosen at once. `findBlunder` is a pure function in `domain/chess/`, `IBlunderWarner` is the seam, `BlunderPrompt` implements it.

**Why two plies and not a search:** the mistake this is for is a piece put where something cheaper can take it, and that is visible one move deep. It plays the move on a throwaway engine built from the FEN, looks at every capture the opponent could answer with, and counts what each would actually cost them — the piece taken, less the piece we take back if we can. That runs in a millisecond, needs no engine, and is testable exactly.

**Why the threshold is two pawns:** a pawn given away is the ordinary traffic of a beginner's game, and a dialog on every one is a dialog nobody reads. Two means a piece, or a piece for a pawn.

**Why only Learner:** a player who can already see the capture does not want stopping, and being interrupted by something you had already spotted is how a helpful feature becomes an irritation. The level exists for someone who cannot yet see it.

**Known limit:** it warns about what can be taken _after_ the move, so a piece that was already hanging before it will be reported again on an unrelated move. Judging "did this move make it worse" needs the position with the side to move flipped, which chess.js will not give without a null move — and for a learner "your queen is still hanging" is arguably the right thing to say anyway.

**Rejected:** using the engine's evaluation (a search per candidate move, and the answer arrives too late to intercept a click); warning after the move with an offer to take it back (the move has landed, the opponent has replied, and the lesson is diluted); warning at every level with a switch (a switch nobody finds off by default, and nobody wants on above Learner).

## D-059 — What is hanging, shown standing, on the two easiest levels

> **Reversed by D-061.** The card and its board marks were removed. The reasoning below is kept for the record.

**Date:** 2026-09-05 · **Phase:** 12

**Decision:** At Learner and Beginner, the player's own pieces that could be taken for nothing are ringed faintly on the board and named on a card in the left column — worst first, at most three, with a count of any others. It is recomputed wherever the position settles and disappears when there is nothing to say. The marks are hidden while a piece is in hand.

**How it knows:** the same two-ply arithmetic as the blunder warning, asked with the turn handed over — the position with the side to move flipped and any en-passant right dropped. `exchange.ts` now holds that sum once, and both `findBlunder` and `findHanging` call it, so the two can never disagree about what a piece is worth.

**Why standing rather than on demand:** the blunder prompt stops a mistake as it is made, which leaves the mistakes already on the board unaddressed. Those are the harder ones to see, because nothing prompts you to look. The card costs no room when all is well, so it can be left on without becoming furniture.

**Why it hides while a piece is held:** the board is then already carrying that piece's legal moves in green and its captures in red, and a third set of red rings on top is a fairground, not information.

**Why Learner and Beginner, not just Learner:** unlike the blunder prompt this interrupts nothing, so the cost of showing it to someone who did not need it is much lower. Above those levels a player sees it themselves and being told is noise.

**Only the player's own pieces**, never the computer's: it is their turn being advised, and marking what the opponent has left hanging would be telling them what to take, which is a different game.

## D-060 — A coach card that is always saying something

**Date:** 2026-09-07 · **Phase:** 12

**Decision:** A card at the top of the left column, on unless turned off at every level, carrying three short lines: what the opening is called, one thing worth doing now, and two numbers (material, and — in the opening — how many pieces are still at home). It is a single sentence of advice, never a list.

**Why:** the game had plenty of help and none of it was ever _there_. The hint answers this move when asked, the blunder prompt answers a move being made, the danger card answers a position where something is hanging — all of them are silent most of the time, and two of them are silent entirely above Beginner. Nothing told a player where they were or what kind of game they were in. This is the panel that always has something to say, which is the only kind a person learns from.

**Where the content comes from:** a book of 55 named openings in `domain/chess/openings.ts`, longest-prefix matched against the moves played. The same table answers both of a beginner's first-ten-moves questions — "what is this called?" is the longest line followed, "what do good players do here?" is the next move of every line that continues from this position. No engine, no search: it runs after every move and the board never waits for it.

**Why a book and not the engine:** asking Stockfish what to play here is the hint button, which already exists and costs a search. The book costs a string compare and, unlike a search, hands back a _name_ — and the name is the part that turns twenty random-looking moves into something a player can look up and play again.

**One rule fires, not all of them.** `coaching.ts` tries them in a fixed order: check, then the book, then the mistakes a new player actually makes (queen out early, pieces still at home, king not castled), then what to do with a passed pawn, a lead, or a deficit. Five things to think about is the same as no advice.

**The move number comes from the FEN, not from the length of the move list.** A position set up from a FEN has no history, and counting the list called move 40 of a rook endgame "move 1" and offered it the first-move opening book. The book is consulted only when the history length matches the position's own ply count — that is, when the game really was played from the start.

**Why on by default, when everything else here is off:** it interrupts nothing, it takes four lines, and it is the panel that teaches. A beginner will not go looking for a switch to find help they do not know exists — which is exactly what happened to D-059, invisible at three of five levels and invisible at the other two until something was already hanging.

**Rejected:** an ECO table (a database, and the card has room for one line); showing every rule that fires (a checklist is not advice); gating it by difficulty like the other help (the mistake D-059 made); putting the opening name in the move record (nobody reads a heading over a list of moves).

## D-061 — The danger card is gone

**Date:** 2026-09-07 · **Phase:** 12 · **Reverses:** D-059

**Decision:** Removed the standing "what is hanging" card, the faint red rings that went with it, `findHanging`, the `danger-changed` event, the `danger` highlight role, and the `helpsAt` difficulty gate. `exchange.ts` stays: the blunder prompt (D-058) still uses the same two-ply sum, and that is where the arithmetic was extracted to in the first place.

**Why:** it was unwanted. (D-062 then removed the blunder prompt too, so the paragraph below about what survives no longer holds.) It was also the wrong shape for the job — a panel that appears only when you have already gone wrong, at two of five difficulty levels, is invisible right up until the moment it accuses you. The help that reads as help is the kind that is always there and usually has something ordinary to say, which is what the coach card (D-060) does instead.

**What is left of the idea:** the blunder prompt still catches a piece being _put_ somewhere it can be taken, which was always the sharper half. The coach card notices a material deficit and says what to do about it. Neither of them rings a piece in red and waits.

## D-062 — The blunder prompt is gone too, and with it the exchange arithmetic

**Date:** 2026-09-07 · **Phase:** 12 · **Reverses:** D-058

**Decision:** Removed the "Careful — their pawn can take your knight" modal, `IBlunderWarner`, `findBlunder`, `GameLoop.confirmed()`, the `warner` dependency, and the `warnsAt` difficulty gate. `exchange.ts` went with them; the piece values it also held now live alone in `domain/chess/values.ts`, which is what the rest of the game actually wanted from it.

**Why:** interrupting somebody's move is the most expensive thing a piece of UI can do, and it was buying a lesson the player had not asked for at the exact moment they had decided what to play. Two features in a row (D-058, D-059) tried to teach by pointing at mistakes, and both were unwanted for the same reason: the game was correcting the player instead of accompanying them.

**What replaces it:** nothing, deliberately. The coach card (D-060) says something ordinary and useful on every move without waiting for a mistake, and the hint button answers "what should I play" when it is asked. Between them there is no gap that wants a modal.

**Kept from the wreckage:** `PIECE_VALUE`, because "you are three ahead" needs a price list and there should be exactly one in the codebase. `IChessEngine.isPinned` and `isAttacked` stay too — `explainMove` uses them to write the hint's sentences.

**Note on the reversals.** D-058, D-059 and D-060 were all built in Phase 12 and two of the three are now gone. That is not three failed features so much as one question asked three times — how do you help a beginner without nagging them — where only the answer that never mentions a mistake survived contact with a player.
