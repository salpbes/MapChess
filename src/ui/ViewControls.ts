// WHAT: The switch for how much the places on the board say.
// HOW:  One icon button in the control dock, cycling names → markers → off and
//       changing icon with the state: a tag, a pin, a struck-through tag. The
//       choice is remembered in localStorage like the identity card's, so a
//       player who turns them down does not have to do it again next time.
// WHY:  The labels are the best part of the board and the worst thing between
//       the camera and a piece, depending entirely on where you are looking
//       from. That is a decision only the player can make, and one they change
//       often, so it belongs on a button and not in a menu. Markers alone is
//       the state that turned out to matter: it keeps "there is something here"
//       while giving the board back.

import type { LabelMode } from '@world/builders/LabelBuilder';

import { icon } from './icons';
import type { IconName } from './icons';

const STORAGE_KEY = 'mapchess.labelMode';
/** Cycled in this order by repeated clicks. */
const MODES: readonly LabelMode[] = ['names', 'markers', 'off'];
const MODE_ICON: Readonly<Record<LabelMode, IconName>> = {
  names: 'tag',
  markers: 'pin',
  off: 'tagOff',
};
const MODE_HINT: Readonly<Record<LabelMode, string>> = {
  names: 'Place names are showing — click for markers only',
  markers: 'Markers only — click to hide them',
  off: 'Nothing on the board — click for place names',
};

export interface ViewControlsDeps {
  readonly onLabelsChanged: (mode: LabelMode) => void;
}

export class ViewControls {
  private readonly root: HTMLDivElement;
  private readonly labels: HTMLButtonElement;
  private mode: LabelMode;

  public constructor(container: HTMLElement, deps: ViewControlsDeps) {
    this.mode = readSetting();

    this.root = document.createElement('div');
    this.root.className = 'view-controls';

    this.labels = document.createElement('button');
    this.labels.type = 'button';
    this.labels.className = 'view-controls__button';
    this.labels.addEventListener('click', () => {
      const next = MODES[(MODES.indexOf(this.mode) + 1) % MODES.length];
      if (next !== undefined) this.set(next, deps);
    });

    this.root.appendChild(this.labels);
    container.appendChild(this.root);

    this.render();
    // Apply the remembered setting to a scene that has just been built.
    deps.onLabelsChanged(this.mode);
  }

  public get labelMode(): LabelMode {
    return this.mode;
  }

  public dispose(): void {
    this.root.remove();
  }

  private set(mode: LabelMode, deps: ViewControlsDeps): void {
    this.mode = mode;
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch (error: unknown) {
      console.warn('Could not remember the label setting.', error);
    }
    this.render();
    deps.onLabelsChanged(mode);
  }

  private render(): void {
    this.labels.replaceChildren(icon(MODE_ICON[this.mode]));
    this.labels.dataset.tip = MODE_HINT[this.mode];
    this.labels.setAttribute('aria-label', MODE_HINT[this.mode]);
    this.labels.classList.toggle('view-controls__button--off', this.mode === 'off');
  }
}

function readSetting(): LabelMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (MODES.some((m) => m === stored)) return stored as LabelMode;
  } catch (error: unknown) {
    console.warn('Could not read the label setting.', error);
  }
  return 'names';
}
