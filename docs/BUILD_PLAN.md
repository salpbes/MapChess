## 1. Two facts that shape the whole build

### OpenStreetMap does not contain elevation

This matters, because the design depends on hills. OSM stores _points and lines_ — a peak marker (`natural=peak`), a river centreline, a coastline, a forest boundary. It has no height field. The contour lines on some OSM-based maps come from a separate elevation dataset layered underneath.

So MapChess needs **two** data sources:

| Need                                              | Source                                                    | Notes                                                                 |
| ------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------- |
| Ground shape (hills, valleys, slope)              | **Terrarium-encoded terrain tiles** (AWS Open Data, free) | ~30 m resolution. Elevation encoded in RGB pixels. No account needed. |
| Rivers, lakes, coast, forests, peaks, place names | **OpenStreetMap via Overpass API**                        | Free, ODbL, attribution required                                      |

**Verify before you build on it.** The first task of Phase 6 is a throwaway spike: fetch one terrain tile in the browser, decode it, print min/max metres. Confirm the URL pattern, the CORS headers and the coverage for the areas I care about. If any of that fails, switch to Mapbox Terrain-RGB (needs a token, has a free tier) and record the decision in `DECISIONS.md`. Do not write the caching layer before the spike passes.

### Old town names exist in OSM, but coverage is patchy

The tags are real: `old_name`, `name:etymology`, `historic=*`, plus `place=town|village|hamlet|locality`. Coverage varies enormously by region — some areas are richly annotated, others have nothing but a modern name.

**Consequence:** the naming layer is a _bonus_, never a requirement. Fallback chain: `old_name` → `historic` name → `name` → nearest natural feature name → generated name from terrain type. A board must never render with blank cells.

## 2. The hard part: 64 irregular cells that are still a chessboard

Chess is defined by adjacency, not by geometry. A rook moves along a rank, a bishop along a diagonal. If you cut the map into 64 arbitrary shapes — Voronoi cells around towns, or watershed polygons — those relationships stop existing and you no longer have chess. You would have to invent an adjacency graph, and then `chess.js` and Stockfish are both useless to you.

**The solution: warp the lattice, don't abandon it.**

Build a **9 × 9 grid of corner vertices** (81 points) defining 64 quad cells. Then move the _corners_, never the cells. Because neighbouring cells share corner vertices, the cells stay perfectly tiled — no gaps, no overlaps — and every cell keeps exactly the same file/rank/diagonal neighbours as a normal chessboard. The logical board is untouched; only its shape changes.

Warping rules:

- **Attractors.** River centrelines pull nearby vertices _onto_ the river, so water runs along cell **edges** rather than slicing through a cell. Peaks and named places pull the four corners of their containing cell outward, so the feature sits comfortably inside one cell.
- **Constraints.** A vertex may move at most ~35% of a cell width. Reject any move that makes a quad non-convex or drops its area below a floor value. Iterate with Laplacian smoothing until stable.
- **Piece size stays constant.** Do not scale pieces to their cell — a knight shrunk into a small cell looks like a bug. Enforce the minimum-area constraint instead, so every cell can hold a full-size piece.

### Terracing and piece height

Sample the elevation inside each finished cell and flatten the cell to a **level platform**, with a small cliff or slope down to its neighbours. Terracing is what makes the board readable; without it, pieces stand on tilted ground and the whole thing reads as broken.

Platform height per cell: use the **mean** elevation inside the cell if the cell is fairly flat, but drop to the **minimum** where the spread inside a cell is large (a cell straddling a steep slope). Rule of thumb: if max minus min inside the cell exceeds one piece-base height, use the minimum. A platform slightly below the surrounding ground looks like a cut terrace; one above it looks like the piece is floating.

### Piece orientation: always upright

three.js is **Y-up**, not Z-up. Convert once in the projection layer — longitude to X, latitude to Z, elevation to Y — and stay Y-up above it. Do not set a Z-up world; it fights the camera, the controls and every three.js example you will read.

Pieces are **always vertical**, never aligned to the terrain:

- Position only: `piece.position.set(centroid.x, platformY, centroid.z)`
- Rotation only around Y (yaw), for facing direction. `rotation.x` and `rotation.z` stay zero permanently.
- Never call `lookAt()` on a surface normal, never copy the ground's tilt onto a piece.
- Give every piece a base disc slightly wider than its footprint. It hides any residual gap at the platform edge and reads as a plinth.

