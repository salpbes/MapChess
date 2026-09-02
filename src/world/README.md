# `src/world/` — three.js rendering

**Belongs here:** everything that imports `three`. This is the _only_ layer that does.

| Subfolder   | Responsibility                                                                   |
| ----------- | -------------------------------------------------------------------------------- |
| `scene/`    | Renderer, camera, lights, orbit controls, resize handling, animation loop.       |
| `builders/` | `TerrainBuilder`, `CellBuilder`, `WaterBuilder`, `LabelBuilder` — data → meshes. |
| `pieces/`   | Piece meshes, selection highlights, arced move animation, capture removal.       |

**Rules:**

- **Y-up.** Longitude → X, latitude → Z, elevation → Y. Converted once in `mapdata/model/`; never re-derived here.
- Pieces are always upright: position + Y-rotation only. Never `lookAt()` a surface normal.
- Builders consume `IBoardLayout` and must not assume cells are squares.
- Merge geometry by material — measure draw calls, don't assume.

**Not unit-tested.** Verified by eye and by frame-rate measurement.
