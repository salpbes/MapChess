// WHAT: The English for how a game ended.
// HOW:  One function from GameOutcome to a headline, and one for the small
//       print underneath it.
// WHY:  The status bar and the game-over screen say the same thing in two
//       sizes. Writing it twice is how they end up disagreeing.

import type { GameOutcome } from '@game/GameOutcome';

const DRAW_REASON: Readonly<Record<string, string>> = {
  stalemate: 'stalemate — no legal move, and no check',
  'fifty-moves': 'fifty moves without a capture or a pawn move',
  'threefold-repetition': 'the same position three times',
  'insufficient-material': 'neither side has enough material to mate',
};

export function outcomeHeadline(outcome: GameOutcome): string {
  switch (outcome.kind) {
    case 'checkmate':
      return `Checkmate — ${side(outcome.winner)} wins`;
    case 'resignation':
      return `${side(outcome.loser)} resigns — ${side(outcome.winner)} wins`;
    case 'draw':
      return 'Draw';
  }
}

export function outcomeDetail(outcome: GameOutcome): string {
  switch (outcome.kind) {
    case 'checkmate':
      return 'The king has no square left to stand on.';
    case 'resignation':
      return 'The game was given up rather than played out.';
    case 'draw':
      return capitalise(DRAW_REASON[outcome.reason] ?? outcome.reason.replace(/-/g, ' '));
  }
}

function side(color: 'white' | 'black'): string {
  return color === 'white' ? 'White' : 'Black';
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