Model origins: exported GLB pieces often have their origin at the model centre, not the feet. Measure the bounding box in the loader and offset once — never per-piece magic numbers.

**Vertical exaggeration.** Clamp total relief across the board to roughly 15–20% of the board's width, then scale real heights into that range. Real 1:1 elevation either vanishes (flat coastal areas) or blocks the camera (mountains).

### Board orientation

The selected area has a rotation. Fix the convention once, in `DECISIONS.md`, and never re-derive it: **the south edge of the selected area is White's back rank, file a is west.** Everything downstream — piece placement, camera default, move animation direction — reads that one rule.

## 3. Tech stack

- **Language:** TypeScript, `strict: true`
- **Build:** Vite
- **3D:** three.js
- **Chess rules:** `chess.js`
- **Chess AI:** `stockfish.wasm` in a Web Worker — **use the single-threaded build**. The multi-threaded build needs `SharedArrayBuffer`, which needs COOP/COEP cross-origin-isolation headers that most static hosts do not set by default. Single-threaded is more than strong enough to beat me and it deploys anywhere.
- **Elevation:** Terrarium terrain tiles (verify in Phase 6)
- **Map features:** Overpass API
- **2D area picker:** MapLibre GL JS
- **Tests:** Vitest — domain layer only, not the 3D scene
- **Formatting:** Prettier + ESLint

Fresh repository. Nothing is carried over from earlier projects.

## 4. Folder structure

The rule that keeps this modular: **`domain/` never imports three.js and never touches the DOM.** If the chess game cannot run headless in a terminal, the layering has leaked.

```
mapchess/
├─ docs/
│  ├─ BUILD_PLAN.md        ← this file
│  ├─ PROGRESS.md          ← progress reports, appended each phase
│  └─ DECISIONS.md         ← short record of every non-obvious choice
├─ public/models/          ← piece meshes
├─ src/
│  ├─ app/                 ← bootstrap, wiring, config
│  ├─ domain/              ← PURE. no three.js, no DOM, no fetch
│  │  ├─ chess/            ← chess.js wrapper, game state
│  │  ├─ board/            ← 9×9 lattice, warping, cell polygons, terracing
│  │  └─ theme/            ← terrain + names → piece and cell identity
│  ├─ mapdata/
│  │  ├─ elevation/        ← tile fetch, RGB→metres decode, sampling
│  │  ├─ features/         ← Overpass queries, normalisation
│  │  ├─ cache/            ← IndexedDB, rate-limit guard
│  │  └─ model/            ← MapArea, MapFeature, HeightField types
│  ├─ world/               ← three.js only
│  │  ├─ scene/            ← renderer, camera, lights, controls
│  │  ├─ builders/         ← TerrainBuilder, CellBuilder, WaterBuilder, LabelBuilder
│  │  └─ pieces/           ← meshes, highlights, move animation
│  ├─ game/                ← turn loop, input → move → render
│  ├─ ai/                  ← Stockfish worker adapter
│  ├─ ui/                  ← DOM overlay: menus, HUD, move list
│  └─ shared/              ← types, maths, event bus, logger
└─ tests/
```

## 5. Coding rules

- One exported responsibility per file. If describing a file needs the word "and", split it.
- Constructor injection: `new GameLoop(rules, renderer, ai)`. No modules reaching for globals.
- Interfaces at every seam that might change: `IElevationProvider`, `IFeatureProvider`, `IChessEngine`, `IChessAI`, `ICellShaper`, `IBoardLayout`. One implementation each to start — the point is the seam, not the count.
- **`IBoardLayout` is the seam that makes this plan work.** It answers "where is square e4 and what shape is it". The first implementation returns a plain flat grid. The warped lattice is the second implementation of the same interface. Nothing downstream changes when you swap them.
- No `any`. No silent `catch {}`.
- Cross-layer communication goes through a typed event bus in `shared/`.
- Every network call gets a timeout, a retry limit, and a user-visible failure state.
- Comments explain **why**, never **what**.

## 6. Phases

Percentages are cumulative project completion. Each phase ends with a progress report.

**The order is deliberate: a complete, playable chess game comes first, on a plain flat board. The map work then replaces that board.** The map is the exciting part, so the temptation is to build it first — but it is also the risky part, and building it first means no playable game until very late. This order means that if the terrain work stalls at any point, what you have is still a finished chess game rather than a half-built map viewer.

### Phase 0 — Decisions & scaffolding → **4%**

