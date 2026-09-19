// WHAT: What the map data is doing right now, for a player who is not in
//       debug mode: loading terrain, loading features, or a failure with two
//       ways forward.
// HOW:  A full-screen veil that blurs the half-built board behind it, with a
//       card in the middle: a row of chess pieces hopping in sequence, what is
//       being fetched, and a chess tip. The veil ignores the pointer so the
//       menu and the HUD stay usable; only the two buttons take a click. Exposes two
//       adapter objects —
//       `terrain` (an IElevationView) and `features` (an IFeaturesView) — so
//       the two loaders report separately and an error names the right one.
//       Success on both hides the pill; the board itself is the confirmation.
// WHY:  BUILD_PLAN §5: every network call gets a user-visible failure state.
//       Until now elevation and Overpass reported only to the debug panels, so
//       a failed fetch outside `?debug` looked like the board simply never
//       arriving. Retry is here because both failures are usually transient.
//       The tip is there because a cold area takes a few seconds and a progress
//       count is a poor thing to read; whoever is waiting came here for chess.

import type { IElevationView } from '@mapdata/elevation/ElevationLoader';
import type { IFeaturesView } from '@mapdata/features/FeatureLoader';

import { nextTip } from './chessTips';

type Channel = 'terrain' | 'features';

type State =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading'; readonly detail: string }
  | { readonly kind: 'ready' }
  | { readonly kind: 'error'; readonly message: string };

const LABEL: Readonly<Record<Channel, string>> = {
  terrain: 'terrain',
  features: 'map features',
};

/** Long enough to read twice, short enough that a slow load is not one joke. */
const TIP_ROTATE_MS = 6500;

export class DataStatus {
  private readonly root: HTMLDivElement;
  private readonly text: HTMLSpanElement;
  private readonly tip: HTMLDivElement;
  private readonly retry: HTMLButtonElement;
  private readonly elsewhere: HTMLButtonElement;
  private readonly anyway: HTMLButtonElement;
  private readonly advice: HTMLDivElement;
  /** Failed attempts in a row on the current area; reset when one succeeds. */
  private failures = 0;
  private showingError = false;
  private tipTimer: ReturnType<typeof setInterval> | null = null;
  private shownTip: string | null = null;
  private readonly state: Record<Channel, State> = {
    terrain: { kind: 'idle' },
    features: { kind: 'idle' },
  };

  /** Hand this to ElevationLoader. */
  public readonly terrain: IElevationView = {
    showLoading: (done: number, total: number) => {
      this.set('terrain', {
        kind: 'loading',
        detail: total > 0 ? ` ${String(done)}/${String(total)}` : '',
      });
    },
    showField: () => {
      this.set('terrain', { kind: 'ready' });
    },
    showError: (message: string) => {
      this.set('terrain', { kind: 'error', message });
    },
  };

  /** Hand this to FeatureLoader. */
  public readonly features: IFeaturesView = {
    showLoading: () => {
      this.set('features', { kind: 'loading', detail: '' });
    },
    showFeatures: () => {
      this.set('features', { kind: 'ready' });
    },
    showError: (message: string) => {
      this.set('features', { kind: 'error', message });
    },
  };

  public constructor(
    container: HTMLElement,
    onRetry: () => void,
    onChooseArea: () => void,
    onPlayAnyway: () => void,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'datastatus';
    this.root.hidden = true;
    this.root.setAttribute('role', 'status');

    const card = document.createElement('div');
    card.className = 'datastatus__card';

    const line = document.createElement('div');
    line.className = 'datastatus__line';
    this.text = document.createElement('span');
    this.tip = document.createElement('div');
    this.tip.className = 'datastatus__tip';
    this.tip.hidden = true;
    this.retry = document.createElement('button');
    this.retry.type = 'button';
    this.retry.className = 'datastatus__retry';
    this.retry.textContent = 'Try again';
    this.retry.hidden = true;
    this.retry.addEventListener('click', onRetry);

    /*
      The way out. Some failures are not transient: an area dense enough to
      time the query out will do it again, and "Try again" on its own is then a
      loop with no exit — the player is stuck on a board that will never build,
      with the one control that might help hidden behind a menu they cannot
      reach past the veil.
    */
    this.elsewhere = document.createElement('button');
    this.elsewhere.type = 'button';
    this.elsewhere.className = 'datastatus__retry datastatus__elsewhere';
    this.elsewhere.textContent = 'Choose another area';
    this.elsewhere.hidden = true;
    this.elsewhere.addEventListener('click', onChooseArea);

    /*
      Said only after the second failure. Once is bad luck — the map service is
      shared, free and often busy, and a retry usually works. Twice is a
      pattern, and at that point the honest thing is to stop implying the next
      press will be different and let the player decide.
    */
    this.advice = document.createElement('div');
    this.advice.className = 'datastatus__advice';
    this.advice.hidden = true;
    this.advice.textContent =
      'That is twice. The map service may be busy, or this square may hold more detail than it will answer for. Another area usually loads straight away — or play this ground as it is, with no rivers, woods or real names on it.';

    /*
      Offered only when the ground arrived and it was the map that did not:
      terrain alone is a playable board, with names made from the shape of the
      land instead of from what is on it. Offered rather than taken: a board
      with the right hills and invented names is still less than this game is
      meant to be, so it is the player's call and not a silent fallback.
    */
    this.anyway = document.createElement('button');
    this.anyway.type = 'button';
    this.anyway.className = 'datastatus__retry';
    this.anyway.textContent = 'Play without the map details';
    this.anyway.hidden = true;
    this.anyway.addEventListener('click', onPlayAnyway);

    line.append(this.text, this.retry, this.elsewhere, this.anyway);
    card.append(hoppingPieces(), line, this.advice, this.tip);
    this.root.appendChild(card);
    container.appendChild(this.root);
  }

