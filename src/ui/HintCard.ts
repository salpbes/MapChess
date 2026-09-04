// WHAT: The advice itself, shown large: which piece, where to, and why.
// HOW:  A card in the left-hand column — under the move record, and clear of
//       the board — carrying the piece's glyph and a short headline on one
//       line, then the reason, then the instruction in plain words with the
//       notation beside it. Stays until the move is played, taken back, or
//       dismissed — never on a timer.
// WHY:  The first version of this was a five-second flash in the status bar
//       reading "Try Nf3 — g1 to f3". That helps a player who already reads
//       notation and already knows why they would play it, which is nobody who
//       needs a hint. A child needs the piece named, the reason in words, and
//       long enough to look from the card to the board and back. It sat over
//       the bottom of the board at first, which put it exactly on top of the
//       player's own back rank — the pieces the advice is about.

import type { Color, PieceType } from '@domain/chess/types';
import type { MoveAdvice } from '@game/explainMove';
import type { GameBus } from '@game/GameEvents';
import type { ThemeTracker } from '@game/ThemeTracker';

const GLYPH: Readonly<Record<Color, Readonly<Record<PieceType, string>>>> = {
  white: { king: '♔', queen: '♕', rook: '♖', bishop: '♗', knight: '♘', pawn: '♙' },
  black: { king: '♚', queen: '♛', rook: '♜', bishop: '♝', knight: '♞', pawn: '♟' },
};

export class HintCard {
  private readonly root: HTMLDivElement;
  private readonly glyph: HTMLSpanElement;
  private readonly headline: HTMLDivElement;
  private readonly reason: HTMLDivElement;
  private readonly instruction: HTMLDivElement;
  private readonly notation: HTMLSpanElement;
  private readonly place: HTMLDivElement;
  private readonly unsubscribe: (() => void)[];

  public constructor(container: HTMLElement, bus: GameBus, tracker: ThemeTracker) {
    this.root = document.createElement('div');
    this.root.className = 'hint';
    this.root.hidden = true;
    this.root.setAttribute('role', 'status');

    this.glyph = document.createElement('span');
    this.glyph.className = 'hint__glyph';

    const body = document.createElement('div');
    body.className = 'hint__body';
    // Glyph and headline share a line: vertical space is the scarce thing in a
    // 210px column, not horizontal.
    const header = document.createElement('div');
    header.className = 'hint__header';
    this.headline = line('hint__headline');
    header.append(this.glyph, this.headline);
    this.reason = line('hint__reason');
    this.instruction = line('hint__instruction');
    this.notation = document.createElement('span');
    this.notation.className = 'hint__notation';
    this.instruction.appendChild(this.notation);
    this.place = line('hint__place');
    body.append(header, this.reason, this.instruction, this.place);

    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'hint__dismiss';
    dismiss.textContent = '×';
    dismiss.title = 'Hide this hint';
    dismiss.setAttribute('aria-label', 'Hide this hint');
    dismiss.addEventListener('click', () => {
      this.hide();
    });

    this.root.append(body, dismiss);
    container.appendChild(this.root);

    const hide = (): void => {
      this.hide();
    };
    this.unsubscribe = [
      bus.on('hint-offered', ({ move, advice }) => {
        this.show(move.color, move.piece, advice, tracker.describe(move.to).cell?.name ?? null);
      }),
      // The advice belongs to one position; any change to the board ends it.
      bus.on('move-played', hide),
      bus.on('move-undone', hide),
      bus.on('game-started', hide),
    ];
  }

  public dispose(): void {
    for (const off of this.unsubscribe) off();
    this.root.remove();
  }

  private show(color: Color, piece: PieceType, advice: MoveAdvice, cellName: string | null): void {
    this.glyph.textContent = GLYPH[color][piece];
    this.headline.textContent = advice.headline;
    this.reason.textContent = advice.reason;
    this.instruction.replaceChildren(document.createTextNode(`${advice.instruction} `));
    this.notation.textContent = advice.notation;
    this.notation.title = 'How chess players write this move';
    this.instruction.appendChild(this.notation);
    this.place.hidden = cellName === null;
    if (cellName !== null) this.place.textContent = `That square is ${cellName}.`;
    this.root.hidden = false;
  }

  private hide(): void {
    this.root.hidden = true;
  }
}

function line(className: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = className;
  return el;
}
