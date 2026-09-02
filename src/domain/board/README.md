# `src/domain/board/` — board geometry

**Belongs here:** `IBoardLayout` — the seam that answers "where is square e4 and what shape is it" — and its two implementations.

| File                   | Responsibility                                                                                           |
| ---------------------- | -------------------------------------------------------------------------------------------------------- |
| `Square.ts`            | `a1`…`h8` names and index helpers.                                                                       |
| `types.ts`             | `BoardPoint`, `Cell`, `BoardBounds`.                                                                     |
| `IBoardLayout.ts`      | The seam.                                                                                                |
| `FlatBoardLayout.ts`   | 64 equal squares (Phase 1).                                                                              |
| `polygon.ts`           | Signed area, centroid, point containment.                                                                |
| `geometry.ts`          | Nearest point on a polyline, convexity, segment crossing.                                                |
| `TerrainInputs.ts`     | What the lattice needs: line attractors, point attractors, a height sampler. Filled by `mapdata/board/`. |
| `latticeWarp.ts`       | The 9×9 warp: attract → relax → cap/pin → repair. Pure, deterministic (D-026).                           |
| `terrace.ts`           | Cell stats → platform heights with vertical exaggeration (D-027).                                        |
| `WarpedBoardLayout.ts` | Ties the above into 64 convex terraced cells (Phase 8).                                                  |

**Does not belong here:** any three.js geometry or any mapdata type. This layer produces _numbers_; `world/builders/` turns them into meshes and `mapdata/board/buildTerrainInputs.ts` feeds it.

**Invariants** (tests/domain/board/WarpedBoardLayout.test.ts, run on all three fixture areas): 64 convex cells above the minimum area and inradius; no overlaps, no holes; every cell's rank/file neighbours identical to the plain grid; no vertex beyond the cap; deterministic.
