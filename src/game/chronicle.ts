// WHAT: The end of a game written up as a short account: who did what, where,
//       and on which move.
// HOW:  A pure function over the outcome, the move list and two lookups the
//       caller supplies — the name of the ground on a square, and the identity
//       of the piece standing there. Returns two or three short lines. Falls
//       back to plain square names wherever the map has not named something,
//       so a flat board still gets a readable account.
// WHY:  MapChess gives every piece and every square a real place name, and the
//       moment that is worth the most is the last one. "Checkmate — White wins"
//       is the same sentence every chess program has ever printed; "the bishop
//       of Abbot Hagg Wood came to Nether Meadow, and Black's king had nowhere
//       left to stand at Scawton Croft" only happens here.

import type { Square } from '@domain/board/Square';
import { opponent } from '@domain/chess/types';
import type { Color, Move, PieceType } from '@domain/chess/types';

import { summariseCaptures } from './captures';
import type { GameOutcome } from './GameOutcome';

export interface ChronicleScene {
  readonly outcome: GameOutcome;
  readonly moves: readonly Move[];
  /** The name of the ground on a square, or null where the map named nothing. */
  readonly placeOf: (square: Square) => string | null;
  /** Where a colour's king is standing now. */
  readonly kingSquareOf: (color: Color) => Square | null;
  /** The identity carried by the piece on a square — itself a place name. */
  readonly pieceNameOf: (square: Square) => string | null;
}

const PIECE_WORD: Readonly<Record<PieceType, string>> = {
  pawn: 'pawn',
  knight: 'knight',
  bishop: 'bishop',
  rook: 'rook',
  queen: 'queen',
  king: 'king',
};

export function chronicle(scene: ChronicleScene): readonly string[] {
  switch (scene.outcome.kind) {
    case 'checkmate':
      return mated(scene, scene.outcome.winner);
    case 'resignation':
      return resigned(scene, scene.outcome.winner, scene.outcome.loser);
    case 'draw':
      return drawn(scene);
  }
}

function mated(scene: ChronicleScene, winner: Color): readonly string[] {
  const lines: string[] = [];
  const last = scene.moves[scene.moves.length - 1];
  const loser = opponent(winner);

  if (last !== undefined) {
    const name = scene.pieceNameOf(last.to);
    // The piece's identity is itself a place, so "the bishop of Abbot Hagg
    // Wood" reads as a title rather than as a repeated square name.
    const who =
      name === null
        ? `${side(winner)}'s ${PIECE_WORD[last.piece]}`
        : `${side(winner)}'s ${PIECE_WORD[last.piece]} of ${name}`;
    const deed =
      last.captured === null
        ? `came to ${where(scene, last.to)}`
        : `took the ${PIECE_WORD[last.captured]} at ${where(scene, last.to)}`;
    lines.push(`Move ${String(moveNumber(scene.moves))}: ${who} ${deed}.`);
  }

  const trapped = scene.kingSquareOf(loser);
  lines.push(
    trapped === null
      ? `${side(loser)}'s king had nowhere left to stand.`
      : `${side(loser)}'s king had nowhere left to stand at ${where(scene, trapped)}.`,
  );
  lines.push(tally(scene));
  return lines;
}

function resigned(scene: ChronicleScene, winner: Color, loser: Color): readonly string[] {
  const lines = [
    `${side(loser)} gave up the field after ${String(moveNumber(scene.moves))} moves.`,
  ];

  const balance = summariseCaptures(scene.moves).balance;
  const lead = winner === 'white' ? balance : -balance;
  if (lead > 0) {
    lines.push(`${side(winner)} was ${String(lead)} ahead on material by then.`);
  } else {
    // Resigning level or behind on material is a judgement about the position.
    lines.push('The material was even — the position had already decided it.');
  }

  const held = scene.kingSquareOf(winner);
  if (held !== null) lines.push(`${side(winner)}'s king still held ${where(scene, held)}.`);
  return lines;
}

function drawn(scene: ChronicleScene): readonly string[] {
  const lines = [`Neither side could force it, after ${String(moveNumber(scene.moves))} moves.`];
  const white = scene.kingSquareOf('white');
  const black = scene.kingSquareOf('black');
  if (white !== null && black !== null) {
    lines.push(`The kings ended at ${where(scene, white)} and ${where(scene, black)}.`);
  }
  lines.push(tally(scene));
  return lines;
}

function tally(scene: ChronicleScene): string {
  const { byWhite, byBlack } = summariseCaptures(scene.moves);
  const taken = byWhite.length + byBlack.length;
  if (taken === 0) return 'Not a piece was taken.';
  return `${String(taken)} ${taken === 1 ? 'piece' : 'pieces'} fell along the way.`;
}

/** Full moves, not plies: the number a player would write down. */
function moveNumber(moves: readonly Move[]): number {
  return Math.ceil(moves.length / 2);
}

/** A named place where the map has one, the bare square where it does not. */
function where(scene: ChronicleScene, square: Square): string {
  return scene.placeOf(square) ?? square;
}

function side(color: Color): string {
  return color === 'white' ? 'White' : 'Black';
}
