# `src/chesspieces/` — piece meshes

Drop a `.glb` in here, run `npm run pieces`, and it becomes that piece.

The second step matters. This folder holds the **masters** — whatever came out
of Blender, texture and all. What the game loads is `compressed/`, written by
`npm run pieces`. Nothing runs it for you, so a master you add without running
it is a master the game never sees, and a master you _change_ without running it
leaves the previous version on the board. See `scripts/compress-pieces.mjs`.

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

- **Scales** the set from a target height, then caps any piece broad enough to
  foul the narrowest cell. You do not need to model to a size. What you cannot
  get from modelling is _relative_ size — the current set is height-normalised,
  every model exactly 2.00 units tall, so which piece outranks which is decided
  by `SIZE_ADJUST` in `loadPieceModels.ts` and nowhere else.
- **Stands it on its feet** — the bounding box is measured and the model is
  shifted so y = 0 is the ground and the centre is on the axis. An origin at
  the model's centre is fine.
- **Turns it to face the enemy**, including stripping a yaw that was baked in
  before export. A pawn that arrives rotated 45° on its root node is corrected.
- **Turns on shadows** for every mesh inside it.

## What it does not do

- **Tip it upright.** Upright along +Y is assumed. A model exported lying on
  its side is left as it is, with a warning — that rotation might mean
  something, and guessing would be worse.
- **Materials.** Yours are kept as they are, so a model brings its own look.
  That is deliberate — but note the board is flat-shaded low-poly, and a smooth
  model with very dark or very pale materials can lose its form against the
  terrain. Worth looking at on a real board before committing to a whole set.
- **Decimate.** Nothing is simplified. Geometry has never been the problem here;
  the texture is.

## Budget

A master is ~3.4 MB, of which about 95% is one 2048×2048 baked JPEG. Twelve of
them is 40 MB, which is too much to ship and was enough to time journeys out of
the deploy gate.

`npm run pieces` re-encodes that texture as ETC1S in a KTX2 container — **the
same 2048×2048, a different encoding** — which the GPU reads compressed. The set
ships at 11 MB, and a piece costs about 0.9 MB. Measured difference on a rendered
board: 0.57/255 mean, which is under a quarter of one percent.

Keep the masters. They are the source of truth and the compression is lossy, so
re-compressing a compressed file would compound the loss.

Every model added here needs its source and licence recorded in
`docs/DECISIONS.md`.
