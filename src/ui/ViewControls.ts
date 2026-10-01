// WHAT: The switches for how the board is presented: how much the places say,
//       whether the engine rates the position, whether the game makes a noise,
//       and a way back to the opening view.
// HOW:  One icon button in the control dock, cycling names → markers → off and
//       changing icon with the state: a tag, a pin, a struck-through tag. The
//       choice is remembered in localStorage like the identity card's, so a
//       player who turns them down does not have to do it again next time. The
//       assessment switch sits beside it and is remembered the same way.
// WHY:  The labels are the best part of the board and the worst thing between
//       the camera and a piece, depending entirely on where you are looking
//       from. That is a decision only the player can make, and one they change
//       often, so it belongs on a button and not in a menu. Markers alone is
//       the state that turned out to matter: it keeps "there is something here"
//       while giving the board back.

import type { LabelMode } from '@world/builders/LabelBuilder';
import { MOODS } from '@world/scene/Atmosphere';
import type { Mood } from '@world/scene/Atmosphere';

import { iconButton, setIcon } from './icons';
import type { IconName } from './icons';

const STORAGE_KEY = 'mapchess.labelMode';
const ASSESS_KEY = 'mapchess.assessing';
const SOUND_KEY = 'mapchess.sound';
const COACH_KEY = 'mapchess.coach';
const COORDS_KEY = 'mapchess.coordinates';
const SCENERY_KEY = 'mapchess.scenery';
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
  readonly onAssessingChanged: (on: boolean) => void;
  readonly onCoachingChanged: (on: boolean) => void;
  readonly onCoordinatesChanged: (on: boolean) => void;
  readonly onSceneryChanged: (on: boolean) => void;
  /** The player chose different weather for the board in hand. */
  readonly onMoodChanged: (mood: Mood) => void;
  readonly onSoundChanged: (on: boolean) => void;
  readonly onRecenter: () => void;
  /** Straight down at the whole board, for reading it as a chessboard. */
  readonly onTopDown: () => void;
}

export class ViewControls {
  private readonly root: HTMLDivElement;
  private readonly labels: HTMLButtonElement;
  private readonly assess: HTMLButtonElement;
  private readonly coach: HTMLButtonElement;
  private readonly sound: HTMLButtonElement;
  private mode: LabelMode;
  private assessing: boolean;
  private coaching: boolean;
  private readonly coords: HTMLButtonElement;
  private coordinating: boolean;
  private readonly scenery: HTMLButtonElement;
  private scenic: boolean;
  private readonly weather: HTMLButtonElement;
  private mood: Mood = 'midday';
  private sounding: boolean;

  public constructor(container: HTMLElement, deps: ViewControlsDeps) {
    this.mode = readSetting();
    /*
      On unless turned off, both of these, for the same reason: they are what
      teaches, and a player will not go looking for a switch to find something
      they do not yet know exists. "How it stands" was off by default until a
      phone made the cost of that obvious — the answer to "am I winning" sat
      behind a drawer, behind a tab, behind a button nobody had met.

      Anyone who turned it off keeps it off; this only changes what a player
      who has never touched it is given.
    */
    this.assessing = readFlag(ASSESS_KEY, true);
    this.coaching = readFlag(COACH_KEY, true);
    // On for the same reason: the coaching says "play e4", and a beginner
    // needs to be able to find e4 before they will think to look for a switch.
    this.coordinating = readFlag(COORDS_KEY, true);
    // The trees are the ground you are playing on; off is for a player who
    // wants the plainest board, not the default.
    this.scenic = readFlag(SCENERY_KEY, true);
    this.sounding = readFlag(SOUND_KEY);

    this.root = document.createElement('div');
    this.root.className = 'view-controls';

    this.labels = document.createElement('button');
    this.labels.type = 'button';
    this.labels.className = 'view-controls__button';
    this.labels.addEventListener('click', () => {
      const next = MODES[(MODES.indexOf(this.mode) + 1) % MODES.length];
      if (next !== undefined) this.set(next, deps);
    });

    this.assess = iconButton('scales', 'Show how the game stands', 'view-controls__button', () => {
      this.setAssessing(!this.assessing, deps);
    });

    this.coach = iconButton('book', 'Coaching notes', 'view-controls__button', () => {
      this.setCoaching(!this.coaching, deps);
    });

    this.sound = iconButton('sound', 'Sound', 'view-controls__button', () => {
      this.setSounding(!this.sounding, deps);
    });

    const recenter = iconButton(
      'recenter',
      'Put the board back where it started',
      'view-controls__button',
      deps.onRecenter,
    );

    const topDown = iconButton(
      'topDown',
      'Look straight down at the board',
      'view-controls__button',
      deps.onTopDown,
    );

    this.coords = iconButton('coords', 'Board coordinates', 'view-controls__button', () => {
      this.setCoordinates(!this.coordinating, deps);
    });

    this.scenery = iconButton('tree', 'Scenery', 'view-controls__button', () => {
      this.setScenery(!this.scenic, deps);
    });

    /*
      Not remembered, unlike the switches beside it. A board opens in its own
      weather — mist at Kobarid, storm at Verdun — and a choice made at one
      battle would otherwise follow the player onto the next, which is exactly
      what the per-battle weather is for.
    */
    this.weather = iconButton('sun', 'Weather', 'view-controls__button', () => {
      const next = MOODS[(MOODS.indexOf(this.mood) + 1) % MOODS.length] ?? 'midday';
      this.mood = next;
      this.render();
      deps.onMoodChanged(next);
    });

    this.root.append(
      this.labels,
      this.coords,
      this.scenery,
      this.weather,
      this.coach,
      this.assess,
      this.sound,
      topDown,
      recenter,
    );
    container.appendChild(this.root);

    this.render();
    // Apply the remembered settings to a scene that has just been built.
    deps.onLabelsChanged(this.mode);
    deps.onAssessingChanged(this.assessing);
    deps.onCoachingChanged(this.coaching);
    deps.onCoordinatesChanged(this.coordinating);
    deps.onSceneryChanged(this.scenic);
    // Applied like the others. Sounds handles the fact that a browser will not
    // start audio before a gesture; skipping this made the button show "on",
    // stay silent, and need pressing twice to be heard.
    deps.onSoundChanged(this.sounding);
  }

