// WHAT: What the map data is doing right now, for a player who is not in
//       debug mode: loading terrain, loading features, or a failure with a way
//       to try again.
// HOW:  A full-screen veil that blurs the half-built board behind it, with a
//       card in the middle: a row of chess pieces hopping in sequence, what is
//       being fetched, and a chess tip. The veil ignores the pointer so the
//       menu and the HUD stay usable; only Retry takes a click. Exposes two
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

  public constructor(container: HTMLElement, onRetry: () => void) {
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

    line.append(this.text, this.retry);
    card.append(hoppingPieces(), line, this.tip);
    this.root.appendChild(card);
    container.appendChild(this.root);
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
      // A failure is something to act on, not something to read a joke under.
      this.stopTips();
      this.root.classList.add('datastatus--error');
      this.retry.hidden = false;
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
    this.root.classList.remove('datastatus--error');
    this.retry.hidden = true;
    if (loading.length === 0) {
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
