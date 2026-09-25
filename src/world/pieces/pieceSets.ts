// WHAT: The piece sets there are, and which army in each plays which colour.
// HOW:  One entry per folder under src/chesspieces/. A model's filename names
//       its army and its piece — `anzac_pawn.glb` — and this is where "anzac"
//       becomes White. The original set names its colours directly
//       (`pawn_white.glb`), so its armies are simply called white and black.
// WHY:  A filename can say which army a figure belongs to, and should: that is
//       what the modeller knows while making it. It cannot say which side of a
//       chessboard that army sits on, because that is a decision about the
//       game, and it belongs in one place rather than in twenty-four filenames.
//
//       Adding a set is adding its folder of models and one line here. A set is
//       offered to players only once all twelve pieces exist — see
//       `isCompleteSet` — so a half-made set can live in the repository, and be
//       previewed with `?pieces=<set>`, without anybody else seeing it.

export interface PieceSetDef {
  /** The army that plays White, as it is spelled in the filenames. */
  readonly white: string;
  /** The army that plays Black. */
  readonly black: string;
}

export const PIECE_SETS: Readonly<Record<string, PieceSetDef>> = {
  medieval: { white: 'white', black: 'black' },
  /*
    Gallipoli's armies, used for every First World War board for now. ANZAC is
    White: the side that landed and attacked moves first, and the Anzac Cove
    board is turned so that White's back rank is the beach they came ashore on.
  */
  ww1: { white: 'anzac', black: 'ottoman' },
};
