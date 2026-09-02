// WHAT: A four-button overlay asking which piece a pawn promotes to.
// HOW:  Implements IPromotionChooser. Builds the buttons on demand, resolves
//       the promise on click, resolves null on Escape or a click outside.
// WHY:  Auto-queening is wrong chess. This is the smallest correct UI; the
//       Phase 11 game shell can restyle it without touching the game loop.

import type { Color, PromotionPiece } from '@domain/chess/types';
import type { IPromotionChooser } from '@game/IPromotionChooser';

const CHOICES: readonly { piece: PromotionPiece; label: string }[] = [
  { piece: 'queen', label: 'Queen' },
  { piece: 'rook', label: 'Rook' },
  { piece: 'bishop', label: 'Bishop' },
  { piece: 'knight', label: 'Knight' },
];

export class PromotionPrompt implements IPromotionChooser {
  public constructor(private readonly container: HTMLElement) {}

  public choose(color: Color): Promise<PromotionPiece | null> {
    return new Promise((resolve) => {
      const backdrop = document.createElement('div');
      backdrop.className = 'promotion-backdrop';

      const panel = document.createElement('div');
      panel.className = `promotion-panel promotion-${color}`;
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-label', 'Choose promotion piece');

      const finish = (choice: PromotionPiece | null): void => {
        document.removeEventListener('keydown', onKey);
        backdrop.remove();
        resolve(choice);
      };
      const onKey = (e: KeyboardEvent): void => {
        if (e.key === 'Escape') finish(null);
      };

      for (const { piece, label } of CHOICES) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        button.addEventListener('click', () => {
          finish(piece);
        });
        panel.appendChild(button);
      }

      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) finish(null);
      });
      document.addEventListener('keydown', onKey);

      backdrop.appendChild(panel);
      this.container.appendChild(backdrop);
      panel.querySelector('button')?.focus();
    });
  }
}
