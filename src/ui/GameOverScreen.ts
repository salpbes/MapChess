// WHAT: The card that appears when the game ends, and writes up how it ended.
// HOW:  Shows on `game-over`, hides on anything that re-opens play — a new
//       game, or a take-back that moves the history. Keeps the latest history
//       so `chronicle()` can name the last move, the ground it happened on and
//       the square the losing king was cornered in. Offers the menu or a
//       dismissal, because the board is worth looking at after the game too.
// WHY:  A result that only appears in the status bar is missed. And "Checkmate
//       — White wins" is the sentence every chess program prints; the account
//       underneath it, in the names of real places, is the Phase 10 reveal
//       paying off one last time.

import type { Move } from '@domain/chess/types';
import { chronicle } from '@game/chronicle';
import type { GameBus } from '@game/GameEvents';
import type { GameOutcome } from '@game/GameOutcome';
import type { ThemeTracker } from '@game/ThemeTracker';

import { outcomeDetail, outcomeHeadline } from './outcomeText';

export class GameOverScreen {
  private readonly backdrop: HTMLDivElement;
  private readonly headline: HTMLDivElement;
  private readonly detail: HTMLDivElement;
  private readonly story: HTMLDivElement;
  private readonly unsubscribe: (() => void)[];
  private moves: readonly Move[] = [];

  public constructor(
    container: HTMLElement,
    bus: GameBus,
    private readonly tracker: ThemeTracker,
    onMenu: () => void,
  ) {
    this.backdrop = document.createElement('div');
    this.backdrop.className = 'gameover-backdrop';
    this.backdrop.hidden = true;

    const card = document.createElement('div');
    card.className = 'gameover';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', 'Game over');

    this.headline = line('gameover__headline');
    this.detail = line('gameover__detail');
    this.story = line('gameover__story');

    const actions = document.createElement('div');
    actions.className = 'gameover__actions';
    actions.append(
      button('Menu', 'gameover__button gameover__button--primary', () => {
        this.hide();
        onMenu();
      }),
      button('Keep looking', 'gameover__button', () => {
        this.hide();
      }),
    );

    card.append(this.headline, this.detail, this.story, actions);
    this.backdrop.appendChild(card);
    container.appendChild(this.backdrop);

    const hide = (): void => {
      this.hide();
    };
    this.unsubscribe = [
      // Arrives before `game-over` on the same move, so the account is current.
      bus.on('history-changed', ({ moves }) => {
        this.moves = moves;
      }),
      bus.on('game-over', ({ outcome }) => {
        this.show(outcome);
      }),
      bus.on('game-started', hide),
      // A take-back after mate puts the game back in play.
      bus.on('move-undone', hide),
    ];
  }

  public dispose(): void {
    for (const off of this.unsubscribe) off();
    this.backdrop.remove();
  }

  private show(outcome: GameOutcome): void {
    this.headline.textContent = outcomeHeadline(outcome);
    this.detail.textContent = outcomeDetail(outcome);

    const tracker = this.tracker;
    const lines = chronicle({
      outcome,
      moves: this.moves,
      placeOf: (square) => tracker.describe(square).cell?.name ?? null,
      kingSquareOf: (color) => tracker.kingSquare(color),
      pieceNameOf: (square) => tracker.describe(square).piece?.cell.name ?? null,
    });
    this.story.replaceChildren(
      ...lines.map((text) => {
        const el = document.createElement('div');
        el.textContent = text;
        return el;
      }),
    );

    this.backdrop.hidden = false;
  }

  private hide(): void {
    this.backdrop.hidden = true;
  }
}

function line(className: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = className;
  return el;
}

function button(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = className;
  el.textContent = label;
  el.addEventListener('click', onClick);
  return el;
}
