// WHAT: The seam for asking the player which piece a pawn becomes.
// HOW:  One async method. Resolves with the chosen piece, or null if the
//       player backed out (the move is then not played).
// WHY:  GameLoop must not know about DOM buttons. ui/PromotionPrompt implements
//       this; a test could implement it with a constant.

import type { Color, PromotionPiece } from '@domain/chess/types';

export interface IPromotionChooser {
  choose(color: Color): Promise<PromotionPiece | null>;
}
