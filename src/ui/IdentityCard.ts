// WHAT: The reveal: a card naming the selected piece and the ground it stands on.
// HOW:  Listens to `selection-changed`; asks ThemeTracker what is on the
//       square; renders piece glyph + name + reason, and the cell's name +
//       ground. Hides when nothing is selected. No three.js.
// WHY:  BUILD_PLAN Phase 10 — "show the naming when a piece is selected; that
//       reveal is the game's best moment".

import type { Color, PieceType } from '@domain/chess/types';
import type { GameBus } from '@game/GameEvents';
import type { ThemeTracker } from '@game/ThemeTracker';

const GLYPH: Readonly<Record<Color, Readonly<Record<PieceType, string>>>> = {
  white: { king: '♔', queen: '♕', rook: '♖', bishop: '♗', knight: '♘', pawn: '♙' },
  black: { king: '♚', queen: '♛', rook: '♜', bishop: '♝', knight: '♞', pawn: '♟' },
};

export class IdentityCard {
  private readonly el: HTMLDivElement;
  private readonly unsubscribe: () => void;

  public constructor(container: HTMLElement, bus: GameBus, tracker: ThemeTracker) {
    this.el = document.createElement('div');
    this.el.className = 'identity-card';
    this.el.hidden = true;
    container.appendChild(this.el);

    this.unsubscribe = bus.on('selection-changed', ({ square }) => {
      if (square === null) {
        this.el.hidden = true;
        return;
      }
      const story = tracker.describe(square);
      this.el.replaceChildren();

      if (story.piece !== null) {
        const p = story.piece;
        const head = document.createElement('div');
        head.className = 'identity-card__piece';
        head.textContent = `${GLYPH[p.color][p.currentType]} ${p.cell.name}`;
        const sub = document.createElement('div');
        sub.className = 'identity-card__reason';
        const role = p.currentType === p.type ? p.type : `${p.currentType}, once a ${p.type}`;
        sub.textContent = `${p.color === 'white' ? 'White' : 'Black'}'s ${role} — ${p.reason}`;
        this.el.append(head, sub);
      }

      if (story.cell !== null) {
        const where = document.createElement('div');
        where.className = 'identity-card__cell';
        where.textContent = `${story.piece === null ? '' : 'Standing on '}${story.cell.name}`;
        const ground = document.createElement('div');
        ground.className = 'identity-card__ground';
        ground.textContent = `${square} · ${story.cell.ground}`;
        this.el.append(where, ground);
      }

      this.el.hidden = this.el.childElementCount === 0;
    });
  }

  public dispose(): void {
    this.unsubscribe();
    this.el.remove();
  }
}
