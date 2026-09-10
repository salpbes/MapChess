// WHAT: The buttons a game in progress needs: Menu, Pause, Hint, Take back,
//       Resign — Pause only when the computer is playing itself.
// HOW:  A row in the control dock. Enabled state is recomputed from the
//       callbacks the app supplies whenever anything the game publishes could
//       have changed the answer. Resign asks once — the flag turns red and the
//       word "Sure?" appears beside it for a few seconds, rather than opening
//       a dialog.
// WHY:  Resigning by mis-click is the one irreversible thing in the game, and
//       a blocking `confirm()` freezes the render loop. A button that changes
//       its mind is enough of a speed bump — and it is the one icon that grows
//       a word, because an icon alone cannot ask a question.

import type { GameBus } from '@game/GameEvents';

import { icon, iconButton } from './icons';

const CONFIRM_MS = 4000;
const BUTTON = 'controls__button';

/**
 * The menu is not a game action — it is where you are, not what you do — so it
 * sits in the dock's first row while the rest stay in the second.
 */
export interface GameControlsSlots {
  readonly menu: HTMLElement;
  readonly actions: HTMLElement;
}

export interface GameControlsDeps {
  readonly onMenu: () => void;
  readonly onTogglePause: () => void;
  /** Only watch mode can be paused; nothing else keeps a person waiting. */
  readonly canPause: () => boolean;
  readonly isPaused: () => boolean;
  readonly onHint: () => void;
  readonly onUndo: () => void;
  readonly onResign: () => void;
  readonly canHint: () => boolean;
  readonly canUndo: () => boolean;
  readonly canResign: () => boolean;
}

export class GameControls {
  private readonly root: HTMLDivElement;
  private readonly hint: HTMLButtonElement;
  private readonly undo: HTMLButtonElement;
  private readonly resign: HTMLButtonElement;
  private readonly confirmWord: HTMLSpanElement;
  private readonly menu: HTMLButtonElement;
  private readonly pause: HTMLButtonElement;
  private readonly unsubscribe: (() => void)[];
  private confirmTimer: ReturnType<typeof setTimeout> | null = null;
  private confirming = false;

  public constructor(
    slots: GameControlsSlots,
    bus: GameBus,
    private readonly deps: GameControlsDeps,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'controls';

    this.menu = iconButton('menu', 'Menu — new game, resume, change area', BUTTON, () => {
      this.cancelConfirm();
      deps.onMenu();
    });
    slots.menu.appendChild(this.menu);

    this.pause = iconButton('pause', 'Pause', BUTTON, () => {
      this.cancelConfirm();
      deps.onTogglePause();
      this.refresh();
    });

    this.hint = iconButton(
      'hint',
      'Hint — a move worth considering, always at full strength',
      BUTTON,
      () => {
        this.cancelConfirm();
        deps.onHint();
        this.refresh();
      },
    );

    this.undo = iconButton('undo', 'Take back your last move', BUTTON, () => {
      this.cancelConfirm();
      deps.onUndo();
      this.refresh();
    });

    this.resign = iconButton('flag', 'Resign', BUTTON, () => {
      if (!this.confirming) {
        this.armConfirm();
        return;
      }
      this.cancelConfirm();
      deps.onResign();
    });
    this.confirmWord = document.createElement('span');
    this.confirmWord.className = 'controls__confirm';
    this.confirmWord.textContent = 'Sure?';
    this.confirmWord.hidden = true;
    this.resign.appendChild(this.confirmWord);

    this.root.append(this.pause, this.hint, this.undo, this.resign);
    slots.actions.appendChild(this.root);

    const refresh = (): void => {
      this.refresh();
    };
    this.unsubscribe = [
      bus.on('game-started', refresh),
      bus.on('hint-thinking', refresh),
      bus.on('hint-offered', refresh),
      bus.on('hint-failed', refresh),
      bus.on('selection-changed', refresh),
      bus.on('history-changed', refresh),
      bus.on('status-changed', refresh),
      bus.on('ai-thinking', refresh),
      bus.on('game-over', refresh),
      bus.on('paused-changed', refresh),
    ];
    this.refresh();
  }

  public dispose(): void {
    for (const off of this.unsubscribe) off();
    if (this.confirmTimer !== null) clearTimeout(this.confirmTimer);
    this.menu.remove();
    this.root.remove();
  }

  private refresh(): void {
    // Watch mode has no resign and no take-back, so without this it has no
    // controls at all beyond the menu.
    const watching = this.deps.canPause();
    this.pause.hidden = !watching;
    if (watching) {
      const paused = this.deps.isPaused();
      this.pause.replaceChildren(icon(paused ? 'play' : 'pause'));
      const label = paused ? 'Let the game carry on' : 'Pause the game';
      this.pause.dataset.tip = label;
      this.pause.setAttribute('aria-label', label);
    }

    const waiting = this.deps.canHint();
    this.hint.disabled = !waiting;
    // Lit while the board is waiting on the player: the one button that is
    // worth noticing when you do not know what to do next.
    this.hint.classList.toggle('controls__button--waiting', waiting);
    this.undo.disabled = !this.deps.canUndo();
    this.resign.disabled = !this.deps.canResign();
    if (this.resign.disabled) this.cancelConfirm();
  }

  private armConfirm(): void {
    this.confirming = true;
    this.confirmWord.hidden = false;
    this.resign.dataset.tip = 'Press again to give up the game';
    this.resign.classList.add('controls__button--danger');
    if (this.confirmTimer !== null) clearTimeout(this.confirmTimer);
    this.confirmTimer = setTimeout(() => {
      this.cancelConfirm();
    }, CONFIRM_MS);
  }

  private cancelConfirm(): void {
    if (this.confirmTimer !== null) clearTimeout(this.confirmTimer);
    this.confirmTimer = null;
    this.confirming = false;
    this.confirmWord.hidden = true;
    this.resign.dataset.tip = 'Resign';
    this.resign.classList.remove('controls__button--danger');
  }
}
