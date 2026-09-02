# `src/world/pieces/` — chess pieces in 3D

**Belongs here:** GLB loading with bounding-box origin correction (measured once in the loader, never per-piece magic numbers), piece placement at `(centroid.x, platformY, centroid.z)`, selection and legal-move highlights, arced move animation, capture removal, and the base disc / plinth under each piece.

**Hard rules:**

- `rotation.x` and `rotation.z` are always zero. Only yaw.
- Piece scale is constant. Cells are sized to fit pieces, not the other way round.

**Built in:** Phase 3.
