// WHAT: A compact panel to choose your colour and the opponent's strength,
//       and to start a new game.
// HOW:  Two <select>s and a button. Emits nothing on the bus itself; it calls
//       back into whatever `onNewGame` the app wires up.
// WHY:  Phase 4 needs a way to sit down against the engine at each level.
//       Phase 11's main menu replaces this; keeping it a self-contained widget
//       makes that replacement a deletion.

import { DIFFICULTIES } from '@ai/IChessAI';
import type { Difficulty } from '@ai/IChessAI';
import type { Color } from '@domain/chess/types';

export interface NewGameRequest {
  readonly humanColor: Color | 'both' | 'none';
  readonly difficulty: Difficulty;
}

const SIDE_OPTIONS: readonly { value: NewGameRequest['humanColor']; label: string }[] = [
  { value: 'white', label: 'Play White' },
  { value: 'black', label: 'Play Black' },
  { value: 'both', label: 'Hot-seat (no AI)' },
  { value: 'none', label: 'Watch (AI vs AI)' },
];

const DIFFICULTY_LABEL: Readonly<Record<Difficulty, string>> = {
  beginner: 'Beginner',
  club: 'Club',
  strong: 'Strong',
};

export class OpponentPanel {
  private readonly el: HTMLDivElement;
  private readonly side: HTMLSelectElement;
  private readonly level: HTMLSelectElement;

  public constructor(
    container: HTMLElement,
    initial: NewGameRequest,
    onNewGame: (request: NewGameRequest) => void,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'opponent-panel';

    this.side = select(SIDE_OPTIONS, initial.humanColor);
    this.level = select(
      DIFFICULTIES.map((d) => ({ value: d, label: DIFFICULTY_LABEL[d] })),
      initial.difficulty,
    );

    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'New game';
    button.addEventListener('click', () => {
      onNewGame(this.current());
    });

    this.el.append(this.side, this.level, button);
    container.appendChild(this.el);
  }

  public current(): NewGameRequest {
    return {
      humanColor: this.side.value as NewGameRequest['humanColor'],
      difficulty: this.level.value as Difficulty,
    };
  }

  public dispose(): void {
    this.el.remove();
  }
}

function select<T extends string>(
  options: readonly { value: T; label: string }[],
  selected: T,
): HTMLSelectElement {
  const el = document.createElement('select');
  for (const { value, label } of options) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    opt.selected = value === selected;
    el.appendChild(opt);
  }
  return el;
}
