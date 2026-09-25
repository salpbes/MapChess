# `src/chesspieces/` — piece meshes

Pieces live in **sets**, one folder each: `medieval/`, `ww1/`, `ww2/`, …

Drop a `.glb` into a set folder, run `npm run pieces`, and it becomes that
piece. The second step matters: these folders hold the **masters**, whatever
came out of Blender. What the game loads is `compressed/<set>/`, written by
`npm run pieces`. It skips anything already up to date, so running it is cheap;
`npm run pieces -- --force` re-encodes everything.

## Naming

Two words, the piece and its side, either way round:

```text
medieval/pawn_white.glb      the original set names its sides by colour
ww1/anzac_pawn.glb           an era set names them by army
ww1/ottoman_pawn.glb
```

Pieces are `pawn`, `knight`, `bishop`, `rook`, `queen`, `king`. Which army is
White is decided **once**, in `src/world/pieces/pieceSets.ts`, not in the
filenames:

```ts
ww1: { white: 'anzac', black: 'ottoman' },
```

A name that does not parse — `anzac-pawn.glb`, `french_pawn.glb` in the WW1
folder, `rook.glb` — is **skipped silently**, which looks exactly like a model
that failed to load. The rule is pinned down in
`tests/world/modelKeyFor.test.ts`.

## Which set a board uses

- **Anywhere on the map:** `medieval`, always. It is the original set.
- **A famous battlefield:** its era's set — `ww1` for Anzac Cove, Verdun and
  Kobarid — but **only once that set has all twelve pieces.** Until then those
  boards keep the medieval pieces, so players never see a half-made set.
- **A preview, for you:** add `?pieces=ww1` to the address. Every board then
  uses that set, with any piece it does not have yet taken from `medieval`, so
  you can see new figures on real ground as each one is finished.

A new era set needs its folder, its line in `pieceSets.ts`, and nothing else.

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