  /** Shows the weather a new board opened in, without asking for it again. */
  public setMood(mood: Mood): void {
    this.mood = mood;
    this.render();
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

  private setAssessing(on: boolean, deps: ViewControlsDeps): void {
    this.assessing = on;
    remember(ASSESS_KEY, on);
    this.render();
    deps.onAssessingChanged(on);
  }

  private setCoaching(on: boolean, deps: ViewControlsDeps): void {
    this.coaching = on;
    remember(COACH_KEY, on);
    this.render();
    deps.onCoachingChanged(on);
  }

  private setSounding(on: boolean, deps: ViewControlsDeps): void {
    this.sounding = on;
    remember(SOUND_KEY, on);
    this.render();
    deps.onSoundChanged(on);
  }

  private setScenery(on: boolean, deps: ViewControlsDeps): void {
    this.scenic = on;
    remember(SCENERY_KEY, on);
    this.render();
    deps.onSceneryChanged(on);
  }

  private setCoordinates(on: boolean, deps: ViewControlsDeps): void {
    this.coordinating = on;
    remember(COORDS_KEY, on);
    this.render();
    deps.onCoordinatesChanged(on);
  }

  private render(): void {
    const next = MOODS[(MOODS.indexOf(this.mood) + 1) % MOODS.length] ?? 'midday';
    setIcon(this.weather, MOOD_ICON[this.mood]);
    const weatherLabel = `Weather: ${MOOD_NAME[this.mood]} — change to ${MOOD_NAME[next]}`;
    this.weather.dataset.tip = weatherLabel;
    this.weather.setAttribute('aria-label', weatherLabel);
    const sceneryLabel = this.scenic
      ? 'Hide the trees'
      : 'Show the trees — the woods on and around the board';
    this.scenery.dataset.tip = sceneryLabel;
    this.scenery.setAttribute('aria-label', sceneryLabel);
    this.scenery.classList.toggle('view-controls__button--off', !this.scenic);
    const coordsLabel = this.coordinating
      ? 'Hide the board coordinates'
      : 'Show the board coordinates — a to h, 1 to 8 round the edge';
    this.coords.dataset.tip = coordsLabel;
    this.coords.setAttribute('aria-label', coordsLabel);
    this.coords.classList.toggle('view-controls__button--off', !this.coordinating);

    this.assess.dataset.tip = this.assessing
      ? 'Hide how the game stands'
      : 'Show how the game stands — the engine rates the position after each move';
    this.assess.classList.toggle('view-controls__button--off', !this.assessing);

    const coachLabel = this.coaching
      ? 'Hide the coaching notes'
      : 'Show the coaching notes — the opening’s name and one thing to try';
    this.coach.dataset.tip = coachLabel;
    this.coach.setAttribute('aria-label', coachLabel);
    this.coach.classList.toggle('view-controls__button--off', !this.coaching);

    setIcon(this.sound, this.sounding ? 'sound' : 'soundOff');
    const soundLabel = this.sounding ? 'Turn the sound off' : 'Turn the sound on';
    this.sound.dataset.tip = soundLabel;
    this.sound.setAttribute('aria-label', soundLabel);
    this.sound.classList.toggle('view-controls__button--off', !this.sounding);
    setIcon(this.labels, MODE_ICON[this.mode]);
    this.labels.dataset.tip = MODE_HINT[this.mode];
    this.labels.setAttribute('aria-label', MODE_HINT[this.mode]);
    this.labels.classList.toggle('view-controls__button--off', this.mode === 'off');
  }
}

const MOOD_ICON: Readonly<Record<Mood, IconName>> = { midday: 'sun', mist: 'mist', storm: 'storm' };
const MOOD_NAME: Readonly<Record<Mood, string>> = {
  midday: 'midday',
  mist: 'mist',
  storm: 'storm',
};

/** Stored as the words "on" and "off"; `fallback` covers never having chosen. */
function readFlag(key: string, fallback = false): boolean {
  try {
    const stored = localStorage.getItem(key);
    if (stored === null) return fallback;
    return stored === 'on';
  } catch (error: unknown) {
    console.warn(`Could not read ${key}.`, error);
    return fallback;
  }
}

function remember(key: string, on: boolean): void {
  try {
    localStorage.setItem(key, on ? 'on' : 'off');
  } catch (error: unknown) {
    console.warn(`Could not remember ${key}.`, error);
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
