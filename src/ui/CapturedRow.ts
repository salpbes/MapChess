// WHAT: The two piles of taken pieces and who is ahead on material.
// HOW:  Renders two rows of glyphs into a parent the caller owns — the pieces
//       White has taken, then the pieces Black has taken — with the pawn-unit
//       advantage shown against whichever side holds it.
// WHY:  A glance has to answer "am I winning material?". Glyphs answer it
//       faster than a list of words, and the number settles the argument when
//       the piles look similar.

import type { Color, PieceType } from '@domain/chess/types';
import type { CaptureSummary } from '@game/captures';

/** The captured piece is drawn in the colour it belonged to. */
const GLYPH: Readonly<Record<Color, Readonly<Record<PieceType, string>>>> = {
  white: { king: '♔', queen: '♕', rook: '♖', bishop: '♗', knight: '♘', pawn: '♙' },
  black: { king: '♚', queen: '♛', rook: '♜', bishop: '♝', knight: '♞', pawn: '♟' },
};

export class CapturedRow {
  private readonly root: HTMLDivElement;
  private readonly rows: Readonly<Record<Color, HTMLDivElement>>;

  public constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'captured';
    this.rows = { white: row('White'), black: row('Black') };
    this.root.append(this.rows.white, this.rows.black);
    parent.appendChild(this.root);
  }

  public show(summary: CaptureSummary): void {
    // White's row shows the black pieces White has taken, and vice versa.
    this.fill('white', summary.byWhite, summary.balance);
    this.fill('black', summary.byBlack, -summary.balance);
  }

  private fill(taker: Color, taken: readonly PieceType[], advantage: number): void {
    const opposite: Color = taker === 'white' ? 'black' : 'white';
    const row = this.rows[taker];
    row.replaceChildren();

    const glyphs = document.createElement('span');
    glyphs.className = 'captured__glyphs';
    glyphs.textContent = taken.map((t) => GLYPH[opposite][t]).join('');
    row.appendChild(glyphs);

    if (advantage > 0) {
      const lead = document.createElement('span');
      lead.className = 'captured__lead';
      lead.textContent = `+${String(advantage)}`;
      lead.title = `${taker === 'white' ? 'White' : 'Black'} is ${String(advantage)} pawns ahead`;
      row.appendChild(lead);
    }
  }
}

function row(label: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'captured__row';
  el.title = `Pieces ${label} has taken`;
  return el;
}
