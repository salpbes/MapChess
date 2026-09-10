// WHAT: The noises the game makes: a knock for a move, a heavier one for a
//       capture, a rising pair for check, a short phrase when it ends.
// HOW:  Synthesised through WebAudio — an oscillator and a gain envelope each
//       — so there is nothing to download and nothing to load before the first
//       move. Listens to the same bus everything else does. A browser will not
//       start an audio context before the page has been interacted with, so a
//       context that comes up suspended waits for the next click or key and
//       resumes itself — which is what lets a remembered "on" survive a reload.
// WHY:  Silence is the difference between a demo and a game, and it is the
//       only thing that tells an adult who glanced away that the computer has
//       moved. It is off until asked for: sound that starts on its own is the
//       rudest thing a web page can do.

import type { GameBus } from '@game/GameEvents';

/** Quiet enough to leave on. */
const VOLUME = 0.16;

interface Note {
  readonly hz: number;
  readonly seconds: number;
  /** Delay before it sounds, for a phrase of more than one note. */
  readonly after?: number;
  readonly type?: OscillatorType;
  readonly gain?: number;
}

const MOVE: readonly Note[] = [{ hz: 196, seconds: 0.07, type: 'triangle' }];
const CAPTURE: readonly Note[] = [
  { hz: 130, seconds: 0.11, type: 'sawtooth', gain: 0.8 },
  { hz: 92, seconds: 0.09, after: 0.02, type: 'triangle' },
];
const CHECK: readonly Note[] = [
  { hz: 660, seconds: 0.09 },
  { hz: 880, seconds: 0.12, after: 0.09 },
];
const OVER: readonly Note[] = [
  { hz: 523, seconds: 0.12 },
  { hz: 659, seconds: 0.12, after: 0.12 },
  { hz: 784, seconds: 0.22, after: 0.24 },
];

export class Sounds {
  private context: AudioContext | null = null;
  private enabled = false;
  private pending: readonly Note[] | null = null;
  private waking: (() => void) | null = null;
  private readonly unsubscribe: (() => void)[];

  public constructor(bus: GameBus) {
    this.unsubscribe = [
      bus.on('move-played', (move) => {
        this.queue(move.captured === null ? MOVE : CAPTURE);
      }),
      bus.on('status-changed', ({ status }) => {
        if (status.kind === 'playing' && status.inCheck) this.queue(CHECK);
      }),
      bus.on('game-over', () => {
        this.queue(OVER);
      }),
    ];
  }

  /**
   * Turns sound on or off. Safe to call before anyone has touched the page:
   * a context that starts suspended is woken by the first click or key.
   */
  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) return;
    this.context ??= makeContext();
    this.wake();
  }

  /** Resumes the context, and if it will not resume yet, waits for a gesture. */
  private wake(): void {
    const context = this.context;
    if (context === null || context.state === 'running') return;

    // `resume` is asynchronous, so the state cannot have changed yet; either it
    // will, or the page has not been touched and the gesture below is needed.
    void context.resume().catch(() => undefined);
    if (this.waking !== null) return;

    const onGesture = (): void => {
      void context.resume().catch(() => undefined);
      this.stopWaiting();
    };
    this.waking = () => {
      window.removeEventListener('pointerdown', onGesture, true);
      window.removeEventListener('keydown', onGesture, true);
    };
    window.addEventListener('pointerdown', onGesture, true);
    window.addEventListener('keydown', onGesture, true);
  }

  private stopWaiting(): void {
    this.waking?.();
    this.waking = null;
  }

  public dispose(): void {
    this.stopWaiting();
    for (const off of this.unsubscribe) off();
    void this.context?.close().catch(() => undefined);
    this.context = null;
  }

  /**
   * Collapses everything asked for in one turn of the event loop into a single
   * sound. Restoring a saved game republishes every move it replays, and forty
   * knocks in a row is not a game resuming, it is a fault.
   */
  private queue(notes: readonly Note[]): void {
    if (!this.enabled) return;
    const first = this.pending === null;
    // A capture outranks a move, and the end of the game outranks both.
    if (this.pending === null || notes.length > this.pending.length) this.pending = notes;
    if (!first) return;
    queueMicrotask(() => {
      const play = this.pending;
      this.pending = null;
      if (play !== null) this.play(play);
    });
  }

  private play(notes: readonly Note[]): void {
    const context = this.context;
    if (context === null || context.state === 'closed') return;
    // Still asleep: nothing would be heard, and the notes would queue up.
    if (context.state !== 'running') {
      this.wake();
      return;
    }

    for (const note of notes) {
      const start = context.currentTime + (note.after ?? 0);
      const oscillator = context.createOscillator();
      oscillator.type = note.type ?? 'sine';
      oscillator.frequency.value = note.hz;

      // A flat tone reads as a beep; the fall is what makes it a knock.
      const envelope = context.createGain();
      const peak = VOLUME * (note.gain ?? 1);
      envelope.gain.setValueAtTime(0.0001, start);
      envelope.gain.exponentialRampToValueAtTime(peak, start + 0.008);
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + note.seconds);

      oscillator.connect(envelope).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + note.seconds + 0.02);
    }
  }
}

function makeContext(): AudioContext | null {
  try {
    return new AudioContext();
  } catch (error: unknown) {
    console.warn('No audio available; the game will stay quiet.', error);
    return null;
  }
}
