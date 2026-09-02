# `src/world/builders/` — data → meshes

**Belongs here:** one builder per kind of world object. Each takes plain domain/mapdata types and returns a `THREE.Object3D`:

- `CellBuilder` — 64 cell platforms from `IBoardLayout` polygons. **Contains no hard-coded 8×8 maths**; it renders whatever polygons it is given.
- `TerrainBuilder` — ground mesh from `HeightField`.
- `WaterBuilder` — water surfaces along warped cell edges.
- `LabelBuilder` — place-name labels over cells.

**Does not belong here:** pieces (they move; builders produce static geometry) and anything that reacts to input.

**Built in:** Phase 1 (`CellBuilder`), Phase 9 (the rest).
