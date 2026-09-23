// WHAT: The game, said out loud — a live region a screen reader reads as the
//       game changes.
// HOW:  A visually hidden div with `aria-live="polite"`, rewritten on the same
//       bus events the HUD draws from. Polite rather than assertive: a move is
//       worth hearing at the next pause, not worth cutting the reader off in
//       the middle of a sentence.
// WHY:  BUILD_PLAN §13.7. Everything the game says, it says by drawing: the
//       piece moves, the status line changes, the record grows. None of that
//       reaches somebody who is not looking at it, so the one fact that
//       matters — what was just played, and whose turn it is now — is stated
//       in words.
//
//       One region, not two. The status bar could have carried `aria-live`
//       itself, but then a move would be announced twice: once as the move and
//       once as the turn changing.

import type { Color } from '@domain/chess/types';
import type { GameBus } from '@game/GameEvents';

import { outcomeHeadline } from './outcomeText';

const SIDE: Readonly<Record<Color, string>> = { white: 'White', black: 'Black' };

export class Announcer {
  private readonly el: HTMLDivElement;
  private readonly unsubscribe: (() => void)[] = [];
  /** A move said and not yet paired with the turn it handed over. */
  private pendingMove: string | null = null;

  public constructor(container: HTMLElement, bus: GameBus) {
    this.el = document.createElement('div');
    this.el.className = 'visually-hidden';
    this.el.setAttribute('aria-live', 'polite');
    this.el.setAttribute('aria-atomic', 'true');
    container.appendChild(this.el);

    this.unsubscribe.push(
      /*
        A move and the turn it hands over are one thing to hear, not two. Said
        separately they race: the move is written into the region and the turn
        overwrites it a moment later, and a reader that was mid-sentence
        announces only the second. So the move waits for the status that
        follows it, and the two go out together.
      */
      bus.on('move-played', (move) => {
        const taken = move.captured === null ? '' : `, taking a ${move.captured}`;
        this.pendingMove = `${SIDE[move.color]} plays ${move.san}${taken}.`;
        // If nothing follows it this turn of the loop, the move stands alone.
        queueMicrotask(() => {
          if (this.pendingMove !== null) this.flush('');
        });
      }),
      bus.on('selection-changed', ({ square, targets }) => {
        if (square === null) return;
        const count = targets.length;
        this.say(
          count === 0
            ? `${square} selected, nowhere to go.`
            : `${square} selected, ${String(count)} ${count === 1 ? 'move' : 'moves'}.`,
        );
      }),
      bus.on('status-changed', ({ status, turn }) => {
        if (status.kind !== 'playing') {
          this.flush('');
          return;
        }
        this.flush(status.inCheck ? `${SIDE[turn]} to move, in check.` : `${SIDE[turn]} to move.`);
      }),
      bus.on('game-over', ({ outcome }) => {
        this.flush(outcomeHeadline(outcome));
      }),
    );
  }

  public dispose(): void {
    for (const off of this.unsubscribe) off();
    this.el.remove();
  }

  /** Says the move just played and what follows it, as one sentence. */
  private flush(status: string): void {
    const move = this.pendingMove;
    this.pendingMove = null;
    const text = [move ?? '', status].filter((part) => part !== '').join(' ');
    if (text !== '') this.say(text);
  }

  /**
   * Says something in the one live region. Public for the few things that are
   * not game events but still need saying — arriving at a named place is one —
   * so that nothing else in the app grows a live region of its own. Two regions
   * race, and a reader mid-sentence announces only whichever wrote last.
   */
  public say(text: string): void {
    // Rewriting with the same string is not a change, so a reader stays quiet.
    // A trailing space makes a repeat count as new text without being read.
    this.el.textContent = this.el.textContent === text ? `${text} ` : text;
  }
}