Ask me: board area size (suggest 1–3 km per side, since terrain needs room to be visible), art style (stylised low-poly vs naturalistic), desktop-only or mobile too.
Scaffold with Vite + TypeScript, add three.js, chess.js, ESLint, Prettier, Vitest. Create the folder tree with a `README.md` in each folder saying what belongs there. Create `docs/PROGRESS.md` and `docs/DECISIONS.md`.
**Done when:** `npm run dev` opens a blank page with no console errors and `npm run test` runs cleanly.

### Phase 1 — Scene skeleton and flat board → **10%**

Renderer, perspective camera, orbit controls, lights, resize handling, animation loop. `FlatBoardLayout implements IBoardLayout` producing 64 square cells. `CellBuilder` renders whatever `IBoardLayout` gives it — it must not assume squares.
**Done when:** I can orbit and zoom around a grey chessboard, and `CellBuilder` contains no hard-coded 8×8 maths.

### Phase 2 — Chess rules core → **18%**

`domain/chess/ChessEngine.ts` wrapping chess.js behind `IChessEngine`: legal moves, make/undo, check, checkmate, stalemate, promotion, castling, en passant. Vitest tests for each, including the awkward ones.
**Done when:** tests pass and I can play a full game from the console with no renderer attached.

### Phase 3 — Pieces and interaction → **28%**

Piece meshes placed via `IBoardLayout` centroids and platform heights, upright per section 2, raycast selection, legal-move highlighting, arced move animation, capture removal.
**Done when:** I can play both sides with the mouse, hot-seat, and illegal moves are refused.

### Phase 4 — The computer opponent → **36%**

Single-threaded Stockfish WASM in a Web Worker behind `IChessAI`. Never block the render thread. Difficulty via skill level and think time — roughly beginner / club / strong.
**Done when:** I lose to it, the frame rate never drops while it thinks, and it always plays a legal move.

> **Milestone: a complete, working chess game.** Everything from here on makes it MapChess. If the project stopped now it would still be a real, finished thing.

### Phase 5 — Area selection → **43%**

MapLibre 2D picker with search, a draggable square of fixed size, rotation, and a confirm button. Outputs `SelectedArea { centerLat, centerLon, sizeMeters, rotationDeg }`. Implement the projection helpers (lat/lon ↔ local metres) and the board-orientation rule from section 2 here.
**Done when:** I can search a place, position the square, confirm, and see the coordinates and the derived board corners logged.

### Phase 6 — Elevation layer → **52%**

**Spike first** (see section 1): one tile fetched, decoded, min/max printed, before anything else is written. Then: fetch all tiles covering the area, assemble one `HeightField`, expose `sampleHeight(x, y)` and `sampleStats(polygon)` returning min/mean/max. Cache to IndexedDB. Ship 3 offline fixture areas (flat coastal, river valley, hilly) so development never depends on the network.
**Done when:** a debug view renders a greyscale heightmap of the chosen area and the second load is instant.

### Phase 7 — Feature layer → **60%**

One Overpass query per area for: waterways, water bodies, coastline, forests/scrub, peaks and ridges, and all `place=*` nodes with their `name`, `old_name` and `historic` tags. Normalise into `MapFeature[]` — raw Overpass JSON must never leave this folder. Rate-limit guard: Overpass is a free community service and will block you if you hammer it during development.
**Done when:** picking an area prints feature counts by type and lists every name found, old names flagged.

### Phase 8 — The warped lattice → **74%**

The core of the project. `WarpedBoardLayout implements IBoardLayout`: build the 9×9 vertex grid, apply the attractors and constraints from section 2, run the smoothing, produce 64 convex cell polygons, terrace each to its platform height with clamped vertical exaggeration.

This is pure geometry with no rendering, so test it as such. Required Vitest invariants, run across all 3 fixture areas:

- all 64 cells convex, none below minimum area
- no two cells overlap; the union has no holes
- every cell's four neighbours are the same as on a plain grid
- no vertex moved further than the cap
- output is deterministic for the same input

Expect two or three attempts and expect to tune the attraction weights by eye. That is normal for this phase.
**Done when:** the invariants pass, and a debug overlay shows the 64 cells with file/rank labels, rivers running along cell edges, and hills sitting inside cells. Swapping `FlatBoardLayout` for `WarpedBoardLayout` requires no change outside `app/`.

### Phase 9 — Render the world → **84%**

Terrain mesh, terraced cell platforms with a visible edge treatment, water surfaces along the warped edges, forest and rough-ground materials, place-name labels over their cells. Merge geometry by material — no thousands of draw calls. This is the phase where frame rate actually becomes a risk; measure it, don't assume it.
**Done when:** a real river valley is recognisable and holds 60 fps on my machine.

