# `public/models/` — piece meshes

**Belongs here:** GLB files for the six piece types, served as static assets. One file per piece type; colour is applied by material at load time, so there is no separate white/black set.

**Origin convention:** the loader measures each model's bounding box and offsets it so the feet sit at y = 0. Models do **not** need to be pre-aligned — but they must be upright (Y-up) and face −Z as "forward".

**Licence:** every model added here needs its source and licence recorded in `docs/DECISIONS.md`.

**Populated in:** Phase 3.
