// WHAT: The buttons a game in progress needs: Menu, Hint, Take back, Resign.
// HOW:  A bar in the bottom-left corner. Enabled state is recomputed from the
//       callbacks the app supplies whenever anything the game publishes could
//       have changed the answer. Resign asks once — the button becomes
//       "Really resign?" for a few seconds rather than opening a dialog.
// WHY:  Resigning by mis-click is the one irreversible thing in the game, and
//       a blocking `confirm()` freezes the render loop. A button that changes
//       its mind is enough of a speed bump.

import type { GameBus } from '@game/GameEvents';

const CONFIRM_MS = 4000;

export interface GameControlsDeps {
  readonly onMenu: () => void;
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
  private readonly unsubscribe: (() => void)[];
  private confirmTimer: ReturnType<typeof setTimeout> | null = null;
  private confirming = false;

  public constructor(
    container: HTMLElement,
    bus: GameBus,
    private readonly deps: GameControlsDeps,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'controls';

    const menu = button('Menu', () => {
      this.cancelConfirm();
      deps.onMenu();
    });
    menu.title = 'New game, resume, change area';

    this.hint = button('Hint', () => {
      this.cancelConfirm();
      deps.onHint();
      this.refresh();
    });
    this.hint.title = 'Show a move worth considering — always at full strength';

    this.undo = button('Take back', () => {
      this.cancelConfirm();
      deps.onUndo();
      this.refresh();
    });
    this.undo.title = 'Take back your last move';

    this.resign = button('Resign', () => {
      if (!this.confirming) {
        this.armConfirm();
        return;
      }
      this.cancelConfirm();
      deps.onResign();
    });

    this.root.append(menu, this.hint, this.undo, this.resign);
    container.appendChild(this.root);

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
    ];
    this.refresh();
  }

  public dispose(): void {
    for (const off of this.unsubscribe) off();
    if (this.confirmTimer !== null) clearTimeout(this.confirmTimer);
    this.root.remove();
  }

  private refresh(): void {
    this.hint.disabled = !this.deps.canHint();
    this.undo.disabled = !this.deps.canUndo();
    this.resign.disabled = !this.deps.canResign();
    if (this.resign.disabled) this.cancelConfirm();
  }

  private armConfirm(): void {
    this.confirming = true;
    this.resign.textContent = 'Really resign?';
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
    this.resign.textContent = 'Resign';
    this.resign.classList.remove('controls__button--danger');
  }
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'controls__button';
  el.textContent = label;
  el.addEventListener('click', onClick);
  return el;
}
