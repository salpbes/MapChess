# `public/models/` — piece meshes

**Currently empty on purpose.** Phase 3 decided on procedural low-poly pieces generated in code (`src/world/pieces/PieceGeometry.ts`, decision D-013), so there are no model files to serve.

**If GLB models are introduced later:** one file per piece type, upright (Y-up), facing −Z as "forward". The loader must measure each model's bounding box and offset it so the feet sit at y = 0 — models do not need to be pre-aligned. Every model added here needs its source and licence recorded in `docs/DECISIONS.md`.
