# MapChess

Pick a real place on a map. Its hills, rivers, coastline, forests and old place names become a 3D chessboard of 64 irregular cells. Play chess on it against the computer.

There are no buildings. The landscape is the board.

## Status

Phase 0 of 12 — scaffolding. See [docs/PROGRESS.md](docs/PROGRESS.md).

## Run

```sh
npm install
npm run dev        # http://localhost:5173
npm run test       # Vitest, domain layer only
npm run lint
npm run typecheck
npm run build
```

## Docs

- [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md) — the plan, phase by phase
- [docs/PROGRESS.md](docs/PROGRESS.md) — one report per completed phase
- [docs/DECISIONS.md](docs/DECISIONS.md) — every non-obvious choice, with reasons

Every folder under `src/` has a `README.md` describing what belongs in it.

## Data

Elevation from Terrarium terrain tiles (AWS Open Data). Map features from OpenStreetMap via the Overpass API — © OpenStreetMap contributors, ODbL.
