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

import type { Assessment } from '@game/assessment';

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
  /** How the game stands, while the drawer is shut. */
  private readonly standing: HTMLDivElement;
  private readonly standingFill: HTMLDivElement;
  private readonly standingText: HTMLDivElement;
  private readonly tips: HTMLButtonElement;
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
    this.tips = iconButton(
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
      field: this.tabButton('field', 'terrain', 'The field — what this place is'),
      game: this.tabButton('game', 'pawn', 'The game — moves, coaching and controls'),
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

    /*
      How it stands, in one line on the board.

      The card this mirrors lives in the drawer, behind a tab, which on a phone
      means the answer to "am I winning" costs a tap and covers the board you
      wanted to look at. The bar is a quicker read than the sentence and needs
      no reading at all, so it comes first and the words follow it.

      Shown on the same terms as the card, which is to say unless the player has
      turned it off. It waits for the first assessment to arrive, so it appears
      a move-search late rather than empty.
    */
    this.standing = document.createElement('div');
    this.standing.className = 'sheet__standing';
    this.standing.hidden = true;
    const standingBar = document.createElement('div');
    standingBar.className = 'sheet__standing-bar';
    this.standingFill = document.createElement('div');
    this.standingFill.className = 'sheet__standing-fill';
    standingBar.appendChild(this.standingFill);
    this.standingText = document.createElement('div');
    this.standingText.className = 'sheet__standing-text';
    this.standing.append(standingBar, this.standingText);

    bar.append(menu, this.tips, undo, topDown, this.tabs.field, this.tabs.game);
    chrome.append(handle, this.standing, this.peek, bar);

    const body = document.createElement('div');
    body.className = 'sheet__body';
    this.fieldSlot = slot('sheet__slot sheet__slot--field');
    this.gameSlot = slot('sheet__slot sheet__slot--game');
    body.append(this.fieldSlot, this.gameSlot);

    this.root.append(chrome, body);
    container.appendChild(this.root);

    this.refresh();
  }

  /**
   * Breathes the Tips button while there is advice to be had.
   *
   * It is the one control here a player is looking FOR rather than at, and a
   * still button on a busy board is easy to miss — the dock's hint button has
   * pulsed since Phase 11 for exactly that reason, and below the breakpoint
   * that button is inside the drawer where nobody sees it.
   */
  public setTipsWaiting(waiting: boolean): void {
    this.tips.classList.toggle('sheet__button--waiting', waiting);
  }

  /** Names what is standing on the selected square; null clears the line. */
  public setPeek(line: string | null): void {
    this.peek.textContent = line ?? '';
    this.peek.hidden = line === null;
  }

  /**
   * Shows how the game stands on the board itself; null hides the line.
   *
   * The drawer reserves a fixed strip of the board (`--sheet-bar`), and
   * anything anchored to the bottom — the map credits, most visibly — clears
   * exactly that. So the reserve has to grow by this line's height while it is
   * shown and shrink back when it is not, which is what the attribute does. A
   * fixed reserve would either crop the board for players who never turn this
   * on, or let the drawer's paper cover the ODbL credit again.
   */
  public setStanding(assessment: Assessment | null): void {
    this.standing.hidden = assessment === null;
    document.documentElement.dataset.standing = assessment === null ? 'off' : 'on';
    if (assessment === null) return;

    this.standingFill.style.width = `${String(Math.round(assessment.whiteShare * 100))}%`;
    this.standingText.textContent = `${assessment.verdict} · ${assessment.number}`;
    this.standing.setAttribute('aria-label', `${assessment.verdict}, ${assessment.number}`);
  }

  /** Opens the drawer on a given tab; used by anything that wants to be read. */
  public show(tab: SheetTab): void {
    this.tab = tab;
    this.setOpen(true);
  }

  /**
   * Shuts the drawer, for anything that has just changed the board and wants
   * the player to see it. On a phone the list of places lives in here, so
   * choosing one left the drawer covering the very ground they had chosen.
   */
  public close(): void {
    this.setOpen(false);
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
