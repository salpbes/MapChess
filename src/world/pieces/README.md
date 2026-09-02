# `src/world/pieces/` — chess pieces in 3D

**Belongs here:** everything that makes pieces appear, move and get highlighted.

| File                        | Responsibility                                                            |
| --------------------------- | ------------------------------------------------------------------------- |
| `IPieceMeshFactory.ts`      | Seam: `create(piece) → Object3D`, origin at the feet, upright, facing −Z. |
| `PieceGeometry.ts`          | Procedural low-poly lathe profiles per piece type (D-013).                |
| `ProceduralPieceFactory.ts` | `IPieceMeshFactory` using those profiles; caches geometry and materials.  |
| `PieceLayer.ts`             | square → object map; the **only** file that sets a piece transform.       |
| `MoveAnimator.ts`           | Arced, eased travel between two points; tick-driven.                      |
| `HighlightLayer.ts`         | Translucent cell overlays: selected / move / capture / check.             |
| `BoardView.ts`              | `IBoardView` for the game layer, composed of the three above.             |

**Hard rules:**

- `rotation.x` and `rotation.z` are always zero. Only yaw. Never `lookAt()` a surface normal.
- Piece scale is constant (one `unit` = nominal cell width). Cells are sized to fit pieces, not the other way round.
- Nothing in here knows chess rules. `BoardView.playMove` reads facts off the `Move` (captured square, castle rook path, promotion) and sequences animations.

**Swapping in GLB models:** implement `IPieceMeshFactory` with a loader that measures the bounding box and offsets the origin to the feet once. Nothing else changes.
