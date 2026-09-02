# `src/world/builders/` — data → meshes

**Belongs here:** one builder per kind of world object. Each takes plain domain/mapdata types and returns a `THREE.Object3D`, merged by material.

| File                     | Responsibility                                                                                                      | Draw calls |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------- | ---------- |
| `WorldModel.ts`          | The bundle every builder reads: layout, terrain inputs, heights, features, cell cover, exaggeration. `heightToY()`. | —          |
| `palette.ts`             | Every colour in the landscape.                                                                                      | —          |
| `CellBuilder.ts`         | Cell tops merged by (land cover × shade), one riser mesh, one outline `LineSegments`. **No 8×8 maths.**             | ≤ 12       |
| `TerrainBuilder.ts`      | Landscape margin from the `HeightField`, exaggerated like the terraces, triangles under the board dropped.          | 1          |
| `WaterBuilder.ts`        | River/stream ribbons on the terraces, lakes as `ShapeGeometry`, sea plane on coastal boards.                        | ≤ 3        |
| `LabelBuilder.ts`        | Up to 16 place-name sprites, one per cell, by priority.                                                             | ≤ 16       |
| `textSprite.ts`          | Text → canvas-texture sprite, shared with the debug overlay.                                                        | —          |
| `DebugOverlayBuilder.ts` | `?debug`: file/rank labels, feature lines, peak/place markers.                                                      | debug only |
| `BoardScene.ts`          | Applies a `WorldModel` to the live scene and disposes the previous one; reframes camera, controls, lights.          | —          |

**Measured (Phase 9, `?debug` off):** Rievaulx 87 calls / 28k tris, Glen Coe 78 / 30k, Lindisfarne 85 / 28k, flat board 68 / 19k — all 60 fps. Pieces (32 meshes, each also drawn into the shadow map) are most of the count.

**Does not belong here:** pieces (they move) and anything that reacts to input.
