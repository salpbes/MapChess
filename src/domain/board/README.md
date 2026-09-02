# `src/domain/board/` — board geometry

**Belongs here:** `IBoardLayout` — the seam that answers "where is square e4 and what shape is it". Two implementations:

- `FlatBoardLayout` (Phase 1) — 64 identical squares.
- `WarpedBoardLayout` (Phase 8) — 9×9 vertex lattice warped by rivers, peaks and place names, terraced to platform heights.

Also: cell polygon types, convexity/area checks, Laplacian smoothing, vertical exaggeration clamp.

**Does not belong here:** any three.js geometry. This layer produces _numbers_ (polygons and heights); `world/builders/` turns them into meshes.

**Invariant:** every cell has the same four neighbours as on a plain grid. Tests in `tests/` enforce this.
