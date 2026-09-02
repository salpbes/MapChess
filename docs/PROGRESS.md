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
