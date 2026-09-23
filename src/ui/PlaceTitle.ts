// WHAT: The name of a chosen place, set over the board as it arrives — the era
//       small above it, the place large, one line of what happened there below.
// HOW:  One element, hidden until `show()`. It rises in, holds, and fades out on
//       its own, and it never takes a click: pointer-events are off, so a
//       player who starts moving pieces straight away is never blocked by it.
//       Reduced motion gets the same card with no movement. A screen reader
//       hears it through the Announcer, not from here.
// WHY:  Choosing "Monte Cassino" and arriving at a board headed "The field of
//       San Silvestro" was correct and flat. The gazetteer names ground; the
//       player chose a battle. This is the moment of arrival, and it is worth
//       marking the way a film marks it — briefly, in a serif, and then out of
//       the way — rather than with a banner that has to be dismissed.

export interface PlaceTitleText {
  /** "Second World War". Null for the quiet places, which have no era to announce. */
  readonly kicker: string | null;
  readonly name: string;
  readonly line: string;
}

/** Long enough to read the name and the line twice; short enough not to wait on. */
const HOLD_MS = 4200;
/** Matches the fade in styles.css, so the element is hidden only once invisible. */
const FADE_MS = 700;

export class PlaceTitle {
  private readonly root: HTMLDivElement;
  private readonly kicker: HTMLDivElement;
  private readonly name: HTMLDivElement;
  private readonly line: HTMLDivElement;
  private timers: number[] = [];

  public constructor(container: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'place-title';
    this.root.hidden = true;
    // Seen, not heard: the Announcer says the same words in the app's one live
    // region, and a second region here would race it.
    this.root.setAttribute('aria-hidden', 'true');

    this.kicker = document.createElement('div');
    this.kicker.className = 'place-title__kicker';
    this.name = document.createElement('div');
    this.name.className = 'place-title__name';
    const rule = document.createElement('div');
    rule.className = 'place-title__rule';
    this.line = document.createElement('div');
    this.line.className = 'place-title__line';

    this.root.append(this.kicker, this.name, rule, this.line);
    container.appendChild(this.root);
  }

  public show(text: PlaceTitleText): void {
    this.clearTimers();
    this.kicker.textContent = text.kicker ?? '';
    this.kicker.hidden = text.kicker === null;
    this.name.textContent = text.name;
    this.line.textContent = text.line;

    this.root.classList.remove('place-title--in', 'place-title--out');
    this.root.hidden = false;
    // A frame between showing and animating, or the browser skips the rise.
    this.timers.push(
      window.setTimeout(() => {
        this.root.classList.add('place-title--in');
      }, 20),
      window.setTimeout(() => {
        this.root.classList.add('place-title--out');
      }, HOLD_MS),
      window.setTimeout(() => {
        this.hide();
      }, HOLD_MS + FADE_MS),
    );
  }

  public hide(): void {
    this.clearTimers();
    this.root.hidden = true;
    this.root.classList.remove('place-title--in', 'place-title--out');
  }

  public dispose(): void {
    this.clearTimers();
    this.root.remove();
  }

  private clearTimers(): void {
    for (const t of this.timers) window.clearTimeout(t);
    this.timers = [];
  }
}
