// WHAT: The reveal: names the selected piece and the ground it stands on.
// HOW:  Listens to `selection-changed`; asks ThemeTracker what is on the
//       square. Three display modes, remembered in localStorage:
//         hidden  — only a small ⓘ button in the corner
//         full    — name, the piece's reason, and the cell's ground (default)
//         compact — one line: glyph, name, square
//       ⓘ toggles hidden/compact; clicking the line toggles compact/full.
// WHY:  BUILD_PLAN Phase 10 — the reveal is the game's best moment, but it
//       must never get in the way of the board. It used to float in the corner
//       with a button to dismiss it; sharing the gazetteer's sheet puts the
//       piece's story next to the story of the ground it stands on, and leaves
//       nothing over the board to dismiss.

import type { Color, PieceType } from '@domain/chess/types';
import type { GameBus } from '@game/GameEvents';
import type { SquareStory, ThemeTracker } from '@game/ThemeTracker';

const GLYPH: Readonly<Record<Color, Readonly<Record<PieceType, string>>>> = {
  white: { king: '♔', queen: '♕', rook: '♖', bishop: '♗', knight: '♘', pawn: '♙' },
  black: { king: '♚', queen: '♛', rook: '♜', bishop: '♝', knight: '♞', pawn: '♟' },
};

/**
 * Hiding was how the card got out of the way when it floated over the board.
 * It lives on the briefing paper now, so there is nothing left to get out of
 * the way of: one line by default, the whole story on a click.
 */
type Mode = 'compact' | 'full';
/** Bumped when 'hidden' went away, so a stored preference cannot outlive it. */
const STORAGE_KEY = 'mapchess.identityCard.v2';

export class IdentityCard {
  private readonly root: HTMLDivElement;
  private readonly card: HTMLButtonElement;
  private readonly unsubscribe: () => void;
  private mode: Mode;
  private story: SquareStory | null = null;

  public constructor(container: HTMLElement, bus: GameBus, tracker: ThemeTracker) {
    this.mode = readMode();

    this.root = document.createElement('div');
    this.root.className = 'identity';

    this.card = document.createElement('button');
    this.card.type = 'button';
    this.card.className = 'identity__card';
    this.card.title = 'Click for details';
    this.card.addEventListener('click', () => {
      this.setMode(this.mode === 'full' ? 'compact' : 'full');
    });

    this.root.appendChild(this.card);
    container.appendChild(this.root);

    this.unsubscribe = bus.on('selection-changed', ({ square }) => {
      this.story = square === null ? null : tracker.describe(square);
      this.render();
    });
    this.render();
  }

  public dispose(): void {
    this.unsubscribe();
    this.root.remove();
  }

  private setMode(mode: Mode): void {
    this.mode = mode;
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch (error: unknown) {
      console.warn('Could not remember identity card preference.', error);
    }
    this.render();
  }

  private render(): void {
    const s = this.story;
    if (s === null || (s.piece === null && s.cell === null)) {
      this.card.hidden = true;
      this.root.hidden = true;
      return;
    }
    this.root.hidden = false;
    this.card.hidden = false;
    this.card.classList.toggle('identity__card--full', this.mode === 'full');
    this.card.replaceChildren();

    const line = document.createElement('div');
    line.className = 'identity__line';
    if (s.piece !== null) {
      line.textContent = `${GLYPH[s.piece.color][s.piece.currentType]} ${s.piece.cell.name} · ${s.square}`;
    } else if (s.cell !== null) {
      line.textContent = `${s.cell.name} · ${s.square}`;
    }
    this.card.appendChild(line);

    if (this.mode !== 'full') return;
    if (s.piece !== null) {
      const p = s.piece;
      const role = p.currentType === p.type ? p.type : `${p.currentType}, once a ${p.type}`;
      this.card.appendChild(
        detail(
          'identity__reason',
          `${p.color === 'white' ? 'White' : 'Black'}'s ${role} — ${p.reason}`,
        ),
      );
    }
    if (s.cell !== null) {
      if (s.piece !== null)
        this.card.appendChild(detail('identity__cell', `Standing on ${s.cell.name}`));
      this.card.appendChild(detail('identity__ground', s.cell.ground));
    }
  }
}

function detail(className: string, text: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = className;
  el.textContent = text;
  return el;
}

function readMode(): Mode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    // 'hidden' is a setting from before the card moved onto the paper.
    if (v === 'compact' || v === 'full') return v;
  } catch (error: unknown) {
    console.warn('Could not read identity card preference.', error);
  }
  // The whole story by default: it is the point of the game, and on the paper
  // there is room for it.
  return 'full';
}
