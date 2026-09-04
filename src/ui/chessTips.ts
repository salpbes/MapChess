// WHAT: Short things to read while the terrain downloads.
// HOW:  A list of one-line tips about chess, and a picker that never hands back
//       the one just shown.
// WHY:  Fetching elevation tiles and an Overpass answer takes a few seconds on
//       a cold area, and a progress count is a poor thing to look at. A player
//       waiting for a board is a player who came here to play chess, so this is
//       the one moment in the game where telling them how en passant works is
//       welcome rather than in the way.

const TIPS: readonly string[] = [
  'A pawn that reaches the far side becomes any piece you like. Almost everyone picks a queen.',
  'Knights are the only pieces that jump. They are also the only ones that look lost doing it.',
  'A bishop never changes colour. The one that starts on a light square dies on a light square.',
  'Castling is the only move that shifts two of your pieces at once.',
  'You may not castle out of check, through check, or into check. The rules are firm on this.',
  'A knight on the rim is dim — it can reach half as many squares from the edge.',
  'Rooks want open files the way water wants a valley.',
  'Check is not a plan.',
  'If you cannot think what to do, improve your worst-placed piece.',
  'En passant has been in the rules since 1561. It is not made up.',
  'Stalemate is a draw: no legal move, but not in check. Half a point for whoever was losing.',
  'Fifty moves with no capture and no pawn move is a draw. Somebody is counting.',
  'Pawns can never go backwards, so every pawn move is a decision you keep.',
  'The player who is winning is usually the one who blunders last.',
  'Two bishops on an open board are worth more than the sum of two bishops.',
  'Trade pieces when you are ahead on material, pawns when you are behind.',
  'The queen is strong enough not to need to do everything herself.',
  'Kings become fighting pieces once most of the board has emptied out.',
  'Three repetitions of the same position and either player may claim a draw.',
  'A passed pawn should be pushed. It grows more dangerous with every rank.',
];

/** A tip, never the one already on screen. */
export function nextTip(previous: string | null): string {
  const pool = TIPS.filter((tip) => tip !== previous);
  const chosen = pool[Math.floor(Math.random() * pool.length)];
  // `pool` is only empty if the list itself is, which the tests forbid.
  return chosen ?? TIPS[0] ?? '';
}

export const TIP_COUNT = TIPS.length;
