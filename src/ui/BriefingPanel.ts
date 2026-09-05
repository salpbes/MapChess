// WHAT: The paper in the right-hand column: the gazetteer entry for the board,
//       with whatever square is selected printed underneath it.
// HOW:  A title bar that collapses the whole thing to one line, over a list of
//       labelled facts and a closing remark. Open or shut is remembered in
//       localStorage — shut to start with, since the entry is read once a board
//       while the selection under it changes every move. `selectionSlot` is
//       where IdentityCard mounts, so the
//       reveal and the gazetteer share one sheet instead of being two overlays
//       stacked down the same edge. It sits opposite the move record: reading
//       about the place and following the game are different activities and
//       should not share a column.
// WHY:  A player is dropped onto a real square of the world and told only its
//       name. This is where the rest of it goes — folded shut by default,
//       because it is worth reading once a board and in the way for the rest
//       of the game, while the selection beneath it is wanted every move.

import type { Briefing } from '@mapdata/board/buildBriefing';

/** Bumped alongside each change of default, so the new one actually lands. */
const STORAGE_KEY = 'mapchess.briefingOpen.v3';

export class BriefingPanel {
  private readonly root: HTMLDivElement;
  private readonly toggle: HTMLButtonElement;
  private readonly caret: HTMLSpanElement;
  private readonly heading: HTMLSpanElement;
  private readonly body: HTMLDivElement;
  private readonly selection: HTMLDivElement;
  private readonly coordinates: HTMLDivElement;
  private open: boolean;
  private gazetteer = false;

  public constructor(container: HTMLElement) {
    this.open = readSetting();

    this.root = document.createElement('div');
    this.root.className = 'briefing';

    // Below the entry: what the player just clicked on. Owned by whoever
    // mounts into it — this panel only lends it the paper. Kept at the foot of
    // the sheet so the gazetteer keeps its place while selections come and go.
    this.selection = document.createElement('div');
    this.selection.className = 'briefing__selection';

    this.caret = document.createElement('span');
    this.caret.className = 'briefing__caret';
    this.caret.setAttribute('aria-hidden', 'true');
    this.heading = document.createElement('span');
    this.heading.className = 'briefing__heading';

    this.toggle = document.createElement('button');
    this.toggle.type = 'button';
    this.toggle.className = 'briefing__toggle';
    this.toggle.append(this.caret, this.heading);
    this.toggle.addEventListener('click', () => {
      this.setOpen(!this.open);
    });

    this.body = document.createElement('div');
    this.body.className = 'briefing__body';

    // Under the heading and outside the fold: the coordinates belong with the
    // name of the place, not with the buttons that change it.
    this.coordinates = document.createElement('div');
    this.coordinates.className = 'briefing__coordinates';

    this.root.append(this.toggle, this.coordinates, this.body, this.selection);
    container.appendChild(this.root);
    this.render();
  }

  /** Where the area's centre, size and rotation are printed. */
  public get coordinateSlot(): HTMLElement {
    return this.coordinates;
  }

  /** Where the selected square's story is drawn, at the foot of the sheet. */
  public get selectionSlot(): HTMLElement {
    return this.selection;
  }

  /** Null while the board has no features yet — the gazetteer half stays empty. */
  public show(briefing: Briefing | null): void {
    this.gazetteer = briefing !== null;
    if (briefing === null) {
      this.render();
      return;
    }

    this.heading.textContent = briefing.title;
    this.body.replaceChildren(
      ...briefing.lines.map((line) => {
        const row = document.createElement('div');
        row.className = 'briefing__line';
        const label = document.createElement('span');
        label.className = 'briefing__label';
        label.textContent = line.label;
        const text = document.createElement('span');
        text.textContent = line.text;
        row.append(label, text);
        return row;
      }),
      remark(briefing.remark),
    );
    this.render();
  }

  public dispose(): void {
    this.root.remove();
  }

  private setOpen(open: boolean): void {
    this.open = open;
    try {
      localStorage.setItem(STORAGE_KEY, open ? 'open' : 'shut');
    } catch (error: unknown) {
      console.warn('Could not remember whether the briefing was open.', error);
    }
    this.render();
  }

  private render(): void {
    // The sheet itself stays while a selection is showing, even on a board
    // whose features never arrived.
    this.toggle.hidden = !this.gazetteer;
    this.root.classList.toggle('briefing--open', this.open && this.gazetteer);
    this.body.hidden = !this.open || !this.gazetteer;
    this.caret.textContent = this.open ? '▾' : '▸';
    this.toggle.title = this.open ? 'Hide what is known about this place' : 'What is this place?';
    this.toggle.setAttribute('aria-expanded', this.open ? 'true' : 'false');
  }
}

function remark(text: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'briefing__remark';
  el.textContent = text;
  return el;
}

function readSetting(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'open';
  } catch (error: unknown) {
    console.warn('Could not read the briefing setting.', error);
    return false;
  }
}
