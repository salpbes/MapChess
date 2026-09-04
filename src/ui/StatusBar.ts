// WHAT: One line of text at the top of the screen: whose move, check, result.
// HOW:  Subscribes to the game bus and rewrites a <div>. Also flashes the
//       reason when a move is refused, so "nothing happened" never happens.
//       A `game-over` outcome outranks the position, because a resignation
//       leaves a position that still looks perfectly playable.
// WHY:  Phase 3 needs enough feedback to verify hot-seat play; the rest of the
//       HUD grew around it in Phase 11 rather than replacing it — one line of
//       "whose move" is still the thing a player looks at most.

import type { GameStatus, PieceType } from '@domain/chess/types';
import type { BlockedReason, GameBus } from '@game/GameEvents';

import { outcomeHeadline } from './outcomeText';

const FLASH_MS = 1800;

export class StatusBar {
  private readonly el: HTMLDivElement;
  private readonly unsubscribe: (() => void)[] = [];
  private flashTimer: ReturnType<typeof setTimeout> | null = null;
  private baseText = '';

  public constructor(container: HTMLElement, bus: GameBus) {
    this.el = document.createElement('div');
    this.el.className = 'status-bar';
    container.appendChild(this.el);

    this.unsubscribe.push(
      bus.on('status-changed', ({ status, turn }) => {
        this.baseText = describe(status, turn);
        this.render(this.baseText);
      }),
      bus.on('game-over', ({ outcome }) => {
        this.baseText = outcomeHeadline(outcome);
        this.render(this.baseText);
      }),
      bus.on('move-refused', (error) => {
        this.flash(`Illegal move: ${error.reason.replace(/-/g, ' ')}`);
      }),
      bus.on('selection-blocked', ({ piece, reason }) => {
        this.flash(explainBlocked(piece, reason));
      }),
      bus.on('hint-thinking', () => {
        this.render('Looking for a good move…');
      }),
      bus.on('hint-offered', () => {
        // HintCard says what the move is and why, and stays until it is acted
        // on; repeating it here would only take the line away from the turn.
        this.render(this.baseText);
      }),
      bus.on('hint-failed', ({ error }) => {
        console.error('Hint failed:', error);
        this.flash('No advice available just now.');
      }),
      bus.on('ai-thinking', ({ color }) => {
        this.render(`${color === 'white' ? 'White' : 'Black'} is thinking…`);
      }),
      bus.on('ai-error', ({ error }) => {
        const detail = error instanceof Error ? error.message : String(error);
        console.error('AI error, played fallback move:', error);
        this.flash(`Engine problem — played a fallback move (${detail})`);
      }),
    );
  }

  public dispose(): void {
    for (const off of this.unsubscribe) off();
    if (this.flashTimer !== null) clearTimeout(this.flashTimer);
    this.el.remove();
  }

  private flash(text: string, forMs: number = FLASH_MS): void {
    this.render(text);
    if (this.flashTimer !== null) clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => {
      this.render(this.baseText);
    }, forMs);
  }

  private render(text: string): void {
    this.el.textContent = text;
  }
}

function explainBlocked(piece: PieceType, reason: BlockedReason): string {
  switch (reason) {
    case 'pinned':
      // The most confusing of the three: the piece looks free and is not.
      return `That ${piece} is pinned — moving it would expose your king.`;
    case 'in-check':
      return `Your king is in check — that ${piece} cannot help.`;
    case 'no-moves':
      return `That ${piece} has nowhere to go.`;
  }
}

function describe(status: GameStatus, turn: 'white' | 'black'): string {
  const side = turn === 'white' ? 'White' : 'Black';
  switch (status.kind) {
    case 'checkmate':
      return `Checkmate — ${status.winner === 'white' ? 'White' : 'Black'} wins`;
    case 'draw':
      return `Draw — ${status.reason.replace(/-/g, ' ')}`;
    case 'playing':
      return status.inCheck ? `${side} to move — check` : `${side} to move`;
  }
}
