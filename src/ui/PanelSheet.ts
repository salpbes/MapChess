// WHAT: The drawer the panels live in on a narrow screen, and the bar that is
//       always on top of the board: menu, tips, and the two tabs.
// HOW:  Wraps the existing panels in two slots — the briefing in one, the left
//       column in the other — and keeps `open` and `tab` on its own element
//       for the stylesheet to read. Above the breakpoint every box here is
//       `display: contents`, so the panels position themselves against #ui
//       exactly as they always have and the desktop layout is untouched.
// WHY:  BUILD_PLAN §13.3. Two fixed 230px columns cover a 390px board, and the
//       board is the subject — the gazetteer is something you ask for. The
//       panels were written against a fixed column, so this moves where they
//       sit and nothing about what they contain; that is the difference
//       between a breakpoint and a rewrite, and the phase is worth less than
//       the panels working.
//
//       Menu and tips sit in the bar rather than the drawer because both have
//       to be reachable while the drawer is shut: one is the way out of the
//       game, and the other is the reason a beginner can play it at all.

import { iconButton } from './icons';
import type { IconName } from './icons';

export type SheetTab = 'field' | 'game';

export interface PanelSheetDeps {
  readonly onMenu: () => void;
  /** The same hint the dock's own button asks for, at full engine strength. */
  readonly onTips: () => void;
  /** Take back the last move — too common to be worth opening a drawer for. */
  readonly onUndo: () => void;
  /** Straight down at the whole board. */
  readonly onTopDown: () => void;
  /** Called whenever a tab is opened, so its panel can unfold itself. */
  readonly onShow?: (tab: SheetTab) => void;
}

export class PanelSheet {
  private readonly root: HTMLDivElement;
  /** The gazetteer entry for the place being fought over. */
  public readonly fieldSlot: HTMLDivElement;
  /** The controls, the coaching note and the move record. */
  public readonly gameSlot: HTMLDivElement;

  private readonly tabs: Readonly<Record<SheetTab, HTMLButtonElement>>;
  private readonly peek: HTMLDivElement;
  private open = false;
  private tab: SheetTab = 'game';

  public constructor(
    container: HTMLElement,
    private readonly deps: PanelSheetDeps,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'sheet';

    const chrome = document.createElement('div');
    chrome.className = 'sheet__chrome';

    // A grab bar reads as "this pulls up" in a way a chevron does not, and it
    // doubles as the dismiss target once the drawer is open.
    const handle = document.createElement('button');
    handle.type = 'button';
    handle.className = 'sheet__handle';
    handle.setAttribute('aria-label', 'Show or hide the notes');
    handle.appendChild(span('sheet__grip'));
    handle.addEventListener('click', () => {
      this.setOpen(!this.open);
    });

    const bar = document.createElement('div');
    bar.className = 'sheet__bar';

    const menu = iconButton('menu', 'Menu — new game, resume, change area', 'sheet__button', () => {
      deps.onMenu();
    });

    /*
      Tips keeps the accent rather than a word: six controls only fit across a
      phone as icons, and a label on one of them would set the width for all
      six. It is the only coloured button in the bar, which is now what makes
      it the one you find first.
    */
    const tips = iconButton(
      'hint',
      'Tips — a move worth considering, and why',
      'sheet__button sheet__button--tips',
      () => {
        deps.onTips();
      },
    );

    const undo = iconButton('undo', 'Take back your last move', 'sheet__button', () => {
      deps.onUndo();
    });

    const topDown = iconButton(
      'topDown',
      'Look straight down at the board',
      'sheet__button',
      () => {
        deps.onTopDown();
      },
    );

    this.tabs = {
      field: this.tabButton('field', 'map', 'The field — what this place is'),
      game: this.tabButton('game', 'book', 'The game — moves, coaching and controls'),
    };

    /*
      The identity card itself lives on the briefing's paper, which is behind a
      tab down here. Phase 10 called this reveal the game's best moment, and a
      moment you have to go and look for is not one — so the bar carries the
      line while the drawer is shut.
    */
    this.peek = document.createElement('div');
    this.peek.className = 'sheet__peek';
    this.peek.hidden = true;

    bar.append(menu, tips, undo, topDown, this.tabs.field, this.tabs.game);
    chrome.append(handle, this.peek, bar);

    const body = document.createElement('div');
    body.className = 'sheet__body';
    this.fieldSlot = slot('sheet__slot sheet__slot--field');
    this.gameSlot = slot('sheet__slot sheet__slot--game');
    body.append(this.fieldSlot, this.gameSlot);

    this.root.append(chrome, body);
    container.appendChild(this.root);

    this.refresh();
  }

  /** Names what is standing on the selected square; null clears the line. */
  public setPeek(line: string | null): void {
    this.peek.textContent = line ?? '';
    this.peek.hidden = line === null;
  }

  /** Opens the drawer on a given tab; used by anything that wants to be read. */
  public show(tab: SheetTab): void {
    this.tab = tab;
    this.setOpen(true);
  }

  public dispose(): void {
    this.root.remove();
  }

  private tabButton(tab: SheetTab, glyph: IconName, label: string): HTMLButtonElement {
    const button = iconButton(glyph, label, 'sheet__button sheet__tab', () => {
      // Tapping the tab you are already reading puts the board back.
      if (this.open && this.tab === tab) {
        this.setOpen(false);
        return;
      }
      this.tab = tab;
      this.setOpen(true);
    });
    return button;
  }

  private setOpen(open: boolean): void {
    this.open = open;
    this.refresh();
    if (open) this.deps.onShow?.(this.tab);
  }

  private refresh(): void {
    this.root.dataset.open = this.open ? 'open' : 'closed';
    this.root.dataset.tab = this.tab;
    for (const [name, button] of Object.entries(this.tabs)) {
      const active = this.open && name === this.tab;
      button.classList.toggle('sheet__tab--on', active);
      button.setAttribute('aria-expanded', active ? 'true' : 'false');
    }
  }
}

function slot(className: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = className;
  return el;
}

function span(className: string): HTMLSpanElement {
  const el = document.createElement('span');
  el.className = className;
  return el;
}
