// WHAT: The game so far in algebraic notation, one numbered row per full move.
// HOW:  Renders an <ol> into a parent element the caller owns, re-built from
//       the whole history on every change and scrolled to the newest row. Each
//       move carries a tooltip naming the cell it landed on.
// WHY:  Rebuilding beats patching: undo, resume and a fresh game all arrive as
//       "here is the history now", and 100-odd rows cost nothing to rewrite.
//       The tooltips are why the notation is worth reading here rather than in
//       any other chess program — "Nf3" happened somewhere real.

import type { Move } from '@domain/chess/types';

/** Given a destination square, the name of the ground there — null before the theme exists. */
export type CellNamer = (move: Move) => string | null;

export class MoveList {
  private readonly list: HTMLOListElement;

  public constructor(
    parent: HTMLElement,
    private readonly nameOf: CellNamer,
  ) {
    this.list = document.createElement('ol');
    this.list.className = 'movelist';
    parent.appendChild(this.list);
  }

  public show(moves: readonly Move[]): void {
    this.list.replaceChildren();
    for (let i = 0; i < moves.length; i += 2) {
      const white = moves[i];
      const black = moves[i + 1];
      if (white === undefined) break;
      const row = document.createElement('li');
      row.className = 'movelist__row';
      row.append(number(i / 2 + 1), this.ply(white));
      if (black !== undefined) row.appendChild(this.ply(black));
      this.list.appendChild(row);
    }
    this.list.scrollTop = this.list.scrollHeight;
  }

  private ply(move: Move): HTMLSpanElement {
    const el = document.createElement('span');
    el.className = 'movelist__ply';
    el.textContent = move.san;
    const place = this.nameOf(move);
    el.title = place === null ? `${move.san} (${move.from}→${move.to})` : `${move.san} — ${place}`;
    return el;
  }
}

function number(n: number): HTMLSpanElement {
  const el = document.createElement('span');
  el.className = 'movelist__no';
  el.textContent = `${String(n)}.`;
  return el;
}
