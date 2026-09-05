// WHAT: The tooltip for every `data-tip` element in the overlay.
// HOW:  One element, delegated. Listens for pointer and focus on the whole UI
//       container, finds the nearest `[data-tip]` ancestor, and places a single
//       fixed-position panel under it — flipped to the left, or above, when
//       there is not room the other way.
// WHY:  This started as a `::after` on each button, which cannot be measured:
//       a pseudo-element's box is invisible to script, so the flip had to be
//       guessed from how far down the row a button sat. That guess is wrong the
//       moment the window is narrow or the label is long. A real element can be
//       measured against the viewport and put where it actually fits.

/** Clearance from the window edge, and from the element being described. */
const MARGIN = 8;
const GAP = 7;

export class Tooltips {
  private readonly element: HTMLDivElement;
  private target: HTMLElement | null = null;

  public constructor(private readonly container: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'tooltip';
    this.element.setAttribute('role', 'presentation');
    this.element.hidden = true;
    container.appendChild(this.element);

    container.addEventListener('pointerover', this.onOver);
    container.addEventListener('pointerout', this.onOut);
    container.addEventListener('focusin', this.onOver);
    container.addEventListener('focusout', this.onOut);
    // A tooltip left behind over a moving board is worse than none.
    window.addEventListener('scroll', this.hide, true);
    window.addEventListener('resize', this.hide);
  }

  public dispose(): void {
    this.container.removeEventListener('pointerover', this.onOver);
    this.container.removeEventListener('pointerout', this.onOut);
    this.container.removeEventListener('focusin', this.onOver);
    this.container.removeEventListener('focusout', this.onOut);
    window.removeEventListener('scroll', this.hide, true);
    window.removeEventListener('resize', this.hide);
    this.element.remove();
  }

  private readonly onOver = (event: Event): void => {
    const found = event.target instanceof Element ? event.target.closest('[data-tip]') : null;
    if (!(found instanceof HTMLElement)) return;
    const tip = found.dataset.tip;
    if (tip === undefined || tip === '') return;
    this.target = found;
    this.show(found, tip);
  };

  private readonly onOut = (event: Event): void => {
    const found = event.target instanceof Element ? event.target.closest('[data-tip]') : null;
    if (found === this.target) this.hide();
  };

  private readonly hide = (): void => {
    this.target = null;
    this.element.hidden = true;
  };

  private show(target: HTMLElement, text: string): void {
    this.element.textContent = text;
    // Measured where it will be drawn, so the numbers below are the real ones.
    this.element.hidden = false;
    this.element.style.left = '0';
    this.element.style.top = '0';

    const anchor = target.getBoundingClientRect();
    const tip = this.element.getBoundingClientRect();
    const maxLeft = window.innerWidth - tip.width - MARGIN;

    // Left-aligned to the element, unless that runs off the right-hand edge —
    // then right-aligned to it, and clamped if even that will not fit.
    let left = anchor.left;
    if (left > maxLeft) left = anchor.right - tip.width;
    this.element.style.left = `${String(Math.round(Math.min(Math.max(left, MARGIN), Math.max(maxLeft, MARGIN))))}px`;

    // Below by preference, above when the window runs out underneath.
    const below = anchor.bottom + GAP;
    const top =
      below + tip.height > window.innerHeight - MARGIN ? anchor.top - GAP - tip.height : below;
    this.element.style.top = `${String(Math.round(Math.max(top, MARGIN)))}px`;
  }
}