  /**
   * Stops reporting a failure the player has decided to go on without.
   *
   * Nothing is retried and nothing is pretended to have arrived; the veil just
   * gets out of the way of the board that is about to be built.
   */
  public dismiss(): void {
    this.state.terrain = { kind: 'ready' };
    this.state.features = { kind: 'ready' };
    this.failures = 0;
    this.showingError = false;
    this.render();
  }

  public dispose(): void {
    this.stopTips();
    this.root.remove();
  }

  private startTips(): void {
    if (this.tipTimer !== null) return;
    this.showTip();
    this.tipTimer = setInterval(() => {
      this.showTip();
    }, TIP_ROTATE_MS);
  }

  private showTip(): void {
    this.shownTip = nextTip(this.shownTip);
    this.tip.textContent = this.shownTip;
    this.tip.hidden = false;
  }

  private stopTips(): void {
    if (this.tipTimer !== null) clearInterval(this.tipTimer);
    this.tipTimer = null;
    this.tip.hidden = true;
  }

  private set(channel: Channel, state: State): void {
    this.state[channel] = state;
    this.render();
  }

  private render(): void {
    const failed = channels().filter((c) => this.state[c].kind === 'error');
    if (failed.length > 0) {
      // Both channels failing is still one failed attempt, not two.
      if (!this.showingError) {
        this.showingError = true;
        this.failures += 1;
      }
      // A failure is something to act on, not something to read a joke under.
      this.stopTips();
      this.root.classList.add('datastatus--error');
      this.retry.hidden = false;
      this.elsewhere.hidden = false;
      this.advice.hidden = this.failures < 2;
      // Nothing to fall back on if it was the ground that failed to arrive.
      this.anyway.hidden =
        this.failures < 2 ||
        this.state.terrain.kind !== 'ready' ||
        this.state.features.kind !== 'error';
      // Past the second try, moving on is the likelier answer of the two.
      this.elsewhere.classList.toggle('datastatus__retry--primary', this.failures >= 2);
      this.root.hidden = false;
      this.text.textContent = failed
        .map((c) => {
          const state = this.state[c];
          return `Could not load ${LABEL[c]}${state.kind === 'error' ? `: ${state.message}` : ''}`;
        })
        .join(' · ');
      return;
    }

    const loading = channels().filter((c) => this.state[c].kind === 'loading');
    this.showingError = false;
    this.root.classList.remove('datastatus--error');
    this.retry.hidden = true;
    this.elsewhere.hidden = true;
    this.anyway.hidden = true;
    this.advice.hidden = true;
    if (loading.length === 0) {
      // Everything arrived: whatever went wrong before is no longer a pattern.
      this.failures = 0;
      this.stopTips();
      this.root.hidden = true;
      return;
    }
    this.root.hidden = false;
    this.startTips();
    this.text.textContent = `Loading ${loading
      .map((c) => {
        const state = this.state[c];
        return `${LABEL[c]}${state.kind === 'loading' ? state.detail : ''}`;
      })
      .join(' and ')}…`;
  }
}

function channels(): readonly Channel[] {
  return ['terrain', 'features'];
}

/** The six piece types, hopping one after another like a Mexican wave. */
function hoppingPieces(): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'datastatus__pieces';
  row.setAttribute('aria-hidden', 'true');
  for (const glyph of ['♙', '♘', '♗', '♖', '♕', '♔']) {
    const piece = document.createElement('span');
    piece.className = 'datastatus__piece';
    piece.textContent = glyph;
    row.appendChild(piece);
  }
  return row;
}
