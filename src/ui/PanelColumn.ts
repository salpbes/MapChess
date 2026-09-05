// WHAT: The left-hand stack: a column down one edge of the screen that the
//       panels sit in, one under the other.
// HOW:  An absolutely positioned flex column. Callers mount into `element` and
//       the order they mount in is the order down the screen; a panel that
//       wants the leftover height asks for it with `flex: 1`.
// WHY:  Three panels down one edge were three absolute positions that had to
//       agree with each other, and every time one changed height the other two
//       were retuned by hand — the move record's offset was being juggled by
//       `:has()` rules against the briefing and the hint card. A column does
//       that arithmetic itself. It passes the pointer through, so the strip of
//       board behind an empty column stays clickable.

export class PanelColumn {
  public readonly element: HTMLDivElement;

  public constructor(container: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'column';
    container.appendChild(this.element);
  }

  public dispose(): void {
    this.element.remove();
  }
}
