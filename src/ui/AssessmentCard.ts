// WHAT: How the game stands, if the player has asked to be told: a bar, a
//       sentence, and the conventional number.
// HOW:  Listens for `assessment-changed` and shows or hides itself. The bar is
//       two nested divs whose widths are White's share; the caption carries the
//       verdict, and the small print carries the number, the search depth, and
//       the warning that it is a guess.
// WHY:  The bar answers "who is winning" without being read, which is what a
//       beginner wants; the number is there for whoever already knows what
//       "+1.4" means. Hidden until asked for, because being told continuously
//       that you are losing is not what the easy levels are for.

import type { Assessment } from '@game/assessment';
import type { GameBus } from '@game/GameEvents';

export class AssessmentCard {
  private readonly root: HTMLDivElement;
  private readonly fill: HTMLDivElement;
  private readonly verdict: HTMLDivElement;
  private readonly detail: HTMLDivElement;
  private readonly unsubscribe: () => void;

  public constructor(container: HTMLElement, bus: GameBus) {
    this.root = document.createElement('div');
    this.root.className = 'assessment';
    this.root.hidden = true;

    const heading = document.createElement('div');
    heading.className = 'assessment__heading';
    heading.textContent = 'How it stands';

    const bar = document.createElement('div');
    bar.className = 'assessment__bar';
    bar.setAttribute('role', 'img');
    this.fill = document.createElement('div');
    this.fill.className = 'assessment__fill';
    bar.appendChild(this.fill);

    this.verdict = document.createElement('div');
    this.verdict.className = 'assessment__verdict';
    this.detail = document.createElement('div');
    this.detail.className = 'assessment__detail';

    this.root.append(heading, bar, this.verdict, this.detail);
    container.appendChild(this.root);

    this.unsubscribe = bus.on('assessment-changed', ({ assessment }) => {
      this.show(assessment);
    });
  }

  public dispose(): void {
    this.unsubscribe();
    this.root.remove();
  }

  private show(assessment: Assessment | null): void {
    this.root.hidden = assessment === null;
    if (assessment === null) return;

    const percent = Math.round(assessment.whiteShare * 100);
    this.fill.style.width = `${String(percent)}%`;
    this.verdict.textContent = assessment.verdict;
    // The depth is the honest part: it says how hard the engine actually looked.
    this.detail.textContent = `${assessment.number} · looked ${String(assessment.depth)} deep · a guess, not a promise`;
    this.root.setAttribute('aria-label', `${assessment.verdict}, ${assessment.number}`);
  }
}
