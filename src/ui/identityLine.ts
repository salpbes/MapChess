// WHAT: The one line that names what is standing on a square — the glyph, the
//       place the piece is named after, and the square itself.
// HOW:  A pure function over SquareStory. Null when there is nothing to say.
// WHY:  Two places need exactly this string and must never disagree about it:
//       the identity card on the briefing's paper, and the peek line the
//       drawer shows on a narrow screen while it is shut. Phase 10 called this
//       reveal the game's best moment, and on a phone the card itself is
//       behind a tab — so the line has to be able to live somewhere else
//       without being written out twice.

import type { Color, PieceType } from '@domain/chess/types';
import type { SquareStory } from '@game/ThemeTracker';

export const PIECE_GLYPH: Readonly<Record<Color, Readonly<Record<PieceType, string>>>> = {
  white: { king: '♔', queen: '♕', rook: '♖', bishop: '♗', knight: '♘', pawn: '♙' },
  black: { king: '♚', queen: '♛', rook: '♜', bishop: '♝', knight: '♞', pawn: '♟' },
};

export function identityLine(story: SquareStory | null): string | null {
  if (story === null) return null;
  if (story.piece !== null) {
    const glyph = PIECE_GLYPH[story.piece.color][story.piece.currentType];
    return `${glyph} ${story.piece.cell.name} · ${story.square}`;
  }
  if (story.cell !== null) return `${story.cell.name} · ${story.square}`;
  return null;
}
