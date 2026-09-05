// WHAT: The front door: resume the last game, or set up a new one.
// HOW:  A full-screen overlay over the board (which keeps loading behind it)
//       with a Resume row, a side and difficulty chooser, and the place being
//       fought over — named where the map knows a name, with a map button to
//       go somewhere else. Escape or "Back to the board" dismisses it, so it
//       can never trap a player who only wanted a look at the menu.
// WHY:  BUILD_PLAN Phase 11 — start, play, quit and resume without touching the
//       console. This replaces Phase 4's OpponentPanel, which existed to make
//       exactly this replacement a deletion.

import { DIFFICULTIES } from '@ai/IChessAI';
import type { Difficulty } from '@ai/IChessAI';
import type { Color } from '@domain/chess/types';

import { icon } from './icons';

export interface NewGameRequest {
  readonly humanColor: Color | 'both' | 'none';
  readonly difficulty: Difficulty;
}

export interface SavedGameSummary {
  readonly moveCount: number;
  readonly areaLabel: string;
  readonly savedAt: Date;
}

export interface MainMenuDeps {
  readonly onNewGame: (request: NewGameRequest) => void;
  readonly onResume: () => void;
  readonly onChooseArea: () => void;
  /** The name of the place being fought over, or its coordinates if unnamed. */
  readonly areaLabel: () => string;
  /** Null when there is nothing to resume. */
  readonly savedGame: () => SavedGameSummary | null;
}

const SIDE_OPTIONS: readonly { value: NewGameRequest['humanColor']; label: string }[] = [
  { value: 'white', label: 'Play White' },
  { value: 'black', label: 'Play Black' },
  { value: 'both', label: 'Hot-seat (no computer)' },
  { value: 'none', label: 'Watch (computer plays both)' },
];

/** Weakest first, matching DIFFICULTIES, with a word on what each one misses. */
const DIFFICULTY_LABEL: Readonly<Record<Difficulty, string>> = {
  learner: 'Learner — hangs pieces',
  beginner: 'Beginner — sees one trade',
  casual: 'Casual — a steady club novice',
  club: 'Club player',
  strong: 'Strong — full engine',
};

export class MainMenu {
  private readonly backdrop: HTMLDivElement;
  private readonly side: HTMLSelectElement;
  private readonly level: HTMLSelectElement;
  private readonly area: HTMLSpanElement;
  private readonly resume: HTMLButtonElement;
  private readonly resumeNote: HTMLDivElement;
  private readonly onKeyDown: (event: KeyboardEvent) => void;

  public constructor(
    container: HTMLElement,
    initial: NewGameRequest,
    private readonly deps: MainMenuDeps,
  ) {
    this.backdrop = document.createElement('div');
    this.backdrop.className = 'menu-backdrop';
    this.backdrop.hidden = true;

    const panel = document.createElement('div');
    panel.className = 'menu';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'MapChess menu');

    const title = document.createElement('h1');
    title.className = 'menu__title';
    title.textContent = 'MapChess';
    const tagline = document.createElement('p');
    tagline.className = 'menu__tagline';
    tagline.textContent = 'Chess on a real square of the world.';

    this.resume = button('Resume game', 'menu__button menu__button--primary', () => {
      this.close();
      deps.onResume();
    });
    this.resumeNote = document.createElement('div');
    this.resumeNote.className = 'menu__note';

    this.side = select(SIDE_OPTIONS, initial.humanColor, 'Which side to play');
    this.level = select(
      DIFFICULTIES.map((d) => ({ value: d, label: DIFFICULTY_LABEL[d] })),
      initial.difficulty,
      'Opponent strength',
    );

    this.area = document.createElement('span');
    this.area.className = 'menu__area';

    panel.append(
      title,
      tagline,
      this.resume,
      this.resumeNote,
      divider(),
      field('Side', this.side),
      field('Opponent', this.level),
      place(this.area, () => {
        this.close();
        deps.onChooseArea();
      }),
      button('New game', 'menu__button menu__button--primary', () => {
        this.close();
        deps.onNewGame(this.current());
      }),
      button('Back to the board', 'menu__button menu__button--quiet', () => {
        this.close();
      }),
    );

    this.backdrop.appendChild(panel);
    container.appendChild(this.backdrop);

    this.onKeyDown = (event) => {
      if (event.key === 'Escape' && !this.backdrop.hidden) this.close();
    };
    window.addEventListener('keydown', this.onKeyDown);
  }

  public get isOpen(): boolean {
    return !this.backdrop.hidden;
  }

  public open(): void {
    this.refresh();
    this.backdrop.hidden = false;
  }

  public close(): void {
    this.backdrop.hidden = true;
  }

  public dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    this.backdrop.remove();
  }

  private current(): NewGameRequest {
    return {
      humanColor: this.side.value as NewGameRequest['humanColor'],
      difficulty: this.level.value as Difficulty,
    };
  }

  private refresh(): void {
    this.area.textContent = this.deps.areaLabel();
    const saved = this.deps.savedGame();
    this.resume.hidden = saved === null;
    this.resumeNote.hidden = saved === null;
    if (saved !== null) {
      const plural = saved.moveCount === 1 ? '' : 's';
      this.resumeNote.textContent = `${String(saved.moveCount)} move${plural} · ${saved.areaLabel} · saved ${ago(saved.savedAt)}`;
    }
  }
}

function button(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = className;
  el.textContent = label;
  el.addEventListener('click', onClick);
  return el;
}

function select(
  options: readonly { value: string; label: string }[],
  initial: string,
  label: string,
): HTMLSelectElement {
  const el = document.createElement('select');
  el.className = 'menu__select';
  el.setAttribute('aria-label', label);
  for (const option of options) {
    const opt = document.createElement('option');
    opt.value = option.value;
    opt.textContent = option.label;
    el.appendChild(opt);
  }
  el.value = initial;
  return el;
}

function field(label: string, ...controls: readonly HTMLElement[]): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'menu__field';
  const name = document.createElement('span');
  name.className = 'menu__label';
  name.textContent = label;
  row.append(name, ...controls);
  return row;
}

/**
 * The place being fought over, with the map itself as the way to change it.
 * A labelled "Change…" button read as a form field; the board is the subject
 * of the whole menu, so it gets the one picture on the screen.
 */
function place(value: HTMLElement, onChoose: () => void): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'menu__place';

  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'menu__map';
  open.title = 'Choose a different place on the map';
  open.setAttribute('aria-label', 'Choose a different place on the map');
  open.appendChild(icon('map', 24));
  open.addEventListener('click', onChoose);

  const text = document.createElement('div');
  text.className = 'menu__place-text';
  const caption = document.createElement('div');
  caption.className = 'menu__place-caption';
  caption.textContent = 'Current war location';
  text.append(caption, value);

  row.append(open, text);
  return row;
}

function divider(): HTMLHRElement {
  const el = document.createElement('hr');
  el.className = 'menu__divider';
  return el;
}

/** Rough and friendly: exact times are noise on a saved game. */
function ago(when: Date): string {
  const minutes = Math.round((Date.now() - when.getTime()) / 60000);
  if (!Number.isFinite(minutes) || minutes < 1) return 'just now';
  if (minutes < 60) return `${String(minutes)} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${String(hours)} h ago`;
  return `${String(Math.round(hours / 24))} days ago`;
}
