// WHAT: A small book of named openings, and what the book plays next.
// HOW:  Lines of standard algebraic notation, longest-prefix matched against
//       the moves actually played. The same table answers both questions a
//       beginner has in the first ten moves: "what is this called?" — the
//       longest line the game has followed — and "what do good players do
//       here?" — the next move of every line that continues from this one.
// WHY:  The opening is where a new player is most lost and where help is
//       cheapest to give: there is a right answer, it is the same every game,
//       and it has a name. Naming it turns twenty random-looking moves into a
//       thing that can be looked up, talked about, and played again.
//
//       Deliberately short. This is a book of openings a club player would
//       recognise by name, not an ECO table — a hundred sub-variations would
//       be a database, and the card has room for one line.

/** One named line, in the order it is played. No check or mate suffixes. */
export interface BookLine {
  readonly moves: readonly string[];
  readonly name: string;
}

export interface OpeningMatch {
  /** The longest named line the game has followed, or null while off book. */
  readonly name: string | null;
  /** How many plies of that line have been played. */
  readonly plies: number;
  /** What the book plays from this exact position, most common first. */
  readonly next: readonly string[];
}

/** More than three is a list, not advice. */
const MOST_SUGGESTED = 3;

/**
 * Ordered by how often the move is met, most common first, because that order
 * is what `next` hands back. Within an opening, the main line comes first.
 */
const BOOK: readonly BookLine[] = [
  // --- 1. e4 ---
  { moves: ['e4'], name: "King's Pawn Opening" },
  { moves: ['e4', 'e5'], name: 'Open Game' },
  { moves: ['e4', 'e5', 'Nf3'], name: "King's Knight Opening" },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6'], name: "King's Knight, Normal Variation" },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'], name: 'Ruy López' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'], name: 'Italian Game' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5'], name: 'Giuoco Piano' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6'], name: 'Two Knights Defence' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'd4'], name: 'Scotch Game' },
  { moves: ['e4', 'e5', 'Nf3', 'Nf6'], name: "Petrov's Defence" },
  { moves: ['e4', 'e5', 'Nf3', 'd6'], name: 'Philidor Defence' },
  { moves: ['e4', 'e5', 'Nc3'], name: 'Vienna Game' },
  { moves: ['e4', 'e5', 'Bc4'], name: "Bishop's Opening" },
  { moves: ['e4', 'e5', 'f4'], name: "King's Gambit" },
  { moves: ['e4', 'c5'], name: 'Sicilian Defence' },
  { moves: ['e4', 'c5', 'Nf3'], name: 'Sicilian, Open' },
  { moves: ['e4', 'c5', 'Nf3', 'd6'], name: 'Sicilian, Najdorf territory' },
  { moves: ['e4', 'c5', 'Nf3', 'Nc6'], name: 'Sicilian, Old Variation' },
  { moves: ['e4', 'c5', 'Nf3', 'e6'], name: 'Sicilian, Taimanov territory' },
  { moves: ['e4', 'c5', 'Nc3'], name: 'Sicilian, Closed' },
  { moves: ['e4', 'c5', 'c3'], name: 'Sicilian, Alapin' },
  { moves: ['e4', 'e6'], name: 'French Defence' },
  { moves: ['e4', 'e6', 'd4', 'd5', 'Nc3'], name: 'French, Classical' },
  { moves: ['e4', 'e6', 'd4', 'd5', 'Nd2'], name: 'French, Tarrasch' },
  { moves: ['e4', 'e6', 'd4', 'd5', 'e5'], name: 'French, Advance' },
  { moves: ['e4', 'e6', 'd4', 'd5', 'exd5'], name: 'French, Exchange' },
  { moves: ['e4', 'c6'], name: 'Caro-Kann Defence' },
  { moves: ['e4', 'c6', 'd4', 'd5', 'e5'], name: 'Caro-Kann, Advance' },
  { moves: ['e4', 'c6', 'd4', 'd5', 'Nc3'], name: 'Caro-Kann, Main Line' },
  { moves: ['e4', 'd5'], name: 'Scandinavian Defence' },
  { moves: ['e4', 'Nf6'], name: "Alekhine's Defence" },
  { moves: ['e4', 'd6'], name: 'Pirc Defence' },
  { moves: ['e4', 'g6'], name: 'Modern Defence' },

  // --- 1. d4 ---
  { moves: ['d4'], name: "Queen's Pawn Opening" },
  { moves: ['d4', 'd5'], name: 'Closed Game' },
  { moves: ['d4', 'd5', 'c4'], name: "Queen's Gambit" },
  { moves: ['d4', 'd5', 'c4', 'e6'], name: "Queen's Gambit Declined" },
  { moves: ['d4', 'd5', 'c4', 'c6'], name: 'Slav Defence' },
  { moves: ['d4', 'd5', 'c4', 'dxc4'], name: "Queen's Gambit Accepted" },
  { moves: ['d4', 'd5', 'Nf3'], name: "Queen's Pawn Game" },
  { moves: ['d4', 'Nf6'], name: 'Indian Defence' },
  { moves: ['d4', 'Nf6', 'c4'], name: 'Indian Game' },
  { moves: ['d4', 'Nf6', 'c4', 'e6'], name: 'Indian, East Indian Defence' },
  { moves: ['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4'], name: 'Nimzo-Indian Defence' },
  { moves: ['d4', 'Nf6', 'c4', 'e6', 'Nf3', 'b6'], name: "Queen's Indian Defence" },
  { moves: ['d4', 'Nf6', 'c4', 'g6'], name: 'Indian, King’s Indian territory' },
  { moves: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7'], name: "King's Indian Defence" },
  { moves: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'd5'], name: 'Grünfeld Defence' },
  { moves: ['d4', 'Nf6', 'c4', 'c5'], name: 'Benoni Defence' },
  { moves: ['d4', 'f5'], name: 'Dutch Defence' },

  // --- The flank openings ---
  { moves: ['c4'], name: 'English Opening' },
  { moves: ['Nf3'], name: 'Réti Opening' },
  { moves: ['g3'], name: "King's Fianchetto Opening" },
  { moves: ['b3'], name: 'Nimzo-Larsen Attack' },
  { moves: ['f4'], name: "Bird's Opening" },
];

/**
 * `history` is the standard algebraic notation of the moves played, oldest
 * first. Check and mate marks are ignored, so "Bb5+" matches "Bb5".
 */
export function openingFor(history: readonly string[]): OpeningMatch {
  const played = history.map(bare);

  let name: string | null = null;
  let plies = 0;
  const next: string[] = [];

  for (const line of BOOK) {
    if (line.moves.length <= played.length) {
      // A named line the game has followed all the way; keep the longest.
      if (line.moves.length > plies && startsWith(played, line.moves)) {
        name = line.name;
        plies = line.moves.length;
      }
    } else if (startsWith(line.moves, played)) {
      // A line that continues from here: its next move is a book move.
      const move = line.moves[played.length];
      if (move !== undefined && !next.includes(move)) next.push(move);
    }
  }

  return { name, plies, next: next.slice(0, MOST_SUGGESTED) };
}

/** True when `whole` begins with every element of `prefix`. */
function startsWith(whole: readonly string[], prefix: readonly string[]): boolean {
  return prefix.length <= whole.length && prefix.every((move, i) => whole[i] === move);
}

/** "Bb5+" and "Qh5#" are the same book move as "Bb5" and "Qh5". */
function bare(san: string): string {
  return san.replace(/[+#]+$/, '');
}

export const BOOK_SIZE = BOOK.length;
export const BOOK_LINES: readonly BookLine[] = BOOK;
