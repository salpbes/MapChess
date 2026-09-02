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
