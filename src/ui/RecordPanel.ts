// WHAT: The record of the game: what has been taken, and every move played.
// HOW:  One panel in the left column holding a CapturedRow and a MoveList, both
//       fed from `history-changed` — the only event either of them needs,
//       because captures and notation are both derivable from the move list.
//       A heading folds the whole thing away, remembered in localStorage, and
//       carries the move count so a folded panel still says how far in you are.
// WHY:  The two belong in one column and answer one question ("how is this
//       game going?"). Keeping the subscription here means neither child knows
//       the bus exists, and undo needs no special case anywhere.

import type { Move } from '@domain/chess/types';
import { summariseCaptures } from '@game/captures';
import type { GameBus } from '@game/GameEvents';
import type { ThemeTracker } from '@game/ThemeTracker';

import { CapturedRow } from './CapturedRow';
import { MoveList } from './MoveList';

const STORAGE_KEY = 'mapchess.recordOpen';

export class RecordPanel {
  private readonly root: HTMLDivElement;
  private readonly captured: CapturedRow;
  private readonly moves: MoveList;
  private readonly empty: HTMLDivElement;
  private readonly toggle: HTMLButtonElement;
  private readonly caret: HTMLSpanElement;
  private readonly heading: HTMLSpanElement;
  private readonly body: HTMLDivElement;
  private readonly unsubscribe: (() => void)[];
  private open: boolean;

  public constructor(container: HTMLElement, bus: GameBus, tracker: ThemeTracker) {
    this.open = readSetting();

    this.root = document.createElement('div');
    this.root.className = 'record';

    this.caret = document.createElement('span');
    this.caret.className = 'record__caret';
    this.caret.setAttribute('aria-hidden', 'true');
    this.heading = document.createElement('span');
    this.heading.className = 'record__heading';

    this.toggle = document.createElement('button');
    this.toggle.type = 'button';
    this.toggle.className = 'record__toggle';
    this.toggle.append(this.caret, this.heading);
    this.toggle.addEventListener('click', () => {
      this.setOpen(!this.open);
    });

    this.body = document.createElement('div');
    this.body.className = 'record__body';
    this.captured = new CapturedRow(this.body);
    this.empty = document.createElement('div');
    this.empty.className = 'record__empty';
    this.empty.textContent = 'No moves yet.';
    this.body.appendChild(this.empty);
    this.moves = new MoveList(
      this.body,
      (move: Move) => tracker.describe(move.to).cell?.name ?? null,
    );

    this.root.append(this.toggle, this.body);
    container.appendChild(this.root);

    this.unsubscribe = [
      bus.on('history-changed', ({ moves }) => {
        this.show(moves);
      }),
    ];
    this.show([]);
    this.render();
  }

  public dispose(): void {
    for (const off of this.unsubscribe) off();
    this.root.remove();
  }

  private show(moves: readonly Move[]): void {
    const played = Math.ceil(moves.length / 2);
    this.heading.textContent = played === 0 ? 'The game' : `The game · ${String(played)}`;
    this.empty.hidden = moves.length > 0;
    this.captured.show(summariseCaptures(moves));
    this.moves.show(moves);
  }

  private setOpen(open: boolean): void {
    this.open = open;
    try {
      localStorage.setItem(STORAGE_KEY, open ? 'open' : 'shut');
    } catch (error: unknown) {
      console.warn('Could not remember whether the record was open.', error);
    }
    this.render();
  }

  private render(): void {
    this.root.classList.toggle('record--open', this.open);
    this.body.hidden = !this.open;
    this.caret.textContent = this.open ? '▾' : '▸';
    this.toggle.title = this.open ? 'Fold the move record away' : 'Show the move record';
    this.toggle.setAttribute('aria-expanded', this.open ? 'true' : 'false');
  }
}

function readSetting(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'shut';
  } catch (error: unknown) {
    console.warn('Could not read the record setting.', error);
    return true;
  }
}
