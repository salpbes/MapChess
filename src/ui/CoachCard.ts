// WHAT: The standing note on how the game is going: what the opening is
//       called, the one thing worth doing now, and two numbers.
// HOW:  Listens for `coaching-changed` and rewrites three lines. Nothing here
//       decides anything — game/coaching.ts picks the sentence, this puts it
//       on paper.
// WHY:  Everything else the game says is about a moment: a hint answers this
//       move when asked, and only when asked. Nothing told the player where
//       they were. This is the panel that always has something to say —
//       an opening has a name, two pieces are still at home, you are a knight
//       up so trade — which is the kind of help a person actually improves on.

import type { Coaching } from '@game/coaching';
import type { GameBus } from '@game/GameEvents';

export class CoachCard {
  private readonly root: HTMLDivElement;
  private readonly title: HTMLDivElement;
  private readonly advice: HTMLDivElement;
  private readonly facts: HTMLDivElement;
  private readonly unsubscribe: () => void;

  public constructor(container: HTMLElement, bus: GameBus) {
    this.root = document.createElement('div');
    this.root.className = 'coach';
    this.root.hidden = true;
    this.root.setAttribute('role', 'status');

    const heading = document.createElement('div');
    heading.className = 'coach__heading';
    heading.textContent = 'Your game';

    this.title = document.createElement('div');
    this.title.className = 'coach__title';
    this.advice = document.createElement('div');
    this.advice.className = 'coach__advice';
    this.facts = document.createElement('div');
    this.facts.className = 'coach__facts';

    this.root.append(heading, this.title, this.advice, this.facts);
    container.appendChild(this.root);

    this.unsubscribe = bus.on('coaching-changed', ({ coaching }) => {
      this.show(coaching);
    });
  }

  public dispose(): void {
    this.unsubscribe();
    this.root.remove();
  }

  private show(coaching: Coaching | null): void {
    this.root.hidden = coaching === null;
    if (coaching === null) return;
    this.title.textContent = coaching.title;
    this.advice.textContent = coaching.advice;
    this.facts.textContent = coaching.facts;
  }
}
