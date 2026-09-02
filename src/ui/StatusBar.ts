// WHAT: One line of text at the top of the screen: whose move, check, result.
// HOW:  Subscribes to the game bus and rewrites a <div>. Also flashes the
//       reason when a move is refused, so "nothing happened" never happens.
// WHY:  Phase 3 needs enough feedback to verify hot-seat play; Phase 11
//       replaces this with the full HUD. Keeping it bus-driven means that
//       replacement touches ui/ only.

import type { GameStatus } from '@domain/chess/types';
import type { GameBus } from '@game/GameEvents';

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
      bus.on('move-refused', (error) => {
        this.flash(`Illegal move: ${error.reason.replace(/-/g, ' ')}`);
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

  private flash(text: string): void {
    this.render(text);
    if (this.flashTimer !== null) clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => {
      this.render(this.baseText);
    }, FLASH_MS);
  }

  private render(text: string): void {
    this.el.textContent = text;
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
