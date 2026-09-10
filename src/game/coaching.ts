// WHAT: The three short lines the coach card shows: where the game is, the one
//       thing worth doing about it, and two numbers.
// HOW:  Names the opening from the book while the game is still near it, then
//       falls back to the phase. The advice is the first rule that fires in a
//       fixed order of priority — check, then book, then the mistakes a new
//       player actually makes, then what to do with a lead or a deficit. The
//       facts come from counting the pieces.
// WHY:  A beginner does not need an engine line, they need to be told that the
//       thing they are playing has a name, that two of their pieces are still
//       sitting at home, and that being a knight up means trading. All of that
//       is cheap arithmetic over the position — no search, so it can run after
//       every move without the board ever waiting for it.
//
//       One rule fires, not all of them. A list of five things to think about
//       is the same as no advice at all, and the card has one line.

import { fileIndex, rankIndex } from '@domain/board/Square';
import type { Square } from '@domain/board/Square';
import { PIECE_VALUE } from '@domain/chess/values';
import type { IChessEngine } from '@domain/chess/IChessEngine';
import { openingFor } from '@domain/chess/openings';
import { opponent } from '@domain/chess/types';
import type { Color, PlacedPiece } from '@domain/chess/types';

export type Phase = 'opening' | 'middlegame' | 'endgame';

export interface Coaching {
  readonly phase: Phase;
  /** "Italian Game" while the book still applies, else "Middlegame". */
  readonly title: string;
  /** One sentence, addressed to the player whose turn it is. */
  readonly advice: string;
  /** "You are 3 ahead · 2 of 4 pieces out · move 7". */
  readonly facts: string;
}

/** Past this many plies off book, the opening's name stops being the news. */
const BOOK_MEMORY = 6;
/** Total non-pawn, non-king material on the board below which it is an endgame. */
const ENDGAME_MATERIAL = 24;
/** Plies before the middlegame is assumed, if there is still material about. */
const OPENING_PLIES = 20;
/** A lead worth changing your plan for, in pawns. */
const DECISIVE = 2;

const HOME: Readonly<
  Record<
    Color,
    { readonly minors: readonly Square[]; readonly king: Square; readonly queen: Square }
  >
> = {
  white: { minors: ['b1', 'c1', 'f1', 'g1'], king: 'e1', queen: 'd1' },
  black: { minors: ['b8', 'c8', 'f8', 'g8'], king: 'e8', queen: 'd8' },
};

const COUNT_WORD: readonly string[] = ['no', 'one', 'two', 'three', 'four'];

/**
 * Advice for `forColor`, who is normally the side to move. Reads the engine
 * but never changes it.
 */
export function coach(engine: IChessEngine, forColor: Color): Coaching {
  const pieces = engine.pieces();
  const mine = pieces.filter((p) => p.piece.color === forColor);
  const theirs = pieces.filter((p) => p.piece.color !== forColor);

  // The move number comes from the position, not from the move list: a
  // position set up from a FEN has no history, and counting the list would
  // call move 40 of an endgame move 1 and offer it the first-move book.
  const ply = plyOf(engine.fen);
  const fromTheStart = engine.history.length === ply;
  const book = fromTheStart
    ? openingFor(engine.history.map((m) => m.san))
    : { name: null, plies: 0, next: [] };
  const phase = phaseOf(pieces, ply);
  const lead = value(mine) - value(theirs);
  const home = HOME[forColor];
  const atHome = home.minors.filter((sq) => isMinorOf(engine, sq, forColor)).length;
  const developed = home.minors.length - atHome;

  return {
    phase,
    title: titleFor(book.name, ply - book.plies, phase),
    advice: adviceFor({ engine, forColor, phase, lead, atHome, developed, book: book.next, mine }),
    facts: factsFor(lead, developed, phase, ply),
  };
}

interface Situation {
  readonly engine: IChessEngine;
  readonly forColor: Color;
  readonly phase: Phase;
  readonly lead: number;
  readonly atHome: number;
  readonly developed: number;
  readonly book: readonly string[];
  readonly mine: readonly PlacedPiece[];
}

