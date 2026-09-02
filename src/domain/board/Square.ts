// WHAT: Algebraic square names ('a1'…'h8') and index helpers.
// HOW:  File letters and rank digits as literal-union types, a `Square`
//       template-literal type built from them, and pure conversions between a
//       square name and its zero-based (file, rank) indices.
// WHY:  Both the chess engine and the board layout identify squares by name.
//       Defining it once here means neither layer imports the other for it.

export const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
export const RANKS = ['1', '2', '3', '4', '5', '6', '7', '8'] as const;

export type File = (typeof FILES)[number];
export type Rank = (typeof RANKS)[number];
export type Square = `${File}${Rank}`;

export const BOARD_SIZE = 8;

/** All 64 squares, a1..h1, a2..h2, … h8 (rank-major, matching FEN row order reversed). */
export const ALL_SQUARES: readonly Square[] = RANKS.flatMap((rank) =>
  FILES.map((file): Square => `${file}${rank}`),
);

/** Zero-based file index: a → 0, h → 7. */
export function fileIndex(square: Square): number {
  return square.charCodeAt(0) - 'a'.charCodeAt(0);
}

/** Zero-based rank index: 1 → 0, 8 → 7. */
export function rankIndex(square: Square): number {
  return square.charCodeAt(1) - '1'.charCodeAt(0);
}

export function squareAt(file: number, rank: number): Square {
  const f = FILES[file];
  const r = RANKS[rank];
  if (f === undefined || r === undefined) {
    throw new RangeError(`No square at file ${String(file)}, rank ${String(rank)}.`);
  }
  return `${f}${r}`;
}