### Phase 10 — Terrain theming → **91%**

The part that makes it MapChess. Score cells and features, then assign identity:

- **Rook** → the highest or most defensible cell — a peak, a ridge end, a headland
- **Bishop** → a cell holding a place with a religious or historic name, or a ford
- **Knight** → a river crossing, a pass, or a cell with a horse/cattle-related name
- **Queen / King** → the cells holding the two most significant named settlements
- **Pawns** → minor named places, then unnamed terrain

Assignment is per-cell, so it must handle both colours from one map — the same area supplies White's and Black's identities from their own halves. Each cell also gets a display name via the fallback chain in section 1. Show the naming when a piece is selected; that reveal is the game's best moment.
**Done when:** three very different areas — a mountain valley, a flat coastline, and an empty rural square with almost no OSM data — all produce a complete, sensible, good-looking board.

### Phase 11 — Game shell → **97%**

Main menu, new game, side choice, difficulty, algebraic move list, captured pieces, undo, resign, game-over screen, save/load to localStorage (the saved game must include the selected area so a resumed game rebuilds the same board), loading and error states on every network call.
**Done when:** I can start, play, quit and resume without touching the console.

### Phase 12 — Polish & ship → **100%**

Performance pass, mobile check if wanted, **OSM attribution (required by the ODbL licence)** and terrain data credit, README with screenshots, deploy to static hosting.
**Done when:** a stranger can open a URL and play.

### Phase 13 — Who can actually play it → **beyond the plan**

The percentages stopped at Phase 12 because the plan did. This phase is not more
game; it is the game reaching the people who are sent a link to it. Phase 12's
own report named the two things standing in the way, and neither is a feature:
there is not one width media query in the stylesheet, and of thirty-two test
files exactly one covers `ui/` — the layer where all three shipped bugs lived.

**The order below is deliberate, for the same reason §6's order was.** The net
is built before the DOM layer is rearranged, not after. Phase 12's lesson was
that four CSS regressions, the resume bug and the icon row reached a built site
past 399 passing tests, and that what actually caught them was driving the real
page in a headless browser. Rewriting the layout for narrow screens is the
largest change `ui/` has ever taken. Doing that without a net repeats the
phase we just wrote the lesson down in.

#### 13.1 — A harness that drives the built site

Playwright against `vite preview`, not against `dev` — the thing shipped is the
thing tested, including the relative asset paths and the WASM MIME type. One
config, two projects: a desktop viewport and a phone one. Fixtures only: the
run must not touch Overpass, Terrarium, Nominatim or Wikidata, so it is honest
about what it proves and it cannot be broken by someone else's outage.
**Done when:** `npm run test:e2e` builds, serves, drives and tears down on a
clean checkout, and `npm run test` still finishes in under two seconds because
the two suites are separate commands.

#### 13.2 — Six journeys, recorded before anything moves

Start a game · play a move · undo it · resign · resume after a reload · open
the picker. Written against the **current** desktop layout and passing on
`main` before a line of CSS changes, so they are a regression net rather than a
description of the new thing. Each of the three bugs that reached a shipped
build gets a journey, since a bug that escaped once is the cheapest test to
justify.
**Done when:** all six pass at desktop viewport on today's `main`, and each of
them fails for the right reason when its feature is deliberately broken.

#### 13.3 — The HUD stops being two fixed columns

The left column and the briefing are a hard 230 px each; on a 390 px screen
the two of them plus their gutters come to 484 px and cover the board they
are describing. Below a breakpoint the panels become
one dismissable sheet over a full-width board — the board is the subject, the
gazetteer is something you ask for. `PanelColumn` is the seam, so this is a
layout change and not a rewrite of ten panels. The status bar stays: Phase 11
found it is the line players read most.
**Done when:** the six journeys pass at phone viewport, and at 390 px no panel
overlaps the board and the page does not scroll sideways.

#### 13.4 — The board accepts fingers

`touch-action: none` on the canvas, or every orbit gesture fights the browser's
own pan and zoom. One finger orbits, two slide and pinch. Tap-a-piece then
tap-a-destination is already the right gesture — D-041 turned down drag-and-drop
for chess reasons, which turns out to have been the touch decision all along —
but a fingertip is not a cursor, and cells near the horizon on a tilted board
are a few pixels tall. Raise the minimum tap target, and confirm the promotion
prompt and the castling-on-the-rook gesture survive a thumb.
**Done when:** a full game can be played on a real phone, with no gesture that
scrolls the page instead of moving the board, and no tap that selects the cell
behind the one aimed at.

