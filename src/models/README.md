# `src/models/` — piece meshes

Drop a `.glb` in here and it becomes that piece. There is nothing to wire up:
`loadPieceModels.ts` globs this folder at build time, so adding a file is the
whole of adding a piece.

## Naming

`<type>_<colour>.glb` — the filename is the wiring.

```text
pawn_white.glb    knight_white.glb   bishop_white.glb
rook_white.glb    queen_white.glb    king_white.glb
pawn_black.glb    knight_black.glb   …
```

Case does not matter. Anything that does not parse — `rook.glb`,
`castle_white.glb`, `rook_red.glb` — is **skipped silently**, and that piece
stays procedural, which looks exactly like a model that failed to load. The
rule is pinned down in `tests/world/modelKeyFor.test.ts`.

Types are `pawn`, `knight`, `bishop`, `rook`, `queen`, `king`. Colours are
`white` and `black`. Mixing is fine and expected: any piece without a model
falls back to the drawn one in `PieceGeometry.ts`, so the set can be replaced
a piece at a time.

## What the loader does for you

- **Scales** the model so its footprint fills the 0.30 cell-widths the warped
  lattice guarantees every cell can hold. You do not need to model to a size.
- **Stands it on its feet** — the bounding box is measured and the model is
  shifted so y = 0 is the ground and the centre is on the axis. An origin at
  the model's centre is fine.
- **Turns on shadows** for every mesh inside it.

## What it does not do

- **Orientation.** Upright along +Y, facing −Z (north, toward Black) at yaw 0.
  The loader will not rotate a model that was exported lying down.
- **Materials.** Yours are kept as they are, so a model brings its own look.
  That is deliberate — but note the board is flat-shaded low-poly, and a smooth
  model with very dark or very pale materials can lose its form against the
  terrain. Worth looking at on a real board before committing to a whole set.
- **Budget.** Nothing is decimated. The two rooks are ~315 KB each and ship in
  the bundle; a full set at that size is about 3.8 MB.

Every model added here needs its source and licence recorded in
`docs/DECISIONS.md`.