/** The first rule that fires wins; the last one always does. */
function adviceFor(s: Situation): string {
  const { engine, forColor, phase } = s;
  const home = HOME[forColor];

  const status = engine.status;
  if (status.kind === 'playing' && status.inCheck && engine.turn === forColor) {
    return 'You are in check. Move the king, block the line, or take the attacker.';
  }

  if (s.book.length > 0) {
    return `Strong players usually play ${list(s.book)} here.`;
  }

  const queenOut = s.mine.some((p) => p.piece.type === 'queen' && p.square !== home.queen);
  if (phase === 'opening' && queenOut && s.developed <= 1) {
    return 'Your queen came out early. She will be chased about while they develop for free.';
  }

  if (phase === 'opening' && s.atHome >= 2) {
    return `${capital(COUNT_WORD[s.atHome] ?? String(s.atHome))} of your pieces are still at home. Knights and bishops out first, then castle.`;
  }

  const kingHome = s.mine.some((p) => p.piece.type === 'king' && p.square === home.king);
  if (phase !== 'endgame' && kingHome && canCastle(engine.fen, forColor)) {
    return 'Castle soon. It tucks the king into the corner and brings a rook into the game.';
  }

  const passed = passedPawns(s.mine, s.engine.pieces(), forColor);
  const runner = passed[0];
  if (phase === 'endgame' && runner !== undefined) {
    return `Push the passed pawn on ${runner}. Nothing can stop it with a pawn, and it grows every rank.`;
  }

  if (phase === 'endgame' && kingHome) {
    return 'Walk your king towards the middle. With the queens gone it is a fighting piece.';
  }

  if (s.lead >= DECISIVE) {
    return 'You are ahead on material. Trade pieces whenever you can — every swap makes the lead bigger.';
  }

  if (s.lead <= -DECISIVE) {
    return 'You are behind on material. Keep pieces on the board and go looking for a tactic.';
  }

  return 'Find your worst-placed piece and give it a better square. That is a plan on any move.';
}

function titleFor(name: string | null, pliesOffBook: number, phase: Phase): string {
  if (name !== null && pliesOffBook <= BOOK_MEMORY) return name;
  return phase === 'opening' ? 'Opening' : phase === 'endgame' ? 'Endgame' : 'Middlegame';
}

function factsFor(lead: number, developed: number, phase: Phase, plies: number): string {
  const material =
    lead === 0
      ? 'Material even'
      : `You are ${String(Math.abs(lead))} ${lead > 0 ? 'ahead' : 'behind'}`;
  const move = `move ${String(Math.floor(plies / 2) + 1)}`;
  if (phase !== 'opening') return `${material} · ${move}`;
  return `${material} · ${String(developed)} of 4 pieces out · ${move}`;
}

/**
 * How many half-moves have been played, read off the FEN's move number and
 * side to move. Works for a position that was set up rather than played.
 */
function plyOf(fen: string): number {
  const parts = fen.split(' ');
  const fullmove = Number(parts[5]);
  const started = Number.isFinite(fullmove) && fullmove >= 1 ? fullmove : 1;
  return (started - 1) * 2 + (parts[1] === 'b' ? 1 : 0);
}

function phaseOf(pieces: readonly PlacedPiece[], plies: number): Phase {
  const heavy = pieces
    .filter((p) => p.piece.type !== 'pawn' && p.piece.type !== 'king')
    .reduce((sum, p) => sum + PIECE_VALUE[p.piece.type], 0);
  if (heavy <= ENDGAME_MATERIAL) return 'endgame';
  return plies < OPENING_PLIES ? 'opening' : 'middlegame';
}

function value(pieces: readonly PlacedPiece[]): number {
  return pieces.reduce((sum, p) => sum + PIECE_VALUE[p.piece.type], 0);
}

function isMinorOf(engine: IChessEngine, square: Square, color: Color): boolean {
  const piece = engine.pieceAt(square);
  return (
    piece !== null && piece.color === color && (piece.type === 'knight' || piece.type === 'bishop')
  );
}

/**
 * A pawn with no enemy pawn ahead of it on its own file or either neighbour.
 * Furthest advanced first: that is the one worth pushing.
 */
function passedPawns(
  mine: readonly PlacedPiece[],
  all: readonly PlacedPiece[],
  color: Color,
): readonly Square[] {
  const forward = color === 'white' ? 1 : -1;
  const enemyPawns = all.filter(
    (p) => p.piece.type === 'pawn' && p.piece.color === opponent(color),
  );

  return mine
    .filter((p) => p.piece.type === 'pawn')
    .filter((p) => {
      const file = fileIndex(p.square);
      const rank = rankIndex(p.square);
      return !enemyPawns.some(
        (e) =>
          Math.abs(fileIndex(e.square) - file) <= 1 && (rankIndex(e.square) - rank) * forward > 0,
      );
    })
    .sort((a, b) => (rankIndex(b.square) - rankIndex(a.square)) * forward)
    .map((p) => p.square);
}

/** Read straight off the FEN's castling field: "KQkq", or "-" for none. */
function canCastle(fen: string, color: Color): boolean {
  const rights = fen.split(' ')[2] ?? '-';
  const wanted = color === 'white' ? /[KQ]/ : /[kq]/;
  return wanted.test(rights);
}

function list(moves: readonly string[]): string {
  if (moves.length <= 1) return moves[0] ?? '';
  return `${moves.slice(0, -1).join(', ')} or ${String(moves[moves.length - 1])}`;
}

function capital(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