#### 13.5 — The area picker under a thumb

The one genuinely touch-hostile screen in the app: a 2 km square that is
dragged _and_ rotated, over a map that also pans. Rotation needs a handle it
can keep, since a two-finger twist is already MapLibre's. Search, drag, rotate,
confirm — the whole flow, or the phone player is stuck on whichever area the
game happened to start on.
**Done when:** an area can be searched for, placed, turned and confirmed on a
phone, and the picker journey passes at phone viewport.

#### 13.6 — Highlights that survive colour blindness

Green for a move and red for a capture is the most-confused pair there is, and
it is currently the only thing separating them. Add a second channel that is
not hue — shape, ring weight, or a mark — so the distinction survives
deuteranopia and a bright screen outdoors. Offered during Phase 12 and never
built.
**Done when:** move and capture highlights are distinguishable in a greyscale
screenshot of a real board.

#### 13.7 — Play without a mouse

Arrow keys or file/rank letters to move a cursor, Enter to select and to
confirm, Escape to cancel — the same state machine `GameLoop` already runs for
clicks, driven from a different input. Focus order and `aria-live` on the
status bar so the move just played is announced rather than only drawn.
**Done when:** a full game is playable from the keyboard alone, and tabbing
through the HUD never lands somewhere invisible.

#### 13.8 — Ship it again

The ODbL credit must be legible at 390 px, not merely present — D-053 is about
a required credit being readable, and a strip that wraps into the board fails
that. README screenshots are all desktop and should gain a phone one, because
the README is now claiming something it has not shown. Then the same deploy
workflow, with `test:e2e` in it.
**Done when:** the workflow runs unit tests, types, lint, format and the six
journeys at both viewports, and refuses to publish if any of them is red.

**Phase done when:** a stranger sent the link on a phone can choose a place,
play a game on it and resume it the next day — and the suite would have caught
it if they could not.

**Risks, stated up front:**

- **A responsive HUD is where this phase can quietly become a rewrite.** Ten
  panels were written against a fixed 230 px column. If the sheet turns into a
  second layout engine, stop and make the panels narrower instead — the phase
  is worth less than the panels working.
- **A headless browser proves the page renders, not that it reads.** Nothing in
  13.1 will tell you a thumb covers the piece it is moving. Phase 12's actual
  lesson was that a person looking at the screen found everything; the harness
  stops regressions, it does not replace the looking.
- **Touch gesture work has no seam.** `PointerInput` is one file and the rest of
  the project is insulated from it, which is the good news; the bad news is that
  there is no fixture for "a finger", so this topic is verified by hand on real
  hardware or it is not verified.

## 7. Progress report template

```markdown
## Phase N — <name>

**Date:** YYYY-MM-DD
**Project completion: NN%**

### In plain English

Two or three sentences a non-programmer would understand. What can the
game do now that it couldn't before?

### What I built

- file/folder — what it does, in one line

### Why it was done this way

The reasoning behind any choice that wasn't obvious. Alternatives rejected.

### How to check it yourself

1. Run `npm run dev`
2. Click ...
3. You should see ...

### What's left

Next phase and what it unlocks.

### Risks / things I'm unsure about

Anything shaky, slow, or likely to need rework. Say it plainly — an
unmentioned problem now is a rewrite later.
```

## 8. Known risks, stated up front

- **Phase 8 is the project.** Everything else is standard work with well-trodden libraries. The warped lattice is the original part, with no reference implementation to copy. Three attempts is normal, not failure. It sits behind `IBoardLayout` precisely so that a bad week there costs you nothing already built.
- **Terrain tile availability is unverified.** Hence the Phase 6 spike. Do not build the cache layer on an assumption.
- **Overpass rate limits.** Cache aggressively, develop against fixtures.
- **Flat areas look like nothing.** A board on flat docklands has no relief and no peaks. Test against a flat area early and decide whether to reject flat selections, exaggerate harder, or lean on water and names instead.
- **Sparse OSM naming.** Rural squares may return almost no names. The Phase 10 fallback chain is what stops those games looking broken — build it alongside the happy path, not after.
- **Terrain vs readability.** Every step toward realistic landscape is a step away from a legible chessboard. When they conflict, the board wins — an unreadable board is an unplayable game.
