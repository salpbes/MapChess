// WHAT: The sound of a misty morning: a low hush of still air, water dripping
//       from wet grass and leaves close by, and now and then one sound from
//       far off, softened by the mist — a foghorn out at sea on a board by the
//       water, a curlew or a crow inland.
// HOW:  Synthesised like the other weathers (see fairAudio for the notes).
//       The hush is noise with everything but its lowest end cut away. A drip
//       is a tiny sine that drops in pitch in a few hundredths of a second,
//       with a tick of noise on its front. The far sounds go through a low-pass
//       filter set well down, which is what distance and wet air do to a sound:
//       they take the top off it.
// WHY:  Mist was the one weather left silent, and silence on a board reads as
//       the sound being off. Mist muffles, so the answer is quiet, not nothing:
//       the near sounds small and close, the far ones dull and few. All of it
//       sits under the move knock (0.16).

import { jitter, note, noiseFor } from './fairAudio';

const HUSH = 0.009;
const FADE = 2.4;

export interface MistSound {
  stop(): void;
}

/** A drop of water from a leaf: a quick falling "plip". */
function drip(context: AudioContext, out: AudioNode, at: number, loud: number): void {
  const pitch = jitter(2400, 0.5);
  note(context, out, {
    at,
    from: pitch,
    peak: pitch * 1.05,
    to: pitch * 0.55,
    rise: 0.004,
    seconds: jitter(0.05, 0.4),
    loud,
    wave: 'sine',
    band: pitch,
    q: 0.6,
  });
  // The tick of it landing.
  const start = context.currentTime + at;
  const source = context.createBufferSource();
  source.buffer = noiseFor(context);
  const high = context.createBiquadFilter();
  high.type = 'highpass';
  high.frequency.value = 3000;
  const envelope = context.createGain();
  envelope.gain.setValueAtTime(loud * 0.5, start);
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + 0.015);
  source.connect(high).connect(envelope).connect(out);
  source.start(start, Math.random() * 2);
  source.stop(start + 0.03);
}

/** A foghorn far out at sea: one long, low note that drops at its end. */
function foghorn(context: AudioContext, out: AudioNode): void {
  for (const [ratio, loud] of [
    [1, 0.03],
    [1.5, 0.012],
  ] as const) {
    const pitch = 92 * ratio;
    note(context, out, {
      at: 0,
      from: pitch * 0.97,
      peak: pitch,
      to: pitch * 0.82,
      rise: 0.5,
      seconds: jitter(2.8, 0.15),
      loud,
      wave: 'sawtooth',
      // Muffled: only the low body of it carries this far.
      band: 260,
      q: 0.7,
    });
  }
}

/** A curlew far off: its rising, bubbling "coor-lee", dulled by the mist. */
function curlew(context: AudioContext, out: AudioNode): void {
  const base = jitter(1500, 0.1);
  for (let i = 0; i < 2; i += 1) {
    note(context, out, {
      at: i * jitter(0.7, 0.2),
      from: base,
      peak: base * 1.45,
      to: base * 1.3,
      rise: 0.45,
      seconds: 0.6,
      loud: 0.016,
      wave: 'sine',
      band: 1400,
      q: 0.5,
      wobble: 60,
      wobbleRate: 14,
    });
  }
}

/** A crow far off, once or twice, dulled by the mist. */
function crow(context: AudioContext, out: AudioNode): void {
  const caws = 1 + Math.floor(Math.random() * 2);
  for (let i = 0; i < caws; i += 1) {
    const base = jitter(520, 0.1);
    note(context, out, {
      at: i * jitter(0.6, 0.2),
      from: base,
      peak: base * 1.05,
      to: base * 0.8,
      rise: 0.05,
      seconds: 0.3,
      loud: 0.02,
      wave: 'sawtooth',
      band: 700,
      q: 0.8,
      wobble: 70,
      wobbleRate: 60,
    });
  }
}

/** The mist's sound until `stop`, fading in and out. */
export function startMist(context: AudioContext, shore: boolean): MistSound {
  const now = context.currentTime;
  const master = context.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(1, now + FADE);
  master.connect(context.destination);

  // The hush: the lowest end of the air, barely moving.
  const source = context.createBufferSource();
  source.buffer = noiseFor(context);
  source.loop = true;
  source.start(now, 0.9);
  const dull = context.createBiquadFilter();
  dull.type = 'lowpass';
  dull.frequency.value = 170;
  const hush = context.createGain();
  hush.gain.value = HUSH;
  source.connect(dull).connect(hush).connect(master);
  const breath = context.createOscillator();
  breath.frequency.value = 0.05;
  const breathDepth = context.createGain();
  breathDepth.gain.value = HUSH * 0.4;
  breath.connect(breathDepth).connect(hush.gain);
  breath.start(now);

  // Pending timers only, each removing itself as it fires; none once stopped.
  const timers = new Set<number>();
  let stopped = false;
  const later = (seconds: number, run: () => void): void => {
    if (stopped) return;
    const id = window.setTimeout(() => {
      timers.delete(id);
      run();
    }, seconds * 1000);
    timers.add(id);
  };

  const drips = (): void => {
    if (context.state === 'running') {
      drip(context, master, 0, jitter(0.02, 0.8));
      // Often a second, from the same leaf.
      if (Math.random() < 0.35) drip(context, master, jitter(0.25, 0.6), jitter(0.012, 0.8));
    }
    later(0.8 + Math.random() * 3.2, drips);
  };
  later(1 + Math.random() * 2, drips);

  const far = (): void => {
    if (context.state === 'running') {
      if (shore) foghorn(context, master);
      else if (Math.random() < 0.6) curlew(context, master);
      else crow(context, master);
    }
    later(18 + Math.random() * 22, far);
  };
  // The first soon after the mist comes down, so a player hears what it is.
  later(5 + Math.random() * 4, far);

  return {
    stop: () => {
      stopped = true;
      for (const timer of timers) window.clearTimeout(timer);
      timers.clear();
      const t = context.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), t);
      master.gain.exponentialRampToValueAtTime(0.0001, t + FADE);
      source.stop(t + FADE + 0.05);
      breath.stop(t + FADE + 0.05);
    },
  };
}
