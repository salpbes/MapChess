// WHAT: The record of the game: what has been taken, and every move played.
// HOW:  One panel on the right holding a CapturedRow and a MoveList, both fed
//       from `history-changed` — the only event either of them needs, because
//       captures and notation are both derivable from the move list.
// WHY:  The two belong in one column and answer one question ("how is this
//       game going?"). Keeping the subscription here means neither child knows
//       the bus exists, and undo needs no special case anywhere.

import type { Move } from '@domain/chess/types';
import { summariseCaptures } from '@game/captures';
import type { GameBus } from '@game/GameEvents';
import type { ThemeTracker } from '@game/ThemeTracker';

import { CapturedRow } from './CapturedRow';
import { MoveList } from './MoveList';

export class RecordPanel {
  private readonly root: HTMLDivElement;
  private readonly captured: CapturedRow;
  private readonly moves: MoveList;
  private readonly empty: HTMLDivElement;
  private readonly unsubscribe: (() => void)[];

  public constructor(container: HTMLElement, bus: GameBus, tracker: ThemeTracker) {
    this.root = document.createElement('div');
    this.root.className = 'record';

    this.captured = new CapturedRow(this.root);
    this.empty = document.createElement('div');
    this.empty.className = 'record__empty';
    this.empty.textContent = 'No moves yet.';
    this.root.appendChild(this.empty);
    this.moves = new MoveList(
      this.root,
      (move: Move) => tracker.describe(move.to).cell?.name ?? null,
    );

    container.appendChild(this.root);

    this.unsubscribe = [
      bus.on('history-changed', ({ moves }) => {
        this.show(moves);
      }),
    ];
    this.show([]);
  }

  public dispose(): void {
    for (const off of this.unsubscribe) off();
    this.root.remove();
  }

  private show(moves: readonly Move[]): void {
    this.empty.hidden = moves.length > 0;
    this.captured.show(summariseCaptures(moves));
    this.moves.show(moves);
  }
}
