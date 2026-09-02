// WHAT: The reveal: names the selected piece and the ground it stands on.
// HOW:  Listens to `selection-changed`; asks ThemeTracker what is on the
//       square. Three display modes, remembered in localStorage:
//         hidden  — only a small ⓘ button in the corner
//         compact — one line: glyph, name, square (default)
//         full    — adds the piece's reason and the cell's ground
//       ⓘ toggles hidden/compact; clicking the line toggles compact/full.
// WHY:  BUILD_PLAN Phase 10 — the reveal is the game's best moment, but it
//       must never get in the way of the board. Small by default, gone on
//       request, detail on demand.

import type { Color, PieceType } from '@domain/chess/types';
import type { GameBus } from '@game/GameEvents';
import type { SquareStory, ThemeTracker } from '@game/ThemeTracker';

const GLYPH: Readonly<Record<Color, Readonly<Record<PieceType, string>>>> = {
  white: { king: '♔', queen: '♕', rook: '♖', bishop: '♗', knight: '♘', pawn: '♙' },
  black: { king: '♚', queen: '♛', rook: '♜', bishop: '♝', knight: '♞', pawn: '♟' },
};

type Mode = 'hidden' | 'compact' | 'full';
const STORAGE_KEY = 'mapchess.identityCard';

export class IdentityCard {
  private readonly root: HTMLDivElement;
  private readonly toggle: HTMLButtonElement;
  private readonly card: HTMLButtonElement;
  private readonly unsubscribe: () => void;
  private mode: Mode;
  private story: SquareStory | null = null;

  public constructor(container: HTMLElement, bus: GameBus, tracker: ThemeTracker) {
    this.mode = readMode();

    this.root = document.createElement('div');
    this.root.className = 'identity';

    this.toggle = document.createElement('button');
    this.toggle.type = 'button';
    this.toggle.className = 'identity__toggle';
    this.toggle.title = 'Show or hide piece names';
    this.toggle.setAttribute('aria-label', 'Show or hide piece names');
    this.toggle.textContent = 'ⓘ';
    this.toggle.addEventListener('click', () => {
      this.setMode(this.mode === 'hidden' ? 'compact' : 'hidden');
    });

    this.card = document.createElement('button');
    this.card.type = 'button';
    this.card.className = 'identity__card';
    this.card.title = 'Click for details';
    this.card.addEventListener('click', () => {
      this.setMode(this.mode === 'full' ? 'compact' : 'full');
    });

    this.root.append(this.toggle, this.card);
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
    this.toggle.classList.toggle('identity__toggle--off', this.mode === 'hidden');
    const s = this.story;
    if (this.mode === 'hidden' || s === null || (s.piece === null && s.cell === null)) {
      this.card.hidden = true;
      return;
    }
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
    if (v === 'hidden' || v === 'compact' || v === 'full') return v;
  } catch (error: unknown) {
    console.warn('Could not read identity card preference.', error);
  }
  return 'compact';
}
