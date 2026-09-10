# MapChess — Progress

One report per completed phase, appended in order. Template in `BUILD_PLAN.md` §7.

---

## Phase 0 — Decisions & scaffolding

**Date:** 2026-09-02
**Project completion: 4%**

### In plain English

Nothing is playable yet. The project now has a foundation: the tooling that builds, checks and tests the code is installed and proven to work, and the folder layout for the whole game exists with a note in every folder saying what goes there. The three open questions (board size, look, devices) are answered and written down.

### What I built

- `package.json` — scripts: `dev`, `build`, `test`, `lint`, `format`, `typecheck`.
- `tsconfig.json` — TypeScript 6, `strict` plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`; per-layer path aliases (`@domain/*`, `@world/*`, …).
- `vite.config.ts` — Vite 8 + Vitest 4 in one file; the same aliases so tests and browser resolve imports identically.
- `eslint.config.js` — typescript-eslint strict type-checked preset, plus a `src/domain/**` block that _forbids_ importing three.js or touching `window`/`document`/`fetch`/storage.
- `.prettierrc`, `.prettierignore`, `.gitignore`.
- `index.html`, `src/app/main.ts`, `src/app/config.ts`, `src/app/styles.css` — entry point, the Phase 0 decisions as frozen constants, full-viewport layout with `#world` (canvas) and `#ui` (overlay) as siblings.
- `src/**/README.md` × 17, `tests/README.md`, `public/models/README.md` — what belongs in each folder, what does not, and which phase fills it.
- `tests/toolchain.test.ts` — smoke test proving Vitest runs and resolves aliases.
- `docs/DECISIONS.md` — D-001 to D-007.
- `README.md` — project summary and run instructions.
- Git repository initialised; one commit.

### Why it was done this way

- **Layering enforced by lint, not convention.** The plan's core rule is that `domain/` stays headless. Phase 8 will have geometry and rendering being written side by side, which is exactly when that rule gets broken by accident. ESLint now fails the build on `import ... from 'three'` inside `domain/`.
- **Path aliases per layer** rather than relative paths. `from '@world/...'` inside a domain file is visibly wrong at a glance, and it makes the lint rule a one-liner.
- **`console.info` allowed, `console.log` not.** Until the `shared/` logger exists in Phase 1, this keeps stray debug logging out without banning deliberate messages.
- **Board orientation convention recorded now (D-007)** although it is implemented in Phase 5, because piece placement, camera default and move animation all depend on it and I do not want three interpretations.
- **Rejected:** a nested `mapchess/` folder (the workspace root is the repo); a user-adjustable area size (every layout constant would need to scale with it).

### How to check it yourself

1. `npm install`
2. `npm run dev` — open the URL shown. You should see a dark blank page. The console shows one line: `MapChess 0.0.1 — Phase 0 scaffold. Board area 2000 m.` and no errors.
3. `npm run test` — 1 file, 2 tests pass.
4. `npm run lint` and `npm run typecheck` — both exit silently.
5. Open any folder under `src/` — its `README.md` tells you what belongs there.

### What's left

Phase 1 — Scene skeleton and flat board: renderer, camera, orbit controls, lights, resize, animation loop; `IBoardLayout` interface and `FlatBoardLayout`; `CellBuilder` that renders arbitrary polygons. Unlocks: something to look at, and the seam (`IBoardLayout`) that the entire map side of the project plugs into later.

### Risks / things I'm unsure about

- **TypeScript 6 is very new.** It deprecated `baseUrl` (already handled) and other tooling may lag. If typescript-eslint or Vite misbehave on TS 6, pinning to TS 5.9 is a one-line change with no code impact.
- **Vitest 4 / Vite 8 / ESLint 10** are likewise all current-major. Nothing broke today, but I have not exercised them beyond a smoke test.
- **`docs/warped-lattice-prototype.html`** exists in the repo from before Phase 0. I have not read it or built on it. It may be useful reference for Phase 8; it is excluded from lint and formatting so it does not affect the toolchain.
- **No `.nvmrc`/engines field.** Developed on Node 24. If you switch machines, add one.

---

## Phase 1 — Scene skeleton and flat board

**Date:** 2026-09-02
**Project completion: 10%**

### In plain English

There is now something to look at: a grey 3D chessboard you can orbit around, tilt, and zoom with the mouse, seen from White's side. More importantly, the board is drawn from a description of "64 shapes and where they are" rather than "an 8×8 grid" — so when real terrain replaces it later, the drawing code does not change.

### What I built

- `src/domain/board/Square.ts` — square names `a1`…`h8` as types, index helpers, `ALL_SQUARES`.
- `src/domain/board/types.ts` — `BoardPoint`, `Cell` (polygon, centroid, platform height, shade), `BoardBounds`.
- `src/domain/board/IBoardLayout.ts` — the seam: 64 cells, bounds, `cell(square)`.
- `src/domain/board/polygon.ts` — signed area and area-weighted centroid, with the winding convention fixed (D-009).
- `src/domain/board/FlatBoardLayout.ts` — first `IBoardLayout`: 64 equal squares, a1 south-west and dark, all platforms at Y = 0.
- `src/world/scene/createRenderer.ts` — WebGL renderer, DPR capped at 2.
- `src/world/scene/createCamera.ts` — perspective camera framed from `BoardBounds`, south of the board.
- `src/world/scene/createLights.ts` — hemisphere fill + one directional key light.
- `src/world/scene/createControls.ts` — orbit controls; distance and polar limits derived from board width, cannot go under the board.
- `src/world/scene/ResizeHandler.ts` — `ResizeObserver` on the container keeps renderer and camera aspect in step.
- `src/world/scene/RenderLoop.ts` — one animation loop with tick subscribers and a clamped delta.
- `src/world/scene/WorldStage.ts` — composes the above; `add()`, `start()`, `dispose()`.
- `src/world/builders/CellBuilder.ts` — any convex polygon → prism (flat top + skirt); merged into one mesh per shade. No 8×8 maths.
- `src/app/bootstrap.ts` — composition root; the one line that picks `FlatBoardLayout`.
- `src/app/main.ts` — now calls `bootstrap()`; disposes the scene on Vite hot reload.
- `tests/domain/board/*.test.ts` — 21 tests: square helpers, polygon maths, layout contract and orientation.

### Why it was done this way

- **Domain speaks metres, Y-up, `{x, z}` points (D-008).** No conversion layer between domain and three.js, and no chance of someone tilting a piece to the terrain because the domain simply has no tilt to offer.
- **Winding fixed now (D-009).** CCW-from-above matches three.js front faces, so `CellBuilder` emits polygon vertices directly into triangles. Phase 8's convexity invariant becomes a one-line sign check.
- **Merged geometry from day one (D-010).** Two draw calls for the board. The cost is that cells are not individual objects; Phase 3 picking will map triangle → square. Recorded so it is not a surprise.
- **Every camera/light/control constant is a fraction of board width.** The warped board will have a different height range; it must frame itself without anyone touching `world/scene/`.
- **Rejected:** `THREE.Clock` (deprecated in r185, lint caught it) in favour of `THREE.Timer`; `ExtrudeGeometry` for cells (extrudes along Z, would need a rotation and produces indexed geometry that fights flat shading); per-cell meshes (64 draw calls before pieces even exist).

### How to check it yourself

1. Run `npm run dev` and open the URL.
2. You should see a grey chessboard from White's side, dark square at bottom-left (that is a1).
3. Left-drag to orbit — try to go under the board; the camera stops just above the horizon and you see the board's edge thickness.
4. Scroll to zoom; it stops at sensible min/max distances.
5. Resize the window; the board stays undistorted.
6. Console shows one line: `MapChess 0.0.1 — 64 cells, board 2000 m.` and no errors.
7. `npm run test` → 4 files, 23 tests pass. `npm run lint` / `npm run typecheck` → silent.

### What's left

Phase 2 — chess rules core. `IChessEngine` wrapping chess.js, fully tested, playable from a terminal with no renderer. Unlocks Phase 3 (pieces on this board) and is the foundation everything else stands on.

### Risks / things I'm unsure about

- **Cell picking (Phase 3) has to work against merged meshes.** Plan: keep a triangle-index → square table when merging, or add an invisible per-cell pick layer. Either is small, but it is deferred work created by D-010.
- **Default camera angle is a taste call.** Currently ~40° elevation. Once pieces exist it may want to be steeper; the constants are two numbers in `createCamera.ts`.
- **No shadows yet.** Deliberately off until pieces exist. Enabling them will need a shadow-camera frustum sized from `BoardBounds` — one more thing in `createLights.ts`.
- **Board thickness is 2% of width** (40 m on a 2 km board). Looks right on the flat board; on terraced terrain the skirt depth will be dictated by the height range instead. `CellBuilder` already takes it as an option.

---

## Phase 2 — Chess rules core

**Date:** 2026-09-02
**Project completion: 18%**

### In plain English

The game now knows the rules of chess — every legal move, check, checkmate, all the draws, castling, en passant and pawn promotion — and refuses anything illegal with a reason. None of this touches the screen yet: you can play a complete game in the terminal with `npm run play`, which proves the rules stand on their own.

### What I built

- `src/domain/chess/types.ts` — `Color`, `PieceType`, `Piece`, `MoveRequest`, `Move` (with captured square and castle rook path), `GameStatus`.
- `src/domain/chess/IChessEngine.ts` — the rules seam: read position, list legal moves, `move`/`undo`, `load`/`reset`.
- `src/domain/chess/errors.ts` — `IllegalMoveError` (with a reason) and `InvalidPositionError`.
- `src/domain/chess/chessJsAdapter.ts` — the only file that knows chess.js's letters; derives en passant victim square and castle rook path.
- `src/domain/chess/ChessEngine.ts` — `IChessEngine` on chess.js; validates before delegating, keeps a domain-typed history.
- `scripts/play.ts` + `npm run play` — terminal hot-seat game: SAN or coordinate input, `moves`, `undo`, `history`, `fen`, `reset`.
- `tests/domain/chess/ChessEngine.test.ts` — 42 tests covering every listed rule, the awkward cases (pins, castling through check, en passant expiry, underpromotion, undoing a mate) and a full historical game (Morphy's Opera Game) played to checkmate.

### Why it was done this way

- **Human-readable vocabulary, chess.js in one file (D-011).** Phase 10 will assign terrain identities to "rooks" and "knights"; it should never see `'r'`.
- **`Move` carries rendering facts.** `capturedSquare` and `castle.rookFrom/rookTo` mean Phase 3 animates en passant and castling with no rule knowledge.
- **Typed errors with reasons (D-012).** The UI needs to distinguish "pick a promotion piece" from "not your turn". A boolean cannot.
- **Own history array** instead of re-converting `chess.history({verbose:true})` on every read.
- **Rejected:** exposing chess.js's `Move` directly (leaks the dependency into every layer); a `tryMove(): Move | null` API instead of throwing (loses the reason).

### How to check it yourself

1. `npm run play`
2. Type `f3`, `e5`, `g4`, `Qh4#` — the board redraws each time; the last prints _Checkmate — black wins._
3. Type `a3` — _Illegal: game over._ Type `undo` — the queen goes back.
4. Type `e2e5` — _Illegal: not a legal destination._ Type `moves` to see what is legal.
5. `quit`.
6. `npm run test` → 5 files, 65 tests pass. `npm run lint` / `npm run typecheck` → silent.

### What's left

Phase 3 — pieces and interaction: piece meshes placed via `IBoardLayout`, raycast selection, legal-move highlighting, arced move animation, capture removal. It unlocks playing the game with the mouse on the 3D board.

### Risks / things I'm unsure about

- **Piece models.** Phase 3 needs six GLB meshes with a compatible licence. I have none yet; if sourcing stalls I will build placeholder primitives (cylinders/cones) so interaction work is not blocked, and swap the models later.
- **Cell picking against merged meshes** (carried from Phase 1) becomes real work in Phase 3.
- **Threefold repetition is detected by chess.js from the loaded position onward.** A game resumed from a FEN (Phase 11 save/load) would lose earlier repetitions unless the move list is replayed instead of the FEN loaded. Note for Phase 11: save the move list, not just the FEN.
- **Draw claims are automatic.** The engine reports fifty-move and threefold as an immediate draw rather than a claimable one. Simpler and fine for a casual game; recorded in case it ever matters.

---

## Phase 3 — Pieces and interaction

**Date:** 2026-09-02
**Project completion: 28%**

### In plain English

You can now play chess on the 3D board with the mouse. Click a piece and its legal moves light up green (captures red); click a destination and the piece hops there in an arc; captured pieces vanish; a king in check glows red; pawns reaching the far side ask what to become. Both sides are played by hand for now. The pieces are simple faceted shapes generated by the game itself — no downloaded models.

### What I built

- `src/world/pieces/IPieceMeshFactory.ts` — seam for "give me a piece object" (D-013).
- `src/world/pieces/PieceGeometry.ts` — lathe profiles for all six pieces, knight head silhouette, king cross, shared plinth.
- `src/world/pieces/ProceduralPieceFactory.ts` — the factory; caches 6 geometries + 2 materials.
- `src/world/pieces/PieceLayer.ts` — square → object bookkeeping; the only file that sets a piece transform (position + yaw only).
- `src/world/pieces/MoveAnimator.ts` — eased arc travel, tick-driven, promise-based.
- `src/world/pieces/HighlightLayer.ts` — translucent overlays built from real cell polygons.
- `src/world/pieces/BoardView.ts` — `IBoardView` for the game: sequences mover, castle rook, capture removal, promotion swap.
- `src/world/scene/PointerInput.ts` — click vs. orbit-drag discrimination, emits NDC.
- `src/world/scene/BoardPicker.ts` — raycast → square via point-in-polygon (D-015).
- `src/world/scene/createLights.ts`, `createRenderer.ts`, `builders/CellBuilder.ts` — shadows on, frustum from bounds (D-016).
- `src/world/scene/createCamera.ts` — steeper default (back-rank pieces were occluding pawns).
- `src/domain/board/polygon.ts` — `containsPoint` for convex polygons (+ tests).
- `src/shared/events/EventBus.ts` — typed pub/sub (+ tests).
- `src/game/GameEvents.ts`, `IBoardView.ts`, `IPromotionChooser.ts`, `GameLoop.ts` — the click → move state machine (D-014).
- `src/ui/StatusBar.ts` — whose move / check / result / illegal-move flash.
- `src/ui/PromotionPrompt.ts` — four-button chooser; Escape or click-outside cancels the move.
- `src/app/bootstrap.ts` — wires world, game, ui, input.
- `tests/game/GameLoop.test.ts` — 11 tests with fake view and scripted chooser. 85 tests total.

### Why it was done this way

- **Procedural pieces (D-013)** — you chose this over sourcing GLBs. Zero licensing, origin at the feet by construction, profiles are editable numbers. The factory seam means GLBs can still come later.
- **`IBoardView` between game and world (D-014)** — the turn loop has no three.js in it, so it is tested headless with a fake view; Phase 4's AI and Phase 11's undo are `GameLoop`-only changes.
- **Point-in-polygon picking (D-015)** — closes the D-010 risk without un-merging the board; works unchanged on the warped layout.
- **`Move` already carries the facts** — `BoardView.playMove` animates castling and en passant with no rules knowledge, exactly as planned in Phase 2.
- **Shadows now (D-016)** — upright pieces float without contact shadows; low-poly needs them to read.
- **Rejected:** per-cell pick meshes (64 extra objects to maintain); triangle-index → square table (couples picker to CellBuilder internals); auto-queen (wrong chess — you chose the chooser).

### How to check it yourself

1. `npm run dev` — the board now has 32 pieces, seen from White's side, with shadows.
2. Click the e2 pawn: it glows yellow, e3 and e4 glow green. Click e4: it hops there. Status reads _Black to move_.
3. Click a black pawn, then somewhere it cannot go: the selection simply clears (illegal destinations are never played).
4. Set up a capture (e.g. …d5 then exd5): the target glows red, the captured piece disappears when the mover lands.
5. Drag to orbit — nothing gets selected. Pieces stay upright from every angle.
6. Give check: the king's cell glows red and the status bar says _— check_. Checkmate ends input.
7. `npm run test` → 7 files, 85 tests. `npm run lint` / `npm run typecheck` → silent.

### What's left

Phase 4 — the computer opponent: single-threaded Stockfish WASM in a Web Worker behind `IChessAI`, three difficulty levels, never blocking the render thread. After that, the plan's milestone: a complete chess game.

### Risks / things I'm unsure about

- **Piece proportions are a first pass.** They read correctly (rook, knight, bishop distinguishable) but the queen/king could be taller relative to pawns. All numbers are in `PieceGeometry.ts`.
- **Promotion prompt verified by test, not by eye.** `GameLoop` tests cover choose/cancel; the DOM overlay was reviewed but I did not play 6 pawn moves to trigger it in the browser.
- **Shadow map is one 2048² cascade.** Fine on a 2 km flat board; when the warped board adds vertical relief the sun's `near`/`far` may need widening — both derive from `BoardBounds` height so it should follow automatically, but measure in Phase 9.
- **Occlusion and picking.** Pieces in front can still occlude a cell behind at low camera angles. Clicking the piece resolves to its own square, so a mis-pick just selects/deselects; never an unintended move.
- **No undo in the UI yet** (deliberately — Phase 11). During hot-seat testing that is mildly annoying.

---

## Phase 4 — The computer opponent

**Date:** 2026-09-02
**Project completion: 36%**

> **Milestone reached: a complete, working chess game.** Everything from here on makes it MapChess.

### In plain English

You can now play against the computer. Pick your colour and one of three strengths — Beginner, Club, Strong — and press New game. The engine is Stockfish, the strongest chess program in the world, running inside the browser in a background thread, so the board keeps moving smoothly while it thinks. It is verified never to play an illegal move, and if the engine ever fails to load, the game carries on with a weak fallback rather than freezing.

### What I built

- `scripts/copy-engine.mjs` + npm `postinstall`/`predev`/`prebuild` — copies the single-threaded Stockfish build and its licence into `public/engine/` (git-ignored) (D-017).
- `src/ai/IChessAI.ts` — the seam: `ready`, `setDifficulty`, `chooseMove(fen)`, `dispose`.
- `src/ai/difficulty.ts` — Beginner / Club / Strong → Skill Level 1 / 8 / 20, think time 0.3 / 0.8 / 1.5 s.
- `src/ai/uci.ts` — `bestmove` / `uciok` / `readyok` parsers (+ 6 tests).
- `src/ai/errors.ts` — `EngineError` with reason.
- `src/ai/StockfishAI.ts` — Web Worker plumbing: UCI handshake, options, one request at a time, every wait timed out.
- `src/game/GameLoop.ts` — `Players` seating, `newGame()`, AI turn handling, legality guard, fallback, stale-reply protection (D-018). 9 new tests with a scripted AI.
- `src/game/GameEvents.ts` — `ai-thinking`, `ai-error`.
- `src/ui/OpponentPanel.ts` — colour, strength, New game; includes Hot-seat and Watch (AI vs AI).
- `src/ui/FpsMeter.ts` — frame-rate readout, shown with `?debug`.
- `src/ui/StatusBar.ts` — "… is thinking", engine-problem flash.
- `src/app/config.ts`, `bootstrap.ts` — engine URL, seating defaults, wiring.

### Why it was done this way

- **Plan assumption checked before building (D-017).** The plan names `stockfish.wasm`; its README requires `SharedArrayBuffer`, the very thing §3 rules out. The `stockfish` (nmrugg) package ships real single-threaded builds; probed under Node before any browser code was written.
- **Copied static files, not a bundled import.** The Emscripten glue finds its `.wasm` next to its own URL; Vite's hashing would break that. 7 MB stays out of git.
- **Trusted but verified (D-018).** One `isLegal` check per AI move buys the "always legal" guarantee regardless of engine behaviour. Timeouts on every wait mean a broken download yields a weak opponent, not a hang.
- **Difficulty by Skill Level, not Elo.** Skill Level deliberately picks sub-optimal moves with randomness, which feels more human at low levels than a capped Elo search. Numbers live in one table for tuning.
- **Rejected:** `stockfish.wasm` (SAB); full 40 MB build (slow load, no benefit vs. a human); running search on the main thread (would stall rendering — the whole point of the worker).

### How to check it yourself

1. `npm run dev` and open the URL. Panel bottom-left: **Play White · Club · New game**.
2. Play e4 (click e2, then e4). Status reads _Black is thinking…_, then Black replies within about a second.
3. Add `?debug` to the URL: the bottom-right frame counter should read 60 fps the whole time the engine thinks.
4. Choose **Play Black · Strong · New game** — White (engine) opens immediately.
5. Choose **Watch (AI vs AI) · Beginner · New game** — a whole game plays out to a result with no _Engine problem_ flash. My run: checkmate in 55 s, 60 fps throughout, no console errors.
6. Try to beat Strong. I could not.
7. `npm run test` → 9 files, 99 tests. `npm run build` → `dist/engine/` contains the 7 MB engine.

### What's left

Phase 5 — area selection: a MapLibre 2D picker with search, a draggable rotatable square, and the projection helpers (lat/lon ↔ local metres, board-orientation rule D-007). First step toward the map.

### Risks / things I'm unsure about

- **Stockfish is GPL-3.0.** It runs as a separate worker binary and its licence ships alongside, but if you ever want MapChess under a non-GPL licence, this is the dependency to revisit. Phase 12 must add the visible credit.
- **Difficulty tuning is a first guess.** Beginner (Skill 1) blunders plenty; Club (Skill 8) is a decent club player; Strong is full-strength Stockfish and will beat anyone. If Club feels too strong or Beginner too random, `difficulty.ts` is one table.
- **7 MB engine on first load.** ~1–2 s on broadband, cached afterwards. Phase 11's loading states should show progress; the engine emits download progress if asked.
- **Untested in Safari/Firefox.** Classic-worker WASM should be fine everywhere, but I only verified in the embedded Chromium.
- **`newGame()` while the engine thinks** drops the stale reply (tested) but does not send `stop`, so the worker finishes its search in the background first. Harmless; a few hundred ms of wasted CPU.

---

## Phase 5 — Area selection

**Date:** 2026-09-02
**Project completion: 43%**

### In plain English

You can now choose _where_ your chessboard will be. Press **Choose area…**, search for a place, drag the 2 km square over the exact patch of land you want, turn it so the side you'll sit on faces the way you like, and confirm. The game remembers the choice and prints the exact coordinates of the four board corners. The 3D board is still the plain grey one — the terrain arrives in the next phases — but every later step reads this selection.

### What I built

- `src/mapdata/model/SelectedArea.ts` — the four numbers that define a board's place on Earth, plus validation.
- `src/mapdata/model/AreaProjection.ts` — lat/lon ↔ local metres ↔ board frame with rotation. The single place the axis convention (D-007) is applied.
- `src/mapdata/model/MapArea.ts` — `describeArea()` → corners named by board role (a1/h1/h8/a8), bounding box, GeoJSON ring.
- `src/mapdata/net/fetchJson.ts` — the one network call helper: timeout, retries, typed `NetworkError`.
- `src/mapdata/cache/RateLimiter.ts` — minimum-interval gate for shared services.
- `src/mapdata/geocode/NominatimGeocoder.ts` — `IGeocoder` + Nominatim (D-020), with an exported parser.
- `src/ui/AreaPicker.ts` — MapLibre overlay: search, draggable + rotatable square, White's edge marked, readout, confirm/cancel (D-019, D-021).
- `src/ui/AreaBar.ts` — current-area summary, opens the picker, logs the full corner report.
- `src/app/config.ts` — basemap URL, default area (Holy Island of Lindisfarne).
- `tests/mapdata/MapArea.test.ts` (17) and `tests/mapdata/geocode.test.ts` (6) — projection round-trips, rotation cases, orientation rule, parser fixture, rate limiter with a fake clock. 122 tests total.

### Why it was done this way

- **One projection, applied once.** Elevation samples (Phase 6), OSM features (Phase 7) and cell polygons (Phase 8) all pass through `AreaProjection.toBoard()` and come out in the same Y-up metre frame. No other layer ever sees latitude.
- **Corners named by board role, not compass.** After rotation the "south-west" corner may point anywhere; `corners.sw` always means a1. This is D-007 as code, and it is what the picker draws.
- **The picker draws `describeArea()` (D-021).** One geometry; the map and the board cannot disagree.
- **Free services, guarded (D-019, D-020).** OpenFreeMap and Nominatim need no keys. Both go through `fetchJson` timeouts; Nominatim through a 1 req/s limiter, search-on-submit only.
- **MapLibre worker registered explicitly (D-019).** Under Vite, MapLibre 6's own worker lookup fails silently — a blank map, no error. Diagnosed via the engine's internal actor state; fixed with `?worker&url` + `setWorkerUrl()`; verified in dev and production preview.
- **Rejected:** a fixed square with the map panning underneath (works, but the plan says "draggable square" and dragging the shape is more direct); autocomplete search (forbidden by Nominatim policy); embedding a second copy of the corner maths in the picker.

### How to check it yourself

1. `npm run dev`. Top-left shows _Area 55.6785, −1.7937 · 2 km · 0°_. Click **Choose area…**.
2. Holy Island appears with a yellow 2 km square; its bottom edge is bright white — that is White's back rank.
3. Type _Rievaulx Abbey_ and press Enter; click the result. The map flies there and the square follows.
4. Drag the slider to 35°: the square turns, the white edge turns with it. Drag inside the square to move it; drag outside to pan.
5. Click **Use this area**. The overlay closes, the top-left summary updates, and the console prints a block with centre, rotation and the four corners (a1 marked _White's left_).
6. Press Escape or **Cancel** in the picker: nothing changes.
7. `npm run test` → 11 files, 122 tests. `npm run build` → `dist/assets/maplibre-gl-worker-*.js` is emitted.

### What's left

Phase 6 — elevation: the throwaway Terrarium tile spike first, then `HeightField`, sampling, IndexedDB cache, and three offline fixture areas. The selected area from this phase is its input.

### Risks / things I'm unsure about

- **Two more free community services.** OpenFreeMap has no stated limits but no SLA; Nominatim will block abusers. Both fail visibly (map error in the panel, search message), but a game with no picker is a flat-board game. Phase 6's fixtures matter for the same reason.
- **`mapdata/net/` and `mapdata/geocode/` are new subfolders** not in the plan's tree. Small and single-purpose; READMEs updated.
- **Picker is desktop-only.** Mouse events for the square drag; touch comes with D-003's Phase 12 pass.
- **The selection is not yet used by the board** — deliberately. Phase 8 consumes it; until then the flat board ignores it.
- **Bundle is 1.6 MB (425 kB gzipped)** now that three.js, chess.js and MapLibre are all in one chunk. Fine for now; Phase 12 should split the picker into its own chunk.

---

## Phase 6 — Elevation layer

**Date:** 2026-09-02
**Project completion: 52%**

### In plain English

The game can now find out the shape of the ground for any chosen area: how high every point is, in metres. It fetches free elevation tiles from the internet, stitches them into a grid lined up with the board, and remembers them so the second time is instant. A small panel shows the result as a grey-scale picture — white is high, black is low — and you can already recognise Holy Island's outline and Malham's dry valley in it. Three areas ship inside the game so it works with no internet at all.

### What I built

- **Spike first, as the plan demanded (D-022).** Terminal probe: 200, `image/png`, CORS `*`. Browser probe: four areas decoded, min/max sensible (coast −22…18, Alps 1515…2970). Only then was code written.
- `src/mapdata/elevation/TileMath.ts` — Web Mercator arithmetic, `zoomForResolution`, tile ranges.
- `src/mapdata/elevation/terrarium.ts` — RGB → metres and the inverse for test fixtures.
- `src/mapdata/model/HeightField.ts` — the grid type, `sampleHeight` (bilinear) and `sampleStats(polygon)` → min/mean/max.
- `src/mapdata/elevation/assembleHeightField.ts` — tile mosaic → board-aligned field in one resampling pass (rotation + Mercator handled together).
- `src/mapdata/elevation/IElevationProvider.ts`, `TerrariumElevationProvider.ts` — the seam and the browser implementation: cache → fetch → decode → assemble, 4 in flight, failed tile = sea level + log.
- `src/mapdata/cache/TileCache.ts` — `IndexedDbTileCache` (every error degrades to a miss) and `MemoryTileCache`.
- `src/mapdata/net/fetchJson.ts` — now also `fetchBlob`, sharing the timeout/retry policy.
- `src/mapdata/elevation/heightFieldFixture.ts`, `fixtureAreas.ts`, `FixtureElevationProvider.ts`, `fixtures/*.json` — three offline areas (D-023), code-split.
- `scripts/make-fixtures.ts` + `npm run make-fixtures` — regenerates fixtures via the shared assembly code.
- `src/mapdata/elevation/ElevationLoader.ts` — area chosen → provider → view, with cancellation; defines `IElevationView`.
- `src/ui/HeightmapDebugPanel.ts` — grey-scale canvas + caption (range, grid, source, timing).
- `src/shared/encoding/base64.ts` — browser base64 for typed arrays.
- `tests/mapdata/elevation.test.ts` — 21 tests: tile maths vs. the spike's indices, the Terrarium formula, bilinear sampling on a plane, polygon stats, mosaic assembly (incl. north–south sign), fixture round-trip, the shipped fixtures' ranges, fixture-first routing. 143 total.

### Why it was done this way

- **Resample once into the board frame.** Every consumer gets an axis-aligned grid in metres with +X east / +Z south; rotation and Mercator distortion are solved in one place. Phase 8 samples cells with `sampleStats`; Phase 9 builds a mesh with `sampleHeight`.
- **Fixtures from the same code path (D-023).** Only the PNG decoder differs between Node and browser; a fixture is therefore a real regression baseline, not a mock.
- **Fixture → cache → network chain.** `FixtureElevationProvider` wraps `TerrariumElevationProvider`, which wraps `IndexedDbTileCache`. app/ wires one object. Development at the three fixture areas touches no network at all.
- **Failure degrades, never blocks.** A bad tile is sea level with a console error; a bad request shows its reason in the panel; IndexedDB trouble is a cache miss.
- **Rejected:** Mapbox Terrain-RGB (needs a token; spike made it unnecessary); caching assembled fields by area instead of tiles (tiles are shared across neighbouring/rotated areas, fields are not); a `<canvas>`-free PNG decoder in the browser (createImageBitmap is fast and already there).

### How to check it yourself

1. `npm run dev`. Under the area bar, a grey-scale square appears almost immediately: _Elevation −1…21 m · 241×241 @ 10 m · offline fixture · ~20 ms_. That is Holy Island — you can see the island, the causeway and the tidal flats.
2. **Choose area…**, search _Malham Cove_, pick it, **Use this area**. The caption counts tiles, then reads _network, 6 tiles @ z14 · ~800 ms_. The dark line down the middle is the dry valley north of the cove.
3. Open the picker again and confirm the same area without moving: _cache, 6 tiles · ~35 ms_.
4. Reload the page and repeat step 2: still _cache_ — it survived the reload (IndexedDB).
5. `npm run make-fixtures` regenerates the three fixtures from live tiles and prints their ranges.
6. `npm run test` → 12 files, 143 tests. `npm run build` → three `fixtures` chunks, loaded on demand.

### What's left

Phase 7 — the feature layer: one Overpass query per area for water, coast, forest, peaks and every named place (with `old_name`/`historic`), normalised into `MapFeature[]` in board metres, rate-limited and cached. Then Phase 8 has everything it needs.

### Risks / things I'm unsure about

- **Terrarium is smooth 30 m data upsampled.** Fine for 250 m cells; it will not show a 5 m river bank. The heightmap looks blurry because it _is_ — that is the source, not a bug.
- **No attribution shown yet** for the terrain data (Mapzen/Tilezen, AWS Open Data; sources include SRTM, EU-DEM, etc.). Recorded for Phase 12 alongside OSM and Stockfish.
- **`ElevationLoader` lives in `mapdata/`** but is glue rather than data access. It defines `IElevationView` so it never imports `ui/`; if it grows it should move to `game/` or a new `app/services/`.
- **Vertical exaggeration is not applied here** — heights are true metres. Phase 8 owns the clamp-to-15–20%-of-width rule; the flat Lindisfarne fixture (21 m of relief on a 2 km board) is exactly the case that rule exists for.
- **Fixture JSON adds ~465 KB to `dist/`** (but only ~42–100 KB gzipped per area, and only fetched when that area is chosen).

---

## Phase 7 — Feature layer

**Date:** 2026-09-02
**Project completion: 60%**

### In plain English

The game can now read the map itself: for a chosen area it fetches every river, stream, lake, stretch of coast, wood, moor, hilltop, ridge, ford, settlement, ruin and church that OpenStreetMap knows about, along with every name — including old names where someone has recorded them. A panel lists what it found; the console prints the full report. Picking Malham Cove tonight surfaced "Cawden — old name Cowden" and "Langscar — old name Lanscar" straight away. Three areas ship inside the game so none of this needs the network.

### What I built

- `src/mapdata/model/MapFeature.ts` — twelve `FeatureKind`s, point/line/polygon geometry in board metres, every name variant. No raw tags.
- `src/mapdata/features/overpassQuery.ts` — the one query per area (D-024).
- `src/mapdata/features/normalizeOverpass.ts` — raw Overpass → `MapFeature[]`; classification, area-vs-line rules, multipolygon outer rings, name collection. The only file that reads raw JSON.
- `src/mapdata/features/IFeatureProvider.ts`, `OverpassFeatureProvider.ts` — the seam and the network path: IndexedDB cache → 2 s rate limiter → primary/fallback endpoint → normalise → cache.
- `src/mapdata/features/FixtureFeatureProvider.ts` + `fixtures/*.json` — three raw fixtures, normalised on load (D-025); `scripts/make-feature-fixtures.ts` regenerates them with 429/504 back-off.
- `src/mapdata/features/summarizeFeatures.ts` — counts by kind, deduplicated named list, old/historic flags, text report.
- `src/mapdata/features/FeatureLoader.ts` — glue with cancellation; defines `IFeaturesView`.
- `src/ui/FeaturesDebugPanel.ts` — counts + scrollable name list, old names in yellow.
- `src/mapdata/cache/KeyValueStore.ts` — replaces `TileCache`: one IndexedDB, typed store per data kind, runtime guard on read.
- `src/mapdata/model/fixtureAreas.ts` — the fixture area list, now shared by elevation and features. `paddedBounds()` moved to `MapArea.ts` for the same reason.
- `tests/mapdata/features.test.ts` — 14 tests: query shape, response validation, every classification/geometry rule with synthetic elements, the three real fixtures' counts and names (incl. Gaelic `Abhainn Chomhann` for River Coe), summary dedup, cache keys, fixture routing. 157 total.

### Why it was done this way

- **Probe first, again.** The query was run against all three areas from the terminal before any code, which is how I learned the public instance rejects generic user agents (406) and throttles hard (429/504). Both are handled: browsers are fine, the generator identifies itself and backs off, the provider fails over.
- **Raw fixtures inside `features/` (D-025).** Tests exercise the real normaliser on real tagging; the "raw never leaves the folder" rule holds because the fixtures live in it.
- **Twelve kinds, no raw tags.** Phase 8 needs "where are the waterways and peaks"; Phase 10 needs "what is this called and what sort of thing is it". A closed union with a `subtype` string serves both without leaking OSM's vocabulary.
- **Generic `KeyValueStore`.** One IndexedDB with two typed stores rather than two cache classes; the runtime guard on read means a corrupt or old-format entry is a miss, not a crash.
- **Rejected:** clipping to the board here (Phase 8 wants margin); bridges via highway×waterway intersection (expensive, building-adjacent); caching raw JSON (would leak); a separate area list for features (heights and rivers must describe the same ground).

### How to check it yourself

1. `npm run dev`. Top-right panel: _Features: 93 · 27 named · 0 old/historic · fixture · ~20 ms_, counts by kind, and the names — Lindisfarne Priory, The Heugh, Beblowe Crag…
2. The console has the same as a text report: counts by type, then every name, old names flagged `OLD NAME:`.
3. **Choose area…** → _Malham Cove_ → **Use this area**. After Overpass answers (2–12 s depending on its mood): _275 · 37 named · 3 old/historic · network_. Yellow: _Cawden — old: Cowden_, _Langscar — old: Lanscar_.
4. Confirm the same area again: _cache · ~10 ms_. Reload and repeat: still cache.
5. Pick Glen Coe (a fixture): the River Coe lists with its Gaelic name as historic.
6. `npm run test` → 13 files, 157 tests. `npm run make-fixtures` regenerates both fixture sets.

### What's left

Phase 8 — the warped lattice. It now has everything: `HeightField` with `sampleStats`, `MapFeature[]` with waterways/peaks/places in board metres, three fixture areas to run the invariants across, and `IBoardLayout` to slot into. This is the phase the plan calls "the project".

### Risks / things I'm unsure about

- **Overpass reliability is the worst of the three services.** Tonight: 406, 429, three 504s, and an 11.7 s success. Fixtures + cache + failover make development fine; a first-time player picking a new area may wait 10 s or see an error. Phase 11's loading states must make that honest.
- **`historic` can swamp an area** — Malham returned 166 historic features (field barns, lynchets). Phase 10's scoring must weigh subtype, not count.
- **`name:gd` as "historic name" is a judgement call.** It reads well in the Highlands; in a bilingual town it may be wrong. Confined to one line in `namesOf()`.
- **Multipolygon inner rings are dropped.** A lake inside a wood renders as wood in Phase 9 unless the lake is also present as its own feature (it usually is).
- **Coastline direction** (land on the left) is preserved but not yet used; Phase 8/9 will need it to know which side is sea.

---

## Phase 8 — The warped lattice

**Date:** 2026-09-02
**Project completion: 74%**

### In plain English

The chessboard now takes the shape of the land. Choose Rievaulx and the River Rye runs down the seam between the c- and d-files; Ashberry Hill gets a bigger cell to itself; every cell is a level terrace stepped to the height of its ground, so Glen Coe rises steeply from White's side to Black's while Holy Island stays almost flat. It is still exactly chess — every square has the same neighbours it always had — and you can play the computer on it right now. A debug view shows the 64 labelled cells with the rivers and hilltops drawn over them.

### What I built

- `src/domain/board/TerrainInputs.ts` — what the lattice needs, in domain words: line attractors, point attractors, a height sampler.
- `src/domain/board/geometry.ts` — nearest point on a polyline, convexity, segment crossing.
- `src/domain/board/latticeWarp.ts` — the 9×9 warp: snap-to-line pull weighted by axis alignment, point attractors that slide and enlarge their cell, Laplacian relax, cap + boundary pin, repair loop (D-026). Pure and deterministic.
- `src/domain/board/terrace.ts` — mean-or-minimum platform rule and vertical exaggeration with a flat-area cap (D-027).
- `src/domain/board/WarpedBoardLayout.ts` — `IBoardLayout` #2: warp → scale → 64 cells in ALL_SQUARES order → terrace.
- `src/mapdata/board/buildTerrainInputs.ts` — `HeightField` + `MapFeature[]` → `TerrainInputs`: river/coast weights, peak > town > village > … priorities, clipping to board + margin.
- `src/app/BoardComposer.ts` — flat board immediately, warped when heights and features have both arrived; stale-area protection; flat/warped toggle (D-028).
- `src/world/builders/BoardScene.ts` — applies a layout to the live scene: cells, pieces, highlights, picker, overlay, camera/controls/lights reframe.
- `src/world/builders/DebugOverlayBuilder.ts` — file/rank sprites, river polylines, peak/place markers.
- `src/world/scene/WorldStage.reframe()`, `setLayout()` on `PieceLayer`, `HighlightLayer`, `BoardPicker`.
- `src/ui/BoardDebugPanel.ts` (`?debug`) and an **Example areas** dropdown in `AreaBar` for the three fixtures.
- `tests/domain/board/geometry.test.ts` (10) and `WarpedBoardLayout.test.ts` (18) — the five plan invariants on all three fixture areas, plus flat-board equivalence, meander attraction, diagonal non-interference, point-attractor enlargement, hostile input, parameter override, and the adapter. 185 total.

### Why it was done this way

- **Three attempts, as the plan predicted.** Attempt 1 (spring pull, radius 0.9) barely moved vertices and let the repair loop undo the rest. Attempt 2 (snap within cap, radius 0.5) traced meanders beautifully and turned diagonal rivers into staircases. Attempt 3 weights the pull by axis alignment: on-axis rivers snap, diagonals are left alone. Measured on synthetic rivers, then confirmed by eye on Rievaulx.
- **Repair by blending back, not by rejecting.** The plan says "reject any move that makes a quad non-convex"; blending the four corners of a bad quad halfway to the grid, repeatedly, is that rejection made continuous — it keeps most of the warp and always converges because the grid is valid.
- **Inradius floor = plinth radius.** "Piece size stays constant" is enforced geometrically: a cell that could not hold a plinth is repaired, and the plinth was shrunk to 0.30 cells to match.
- **Flat-area cap on exaggeration (D-027).** 17 % of width for real relief; at most 5 % for coasts. Otherwise Lindisfarne's 2 m of mud would be a mountain.
- **Layout swap as a composer + scene service (D-028).** The plan's promise was "no change outside app/"; the honest result is one app-level composer, one world-level scene service, and `setLayout()` on three classes that previously took the layout in their constructors.
- **Rejected:** Voronoi/watershed cells (not chess); scaling pieces to cells; the prototype's single-pass pull; clipping rivers inside `domain/` (the adapter clips, the lattice stays pure).

### How to check it yourself

1. `npm run dev` and open `/?debug`. Holy Island loads as a warped board almost immediately: gently irregular cells, very little relief, ditches drawn in blue, places as yellow dots.
2. Top-left **Example areas… → Rievaulx**. The River Rye runs along the c/d seam from rank 3 to 6; Ashberry Hill (orange dot) sits inside an enlarged b4; the valley floor cells are lower than the wooded slopes.
3. **Example areas… → Glencoe**: steep terraces rising toward Black; peaks inside cells on the h-file; the glen's streams snapping to edges where they run north–south.
4. Untick **warped board**: the same terrain on a flat grid. Tick it again.
5. Play a move — click e2, then e4. The pawn hops onto its terrace; Stockfish replies. Picking, highlights and animation all work on irregular cells.
6. Drag to orbit: the camera reframed itself to the new relief; 60 fps.
7. `npm run test` → 15 files, 185 tests; the invariant suite runs on all three fixtures.

### What's left

Phase 9 — render the world: a terrain mesh from the `HeightField`, visible terrace edges, water along the warped edges, wood/scrub materials, place-name labels. `WarpedBoardLayout` exposes the lattice and the terrace scale for exactly that.

### Risks / things I'm unsure about

- **Weights are tuned on three areas.** A wide river (two edges' worth) or a dense stream network will behave differently. Everything is in `DEFAULT_LATTICE_PARAMS`; the tests pin the invariants, not the look.
- **Diagonal rivers are deliberately not traced.** They cut through cells as they would on a flat board. The alternative (staircases) looked worse; a future refinement could rotate the whole area to align the main river, which the picker already allows by hand.
- **Terraces are stepped, not sloped.** A steep hillside becomes a stair of 64 flats. That is the plan's intent (readability wins), but Glen Coe's 340 m of relief is dramatic; Phase 9's edge treatment must make the risers read as ground, not walls.
- **`setLayout()` mid-game.** Switching area during a game re-places the pieces from the engine position, which is right, but the animator is not flushed first. Harmless now (area changes are a dev action); Phase 11 should start a new game on area change.
- **The debug overlay walks 64 polygons per feature point** to find heights — fine for a few hundred points, quadratic if a dense area returns thousands. Debug-only.

---

## Phase 9 — Render the world

**Date:** 2026-09-02
**Project completion: 84%**

### In plain English

The board now looks like the place. Rievaulx is a green valley: the River Rye runs blue along the cell seams, the wooded slopes are dark green, the farms are labelled, and the real hills continue past the edge of the board. Glen Coe is a stair of brown moorland climbing toward Black with streams threading down it. Holy Island sits in the sea with sand at the tideline. All three run at 60 frames per second.

### What I built

- `src/world/builders/WorldModel.ts` — the one bundle the renderer reads; `heightToY()` applies the layout's exaggeration.
- `src/world/builders/palette.ts` — every colour in one file.
- `src/mapdata/board/classifyCellCover.ts` — grass / wood / scrub / water / sand per cell (D-030). `domain/board/polygon.pointInPolygon` added for non-convex woods and lakes (+ tests).
- `src/world/builders/CellBuilder.ts` — rewritten: tops merged by (cover, shade), one riser mesh, one outline `LineSegments`; still zero 8×8 maths.
- `src/world/builders/TerrainBuilder.ts` — landscape margin from the `HeightField`, triangles under the board dropped, height-tinted vertex colours (D-029); `skirtDepthFor()` so cell sides reach the ground.
- `src/world/builders/WaterBuilder.ts` — river/stream ribbons by width class lying on the terraces, lakes via `ShapeGeometry`, a sea plane on coastal boards clamped below the lowest platform.
- `src/world/builders/LabelBuilder.ts` + `textSprite.ts` — up to 16 place names, one per cell, by priority; the debug overlay now shares the sprite code.
- `src/world/builders/BoardScene.ts` — takes a `WorldModel`, builds and disposes everything.
- `src/app/BoardComposer.ts` — emits the `WorldModel` (layout + heights + features + cover + exaggeration).
- `src/ui/FpsMeter.ts` — now shows draw calls and triangles.

### Why it was done this way

- **Terraces are the ground inside the board (D-029).** Any continuous terrain under the platforms either pokes through or z-fights; dropping it makes the playing surface unambiguous, and the margin of true relief says what was cut. Water follows the same rule: platform height inside, terrain height outside.
- **Two shades per land cover (D-030).** A cell must read as both "forest" and "a dark square". Outlines cover the same-cover-same-shade case.
- **Merged by material, measured.** Board ≤ 12 calls, terrain 1, water ≤ 3, labels ≤ 16. Whole scene 78–87 calls including 32 pieces and their shadow passes; 28–30k triangles. 60 fps on all three fixtures with the meter visible.
- **Every-second height sample for the margin.** 241² → 121² grid, ~29k triangles; the margin is context, not the subject.
- **Rejected:** tree meshes (thousands of instances for a low-poly board that already reads as forest by colour); a river shader (a flat ribbon is the low-poly answer); terrain under the board with raised platforms (floating pieces); textures (D-002).

### How to check it yourself

1. `npm run dev` → `/?debug`. **Example areas… → Rievaulx.** Untick _cell labels_ and _rivers & peaks_ to see the plain render. The Rye is a blue ribbon down the c/d seam; Ashberry Wood and Abbot Hagg Wood are dark green; farms are labelled; the valley sides continue as terrain beyond the board.
2. **→ Glencoe.** Brown moorland terraces climb toward Black; streams thread the cells; Aonach Eagach's slopes rise behind.
3. **→ Lindisfarne.** Sea all round; sand-coloured cells at the tideline; the drainage ditches as a fine blue net.
4. Bottom-right meter: **60 fps · 78–87 calls · 28–30k tris** on every area. Untick _warped board_: 68 calls / 19k for the grey board.
5. Click a pawn and a square ahead of it — the move plays on the terraces and Stockfish answers. (Cells have moved; e2 is where the e2 pawn stands, not where it was on the flat board.)
6. `npm run test` → 15 files, 187 tests.

### What's left

Phase 10 — terrain theming: score cells and features to give every piece an identity (rook = the peak, bishop = the abbey, knight = the ford…) and every cell a display name via the fallback chain, shown when a piece is selected. Everything it needs — `MapFeature[]`, `CellCover`, per-cell heights, names with old-name flags — is already in the `WorldModel`.

### Risks / things I'm unsure about

- **Diagonal streams cut across cells** (Phase 8's deliberate choice) and now they are visibly blue doing it. Glen Coe has a lot of them. It reads as "streams on a hillside" rather than "broken board", but it is the least tidy part of the picture.
- **Drain/ditch networks can be noisy** — Lindisfarne's middle is a lattice of 2.5 m ribbons. A minimum-length or minimum-width filter is a one-line change in `WaterBuilder`.
- **Labels overlap pieces** at the default camera angle; they sit at 2.2 label-heights above the platform. Phase 10 replaces them with per-cell identity shown on selection, so I have not tuned them further.
- **Shadow acne on steep risers** is visible at some angles on Glen Coe. `normalBias` is already set; the map is one 2048² cascade. If it bites, a second cascade or a larger bias.
- **No terrain under the flat board.** In flat mode the landscape is hidden entirely; a "flat board in its landscape" would be a cheap addition if wanted.

---

## Phase 10 — Terrain theming

**Date:** 2026-09-02
**Project completion: 91%**

### In plain English

Every piece is now somebody. Click White's rook at Rievaulx and a card appears: _♖ Ashberry Hill — White's rook — the summit of Ashberry Hill, 99 m_. The bishop is St Mary the Virgin; the king is the village; a knight is Bridge Cottage, because of its name. Black takes its own identities from its own side of the valley. Every one of the 64 cells has a name too — a real one where OpenStreetMap has one, a borrowed one ("Below Ashberry Hill") where a named thing is close by, and a made-up one ("High Moor", "Nether Meadow") where there is nothing at all — so the board is never blank, even in an empty field. The identities follow the pieces as they move.

### What I built

- `src/domain/theme/types.ts` — `CellFacts` in, `CellIdentity` + `PieceIdentity` + `BoardTheme` out; the theme's own vocabulary, no mapdata imports.
- `src/domain/theme/wordlists.ts` — religious and horse/cattle stems (whole-word matching), generated-name vocabulary.
- `src/domain/theme/nameCells.ts` — the fallback chain (old_name → historic → name → nearby → generated), ground descriptions, a uniqueness pass (D-032).
- `src/domain/theme/assignPieces.ts` — scorers per piece type; per-colour halves; two-pass greedy with knights before bishops (D-031).
- `src/domain/theme/buildBoardTheme.ts` — the entry point.
- `src/mapdata/theme/buildCellFacts.ts` — `IBoardLayout` + `MapFeature[]` + `CellCover` → `CellFacts[]`: features inside each cell, named features within 450 m at their distance, real heights via the exaggeration inverse, coastal flag.
- `src/game/PieceTracker.ts` — identities follow moves, captures, castling, promotion (+ undo).
- `src/game/ThemeTracker.ts` — wires the tracker to `game-started` / `move-played`; answers "what is on this square?".
- `src/game/GameEvents.ts`, `GameLoop.ts` — new `game-started` event.
- `src/ui/IdentityCard.ts` — the reveal on `selection-changed`.
- `src/app/BoardComposer.ts`, `WorldModel.ts` — the theme is built with the warped board and travels in the model.
- `tests/domain/theme/theme.test.ts` (13) and `tests/game/PieceTracker.test.ts` (3) — the chain rule by rule, the assignment rules on a hand-built board, a board with **no data at all**, determinism, completeness + uniqueness + own-half on all three fixtures, and named expectations (Rievaulx → king/queen, an Abbey/St Mary bishop, Ashberry Hill rook; Glen Coe rooks are summits/ridges/highest). 203 total.

### Why it was done this way

- **Domain stays pure.** The theme never sees `MapFeature`; the adapter translates once. It is tested with hand-written facts in the same file as the fixture runs.
- **Two-pass assignment (D-031).** One greedy pass let a knight's weak fallback take the church and a bishop take the only ford. Strong matches first, fallbacks after, is simple, deterministic and keeps the "why" string honest.
- **Terrain-only floors everywhere.** Every scorer bottoms out in height, cover or water, so an empty rural square still gives rooks the high ground, knights the streams, bishops the woods — BUILD_PLAN §8's sparse-naming case, built alongside the happy path as §1 demanded.
- **Uniqueness pass (D-032).** Real areas have one wood across six cells and one river along eight; without it, eight pawns were all "Abbot Hagg Wood".
- **Identities live in `game/`, not the engine.** chess.js knows squares; `PieceTracker` remembers who is who through captures, castling and promotion ("a queen, once a pawn").
- **Rejected:** identity from the home square's own cell (a1 is rarely a peak); a global assignment optimiser (opaque); putting the reveal in the 3D scene (a DOM card is legible and free).

### How to check it yourself

1. `npm run dev` → `/?debug` → **Example areas… → Rievaulx**.
2. Click White's h1 rook: _♖ Above High Ash Plantation — the highest ground on this side, 169 m_. Click the g1 knight: _the crossing where Hagg Hall meets the water_. Click a pawn: _from the wooded low ground, by a stream_, standing on Abbot Hagg Farm.
3. Click an empty cell: just its name and ground (_e4 · wooded low ground, on the river, 71 m_).
4. Move a piece; click it again on its new square — same identity, new "standing on".
5. **→ Glencoe**: bishops carry the Gaelic _Abhainn Chomhann_ as an old name; rooks are summits and ridges. **→ Lindisfarne**: bishops are St Cuthbert's, rooks the cliffs and ridges, the queen is Red Brae.
6. `npm run test` → 17 files, 203 tests.

### What's left

Phase 11 — the game shell: menu, new game, side and difficulty, move list, captured pieces, undo, resign, game over, save/load (with the area), loading and error states. The pieces now have names for the move list to use.

### Risks / things I'm unsure about

- **Rievaulx's kings are humble.** White's half has no village, so its king is "the isolated dwelling of Scawton Croft" — correct by the rules, a little bathetic. A future refinement could let one colour borrow the other half's second-best settlement when its own half has none above "farm".
- **Borrowed names dominate rural boards.** Glen Coe is 28 "By/Near/Below X" cells out of 64. Honest, but repetitive; more varied prefixes or blending with generated nouns ("Coe Water Meadow") would read better.
- **Stem lists are English-first.** Gaelic/Welsh church and horse words (cill, llan, each, capall) are absent after I removed two fuzzy stems; a curated list per language is the proper fix.
- **Reasons are templated English.** They read fine ("the summit of Ashberry Hill, 99 m") but a native speaker will spot the seams ("the isolated dwelling of").
- **Mid-game area change keeps old identities** (deliberate). Phase 11 should start a new game on area change, which removes the edge case.

---

## Phase 11 — Game shell

**Date:** 2026-09-03
**Project completion: 97%**

### In plain English

You can now start, play, quit and resume without ever opening the console. Opening the page brings up a menu over the loading board: resume the game you left — it comes back on the same square of the world, with the same moves and the same names — or pick a side, an opponent strength and a place, and start a new one. While you play, the left column keeps the score: which pieces have been taken, who is ahead in material, and every move in notation, each one hovering to tell you where on the map it happened ("Nf3 — Hagg Wood Edge"). Three buttons sit under it: Menu, Take back, and Resign, which asks once before it believes you. When the game ends a card names the result and the winning king — _Rievaulx Abbey holds the field_. Everything is saved as you go; there is no save button to forget. And if the terrain or the map data fails to download, you are now told so, with a button to try again, instead of watching a board that never arrives.

### What I built

- `src/game/GameOutcome.ts` — checkmate / draw / resignation as one value; `outcomeOf(status, resignedBy)` (D-033).
- `src/game/captures.ts` — `summariseCaptures(moves)`: both piles and the material balance, promotions included, folded from the history.
- `src/game/GameLoop.ts` — `undo()` (rewinds to the human's turn), `resign(color)`, `restore(saved)` (replays a move list without animating), `canUndo()`, `outcome`; publishes `history-changed`, `move-undone` and `game-over`.
- `src/game/GameEvents.ts` — the three new events.
- `src/game/ThemeTracker.ts` — an undo stack of `{ move, captured }` so a take-back puts a captured piece's story back; `king(color)` for the result card.
- `src/game/SavedGame.ts` — the save record and `isSavedGame`, which validates every field (D-034).
- `src/game/SaveManager.ts` — autosave on `history-changed` / `game-over`, and `resume(loop)`.
- `src/shared/storage/LocalJsonStore.ts` — one typed JSON value under one key, where every failure means "nothing saved"; `MemoryJsonStore` for tests.
- `src/ui/MainMenu.ts` — resume, side, difficulty, area, Escape to dismiss. Replaces `OpponentPanel.ts`, now deleted.
- `src/ui/GameControls.ts` — Menu / Take back / Resign, with a "Really resign?" confirmation on the button itself.
- `src/ui/RecordPanel.ts` + `MoveList.ts` + `CapturedRow.ts` — the left column, all three fed by `history-changed`.
- `src/ui/GameOverScreen.ts`, `src/ui/outcomeText.ts` — the result card and the English for a result, shared with the status bar.
- `src/ui/DataStatus.ts` — loading and failure for elevation and Overpass, visible outside `?debug`, with Retry.
- `src/ui/AreaBar.ts` — `label`, `setArea()` and a public `open()`, so the menu and a resumed save can drive it.
- `src/app/bootstrap.ts`, `config.ts`, `styles.css` — the wiring, the save key, and the shell's styles.
- `tests/game/GameLoop.shell.test.ts` (14), `tests/game/save.test.ts` (14), `tests/game/captures.test.ts` (6). 237 total, up from 203.

### Why it was done this way

- **Resignation is not a rule** (D-033). `GameStatus` stays what chess.js can derive from a position; the loop holds `resignedBy` and folds the two into a `GameOutcome`. The engine remains a pure function of the position.
- **Saves are moves, not a FEN** (D-034). Replaying gives back the move list, the repetition history and the undo stack, and validates itself on the way in — a save that no longer applies stops at the bad move instead of inventing a position. The area is saved; the board, the terrain and all 64 names are rebuilt from those four numbers.
- **One event carries the whole history** (D-036). The move list, the captured pieces and the save all rebuild from `history-changed`, so undo needed no special case in any of them.
- **Undo hands the board back to the player** (D-035): one ply hot-seat, two against the computer. Mate can be taken back; a resignation cannot.
- **A new area is a new game** (D-037), which closes the mid-game re-theming edge case Phase 10 left open.
- **Rejected:** a `resigned` kind in `GameStatus`; several save slots; a blocking `confirm()` for resigning (it freezes the render loop — the button changes its mind instead); replacing the status bar, which turned out to still be the line players read most.

### How to check it yourself

1. `npm run dev` → the menu is over the board. **New game** → play a few moves. The left column fills; hover a move to see where it happened.
2. Reload the page. The menu now offers **Resume game** with a move count and a timestamp — take it, and the position, the history and the board all come back.
3. Take a piece, then **Take back**: the piece returns _and_ so does its name — click it and the identity card shows the story it had before it was captured.
4. **Resign** → click twice → the result card names the winner's king. Take back is now refused; the menu starts a fresh game.
5. Play into a checkmate (1. f3 e5 2. g4 Qh4#) → the card appears → **Take back** un-ends it and the card goes away.
6. Change the area from the menu or the bar: a new game starts on the new ground.
7. Offline (or with the network throttled to fail): the pill at the bottom says which of terrain or map features could not be loaded, with **Try again**.
8. `npm run test` → 20 files, 237 tests. `npm run lint`, `npm run typecheck`, `npm run build` all clean.

### What's left

Phase 12 — polish and ship: a performance pass, the mobile check if wanted, **on-screen OSM and Terrarium attribution** (the ODbL requirement — it is currently only in the README, which does not satisfy it for the running app), README screenshots, and deployment to static hosting. Reported below.

### Follow-ups after playing it

Four things surfaced the first time the game was actually played, all fixed on the same day:

- **Two overlay bugs made the shell unusable at first.** `hidden` was being defeated by the author `display: flex` on the menu, game-over and data-status overlays — an author `display:` rule outranks the browser's `[hidden] { display: none }` whatever the specificity — so the game-over card sat permanently over the menu and swallowed its clicks. There was also no `z-index` anywhere, so paint order was DOM order and the HUD floated over the modals. Fixed with a global `[hidden] { display: none !important }` and four explicit stacking levels. Neither could have been caught by the suite: there is no DOM in it.
- **Nobody could castle.** The king's destination is two files away across apparently empty board, and clicking the rook just re-selected it. The rook is now a castling destination in its own right, and is highlighted as one (D-038).
- **Faces turned away from the sun read as black** once the camera came round to them. Added a dimmer, shadowless fill light opposite the key and lifted the hemisphere ground tone; the sun stays put so shadows do not swing while orbiting.
- **Panning was there but invisible.** It is on right-drag and two fingers, as OrbitControls ships it, but nothing said so. The target is now clamped to within half a board of the edge so panning cannot lose the game, and both the menu and the new bottom-right cluster say how to move the camera.
- **The labels got an off switch** (D-038), and are smaller and fewer. They were later redrawn as haloed text with a marker and colour per kind of place, and the switch became three-state — names, markers only, off (D-044). Then they came off the billboards entirely: each label now lies flat on its cell, squared to the board, wrapping long names onto two lines, with the name revealed on hover in markers mode (D-045).
- **The pawn and the bishop were the same round blob**, and reshaping the profiles did not fix it — two lathed pieces are two turned blobs whatever the numbers say. The bishop stopped being a solid of revolution: its mitre is now an extruded silhouette like the knight's head, complete with the slit, so it has flat sides and a real facing (D-040). The pawn was simplified and shortened to 0.52 at the same time. `tests/world/PieceGeometry.test.ts` is the first test in `world/` — lathe and extrude are pure maths, so the height order, the footprint limit and "which heads are round" can all be asserted.
- **A piece with no legal moves answered a click with silence.** Selecting a pinned knight highlighted its square and showed nothing else, which reads as a broken game rather than as the rules working. `IChessEngine.isPinned(square)` answers "why can this not move?" — it lifts the piece on a copy of the position and asks whether the king is then attacked — and the loop emits `selection-blocked`, which the status bar flashes: _"That knight is pinned — moving it would expose your king."_ Distinguishes pinned from in-check from simply boxed in.

- **"Beginner" was not a beginner.** Skill Level 1 with a 300 ms search is a strong club player: Skill Level shuffles the order of moves that are all good, and it never stops the engine seeing a tactic. There are now five levels, and the two easiest are capped by search _depth_ (1 and 3 plies) rather than by Skill Level, because depth is the only knob that makes the engine actually miss things (D-041). The adapter also reads the options the engine advertises during the handshake and sends only those — an unrecognised `setoption` is ignored silently by UCI, which would mean a level that quietly never applied.

- **Learner mode needed a way to learn.** A Hint button asks the engine what it would play and shows it, without playing it. The advice is always searched at full strength, whatever the opponent is set to, since a one-ply Learner would suggest the blunder it was about to make (D-042).
- **The hint then had to be readable by the person asking for it.** It started as a five-second status-bar flash reading "Try Nf3", which is useless to anyone who cannot already read notation. It is now a card that names the piece, says why in a sentence, spells the move out in words with the notation beside it as a learning aid, names the map cell it lands on, and stays until the move is made. The two squares pulse — the only moving thing in the scene, so it is found without being loud (D-043). `explainMove` derives the words from the position and is covered by `tests/game/explainMove.test.ts`.

- **A board with sea in one corner drew a beach there.** OSM gives the coast as a line rather than a polygon, so open water matched no water polygon and fell through to the tidal-sand rule. Submerged cells are now classified as water from their elevation and carry a translucent surface over the platform, so the square is plainly sea and the piece on it stands in the shallows — while staying one of the 64 playable squares (D-046). `tests/mapdata/cover.test.ts` covers the height thresholds.

- **The game-over card now writes up the ending.** Under the result it names the move number, the piece that gave mate and the place it carries its name from, the ground it came to, and the square the losing king was cornered on — then how many pieces fell (D-047). `chronicle()` is pure and covered by `tests/game/chronicle.test.ts`.

- **The menu says where you are, not what your coordinates are.** A drawn map button replaces "Change…", and beside it the board is named from its own features — Rievaulx, Holy Island, Achtriochtan — with coordinates only as the fallback. Loading became a proper screen — the board blurs behind a centred card with six chess pieces hopping in turn, the progress line and a rotating tip — and the two instruction lines under the menu are gone (D-048).

- **The board says what it is.** A collapsible gazetteer entry at the top of the left column — relief, water, land cover, settlements, and what the map still remembers of older names — counted and quoted from OSM and the height field, never invented (D-049). Real dates then arrived on top of it from Wikidata, looked up by the Q-id OSM already carries — "Rievaulx Abbey — abbey, founded 1132, scheduled monument" — CC0, cached, and never allowed to hold the board up (D-050).

- **The HUD became paper.** The gazetteer's parchment spread to the status bar, the area bar, the move record and both control clusters, with the palette in custom properties so it can be retuned in one place (D-051). The full-screen overlays stay dark.

### Risks / things I'm unsure about

- **The shell is not covered by tests, because the UI never is here.** Vitest runs in `node` with no DOM (BUILD_PLAN §3), so every assertion in this phase is on `game/`: the loop, the save format, the trackers. The menu, the record panel and the result card were checked by hand, not by machine. That is the same bargain the project has made since Phase 1, but this phase is the most DOM there has ever been.
- **The left column and `?debug` share space.** The heightmap panel moved right to clear the record panel, but the features panel still sits under the identity card. Debug-only, and it was already true, but it is untidy.
- **Resigning in hot-seat resigns for whoever is to move.** Defensible, but there is no way to resign on behalf of the other side, and no undo for a mis-click beyond the four-second confirmation.
- **A save survives a code change it should not.** The guard catches a changed _shape_, but not changed _meaning_ — if a future phase alters how a move request is interpreted, a version-1 save would replay into something subtly different. Bumping `SAVE_VERSION` is a manual discipline.
- **`savedAt` is only shown, never trusted.** A clock change makes "3 min ago" wrong; nothing else depends on it.

---

## Phase 12 — Polish & ship

**Date:** 2026-09-10
**Project completion: 100%**

### In plain English

The game is finished, and it says who its data belongs to. It loads about
twice as fast, it makes a noise when a piece lands, it can tell you who is
winning if you ask, and it has a coach that tells you what your opening is
called and one thing worth doing about it. Two features that tried to teach by
pointing at your mistakes were built, played, and taken back out again.

And it is on the internet: **<https://salpbes.github.io/MapChess/>**. A stranger
can open that and play, which was the whole of what Phase 12 asked for.

### What I built

**Shipping requirements**

- `src/ui/Attribution.ts` — the credit strip along the bottom: OpenStreetMap
  (ODbL), AWS Terrain Tiles, Stockfish, Wikidata. Links, not just words.
- `public/engine/LICENSE-stockfish.txt` — the GPL text, shipped beside the
  binary, with the on-screen link pointing at the _source_ as the licence
  requires rather than at a homepage.
- `vite.config.ts` — `base: './'`, so `dist/` runs from any path on any host.
- `README.md` — run, play, deploy, and the data licences in full.

**Performance**

- `src/ui/AreaPicker.ts` behind a dynamic `import()` — MapLibre is 970 kB and
  is not needed until somebody opens the picker. The first-load bundle went
  from 1,740 kB to 793 kB (D-052).

**The game got easier to read**

- `src/game/assessment.ts`, `src/ui/AssessmentCard.ts` — an optional win
  estimate: a bar, a sentence, and the conventional number. Off by default,
  and always searched at full strength whatever level is being played (D-054).
- `src/ui/Sounds.ts` — a knock for a move, a heavier one for a capture, a
  rising pair for check. Synthesised through WebAudio, so nothing is
  downloaded. Off until asked for (D-056).
- Last-move highlight and a recenter button (D-056); watch mode gained a
  pause, since neither resign nor take-back applies with no human seat (D-055).

**The coach**

- `src/domain/chess/openings.ts` — 55 named opening lines, longest-prefix
  matched. The same table answers "what is this called?" and "what do strong
  players play here?" (D-060).
- `src/game/coaching.ts`, `src/ui/CoachCard.ts` — three lines that are always
  saying something: the opening's name, one thing worth doing, and two numbers.
  On at every level.
- `src/domain/chess/values.ts` — the piece values, in one place.

**Built and then removed**

- A modal that questioned a move which dropped material, at Learner (D-058,
  reversed by D-062); a standing card naming what was already hanging, with
  faint red rings on the board, at the two easiest levels (D-059, reversed by
  D-061). Both are gone, along with `blunder.ts`, `hanging.ts`, `exchange.ts`,
  `IBlunderWarner`, the `danger` highlight role and the `warnsAt`/`helpsAt`
  difficulty gates.

**Deployment**

- `.github/workflows/deploy.yml` — every push to `main` runs the four gates
  the project runs locally (lint, formatting, types, tests) and only then
  builds and publishes to GitHub Pages. `npm ci` rather than `npm install`,
  because `public/engine/` is gitignored and the postinstall is what copies
  Stockfish out of `node_modules`.
- `index.html` — an inline SVG favicon. Serving the built site from a
  subdirectory turned up a 404 on every visit: browsers ask for
  `/favicon.ico` and the page declared none. Inline as a data URI, it costs
  no request and cannot 404 wherever the site is mounted.

**A bug the screenshots found**

- `src/game/SaveManager.ts` — a save is no longer written for a game with no
  moves in it. Starting the app starts a fresh board before the menu opens, and
  that start published an empty history straight over the save on disk. The
  menu went on offering the game it had read a moment earlier — "12 moves ·
  saved just now" — while the store held nothing, so **Resume game restored an
  empty board**. It had never worked across a restart, which is precisely what
  Phase 11's "done when" asked for. No test caught it because the test for
  resuming never started the second game the way the composition root does;
  both halves are pinned by `tests/game/save.test.ts` now.

**Two bugs found after shipping, both in watch mode**

- **The computers played behind the menu.** Bootstrap called `game.start()`
  before `menu.open()`, and a game reloaded from a save takes its seating from
  that save — so an ai-vs-ai game began trading moves under the front door
  before the player had chosen anything. `GameLoop.setAtMenu()` now holds it,
  deliberately as a _separate_ flag from `paused`: the pause button reports
  what the player asked for, so opening the menu must not make it read
  "paused" and closing it must not undo a pause they set themselves. The menu
  also goes up before the game starts now — otherwise `start()` emits
  `ai-thinking` on its way to being held and the status bar sits there saying
  "White is thinking…" when nothing is.
- **Nine icons did not fit the column.** Watch mode adds a pause button, and
  the last icon sat 8 px outside the paper. `.dock__row--place` wrapped;
  `.dock__row--actions` did not. Both wrap now: eight icons normally, nine
  watching, two lines, no overflow.

### Why it was done this way

**The attribution is in the app, not only the README** (D-053). ODbL requires
the credit to reach the person using the data. A line in a repository file does
not do that for someone who opens a deployed URL, which is exactly the person
the licence is about.

**The picker is loaded on demand rather than split by vendor chunking** (D-052).
Chunking would still have fetched MapLibre on first paint; a dynamic import
means a player who never changes area never downloads a map library at all.

**Three attempts at helping a beginner, one survivor.** D-058 questioned a move
as it was made, D-059 pointed at what was already hanging, D-060 talks about
the position without ever mentioning a mistake. The first two were unwanted for
the same reason: they corrected the player instead of accompanying them, and
they were silent until the moment they accused you. Only the third survived
contact with somebody actually playing. That is one question asked three times,
not three failed features — but it is worth writing down that the two which
interrupted are the two that went (D-061, D-062).

**The engine takes one search at a time, in a queue** (D-057 neighbourhood).
The hint, the assessment and the opponent's move all ask Stockfish for a
search, and the original "refuse if busy" guard let two callers past the same
check before either claimed the slot — the second overwrote the first, whose
watchdog then fired and played a fallback move. Black appeared to blunder
constantly. It is now a promise chain.

### How to check it yourself

1. Open <https://salpbes.github.io/MapChess/> — or `npm run dev` for a local
   copy. Everything below is the same either way.
2. The credit strip is along the bottom before you do anything. Every source is
   a link.
3. Start a game at any level. The **Your game** card sits under the controls
   from move one: it names the opening ("Italian Game"), suggests what strong
   players do, and counts your material and development.
4. Play 1. e4 — the card changes to "King's Pawn Opening" and the square you
   came from stays lit.
5. Press the 📖 to switch the coach off, the scales to switch the win estimate
   on, the speaker for sound.
6. `npm run build && npx vite preview` — the first-load bundle is ~793 kB and
   the map library is only fetched when you open **Choose area**.
7. Menu → New game → **Watch (computer plays both)**, then reload the page.
   The board stays still at "White to move" behind the menu, and starts only
   when the menu is dismissed.

### What's left

Nothing in the plan — the game is built, documented, deployed and playable at
a public URL. Outside the plan, two things are worth naming, and the first is
the one that decides who can actually play it:

- **No phone or tablet layout.** There is not one width media query in the
  stylesheet: the left column is a fixed 230 px and the briefing 300 px, which
  on a phone would cover the board they describe. Most people who are sent a
  link open it on a phone.
- **No keyboard play and no colour-blind-safe highlights.** Offered during the
  phase and never built. Green for a move and red for a capture is the pair
  most often confused.

### Risks / things I'm unsure about

- **The DOM layer is still untested, and it is now the phase's main lesson.**
  Vitest runs in `node` (BUILD_PLAN §3), so of 32 test files exactly one covers
  `ui/`, and it tests a list of strings. Everything this phase got wrong was
  found by a person looking at the screen: four CSS regressions, the resume bug,
  the computers playing behind the menu, and the icon row running off the paper.
  Not one was caught by 399 passing tests. The bargain has held since Phase 1,
  but this phase added ten more panels to the side of it that nothing checks,
  and the three bugs that reached a shipped build all lived there.

  What worked instead was driving the built site in a headless browser — that is
  how the resume bug, the favicon 404 and both watch-mode bugs were reproduced
  and then verified fixed. Those scripts were thrown away; making them part of
  the suite is the obvious next investment.

- **The opening book is 55 lines chosen by hand.** Every line is played out on
  a real engine by `tests/domain/chess/openings.test.ts`, so none of them is
  illegal — but "Sicilian, Najdorf territory" is a judgement about where a name
  starts applying, and a stronger player may disagree with several of them.
- **The coach's advice is arithmetic, not understanding.** It counts
  development, material and passed pawns and picks the first rule that fires.
  It will tell you to castle in a position where castling is wrong.
- **A save carries the seating, so restoring one restores watch mode.** That is
  correct, and it is also why the menu bug existed: the reload path is the only
  one that starts an ai-vs-ai game without a person having just asked for it.
  Any future state restored from a save deserves the same suspicion — it arrives
  before the player has touched anything.

- **The working tree collects `<name> 2.<ext>` duplicates.** Thirty appeared
  during the phase — identical file copies and empty directory husks, the usual
  iCloud artefact for a project under `~/Documents`. They fail lint and prettier
  and `git add -A` would commit them. Harmless once seen; the repository is
  better off outside a synced folder.

- **Two reversals in one phase is a signal.** D-058 and D-059 were both built,
  documented, and removed within days. They were cheap to remove because they
  sat behind seams — but the pattern says features aimed at "helping" should be
  played before they are polished.
