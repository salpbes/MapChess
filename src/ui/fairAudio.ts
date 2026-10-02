// WHAT: The sound of a fine day: a soft breeze, birdsong now and then — or, on
//       a board by the water, waves lapping and a gull far off — and the call
//       of the birds that fly over: gulls by the water, rooks inland, and the
//       mewing of a buzzard as it circles.
// HOW:  Synthesised like the storm, with nothing to download. The breeze is
//       noise with all but its low end cut, rising and falling slowly; the
//       waves are the same noise a little brighter, swelling in and drawing
//       back every several seconds. Calls are oscillators through filters,
//       their pitch shaped the way the bird's is: a gull's "kee-ow" climbs and
//       falls, a rook's caw is a rough, dropping burst, a buzzard's mew a long
//       falling whistle. Songbirds are quick high chirps in little runs.
// WHY:  Midday was the one weather with no sound at all, so the board went
//       silent the moment the storm cleared. A fine day is not silent; it is
//       quiet. Everything here sits well under the move knock (0.16), the
//       steady part of it under even the storm's rain: it is the room the game
//       is played in on a good day, and a player should hardly notice it until
//       it stops.

import type { Visit } from '@world/scene/Birds';

const noise = new WeakMap<BaseAudioContext, AudioBuffer>();

export function noiseFor(context: BaseAudioContext): AudioBuffer {
  const made = noise.get(context);
  if (made !== undefined) return made;
  const buffer = context.createBuffer(1, context.sampleRate * 3, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  noise.set(context, buffer);
  return buffer;
}

const BREEZE = 0.012;
const WAVES = 0.03;
/** Seconds to fade the day in or out. */
const FADE = 2.4;

export interface FairDay {
  /** The call of the birds flying over. */
  call(kind: Visit): void;
  stop(): void;
}

/** One note of a call: a pitch path, a tone, a loudness, a length. */
export interface Note {
  readonly at: number;
  readonly from: number;
  readonly peak: number;
  readonly to: number;
  /** Seconds to reach the peak pitch, and the note's whole length. */
  readonly rise: number;
  readonly seconds: number;
  readonly loud: number;
  readonly wave: OscillatorType;
  readonly band: number;
  readonly q: number;
  /** Fast pitch wobble, in Hz of depth: a warble, or a rasp. */
  readonly wobble?: number;
  readonly wobbleRate?: number;
}

export function note(context: AudioContext, out: AudioNode, n: Note): void {
  const start = context.currentTime + n.at;
  const end = start + n.seconds;
  const osc = context.createOscillator();
  osc.type = n.wave;
  osc.frequency.setValueAtTime(n.from, start);
  osc.frequency.exponentialRampToValueAtTime(n.peak, start + n.rise);
  osc.frequency.exponentialRampToValueAtTime(n.to, end);
  const band = context.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = n.band;
  band.Q.value = n.q;
  const envelope = context.createGain();
  envelope.gain.setValueAtTime(0.0001, start);
  envelope.gain.exponentialRampToValueAtTime(n.loud, start + Math.min(0.04, n.seconds * 0.3));
  envelope.gain.exponentialRampToValueAtTime(0.0001, end);
  osc.connect(band).connect(envelope).connect(out);
  const stops: AudioScheduledSourceNode[] = [osc];
  if (n.wobble !== undefined) {
    const lfo = context.createOscillator();
    lfo.frequency.value = n.wobbleRate ?? 30;
    const depth = context.createGain();
    depth.gain.value = n.wobble;
    lfo.connect(depth).connect(osc.frequency);
    stops.push(lfo);
  }
  for (const node of stops) {
    node.start(start);
    node.stop(end + 0.05);
  }
}

export const jitter = (value: number, by: number): number =>
  value * (1 + (Math.random() - 0.5) * by);

/** A gull, "kee-ow", two to four times. */
function gulls(context: AudioContext, out: AudioNode, loud: number): void {
  const calls = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < calls; i += 1) {
    const base = jitter(1350, 0.15);
    note(context, out, {
      at: i * jitter(0.55, 0.3),
      from: base,
      peak: base * 1.45,
      to: base * 0.78,
      rise: 0.09,
      seconds: jitter(0.42, 0.2),
      loud: jitter(loud, 0.3),
      wave: 'sawtooth',
      band: 1900,
      q: 1.4,
      wobble: 40,
      wobbleRate: 22,
    });
  }
}

/** Rooks: a rough, dropping caw, once to three times. */
function rooks(context: AudioContext, out: AudioNode, loud: number): void {
  const caws = 1 + Math.floor(Math.random() * 3);
  for (let i = 0; i < caws; i += 1) {
    const base = jitter(560, 0.15);
    note(context, out, {
      at: i * jitter(0.5, 0.3),
      from: base,
      peak: base * 1.05,
      to: base * 0.8,
      rise: 0.04,
      seconds: jitter(0.28, 0.2),
      loud: jitter(loud, 0.3),
      wave: 'sawtooth',
      band: 1150,
      q: 0.9,
      // The rasp.
      wobble: 90,
      wobbleRate: 70,
    });
  }
}

/** A buzzard's mew: a long, falling "pee-oo", twice. */
function buzzard(context: AudioContext, out: AudioNode, loud: number): void {
  for (let i = 0; i < 2; i += 1) {
    const base = jitter(2300, 0.08);
    note(context, out, {
      at: i * jitter(1.9, 0.2),
      from: base * 0.92,
      peak: base,
      to: base * 0.62,
      rise: 0.12,
      seconds: jitter(0.95, 0.15),
      loud,
      wave: 'triangle',
      band: 2000,
      q: 0.8,
      wobble: 18,
      wobbleRate: 9,
    });
  }
}

/** A songbird somewhere in the hedges: a short run of quick high chirps. */
function chirps(context: AudioContext, out: AudioNode): void {
  const count = 3 + Math.floor(Math.random() * 6);
  const base = jitter(3800, 0.3);
  let at = 0;
  for (let i = 0; i < count; i += 1) {
    const up = Math.random() < 0.5;
    const pitch = jitter(base, 0.15);
    note(context, out, {
      at,
      from: up ? pitch * 0.8 : pitch * 1.15,
      peak: pitch,
      to: up ? pitch * 1.2 : pitch * 0.85,
      rise: 0.02,
      seconds: jitter(0.07, 0.4),
      loud: jitter(0.018, 0.4),
      wave: 'sine',
      band: pitch,
      q: 0.7,
    });
    at += jitter(0.11, 0.4);
  }
}

/**
 * A fine day's sound until `stop`, fading in and out. `shore` for a board with
 * a lot of water on it: waves and gulls instead of hedgerow birds.
 */
export function startFairDay(context: AudioContext, shore: boolean): FairDay {
  const now = context.currentTime;
  const master = context.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(1, now + FADE);
  master.connect(context.destination);

  const sources: AudioScheduledSourceNode[] = [];
  const loop = (offset: number): AudioBufferSourceNode => {
    const source = context.createBufferSource();
    source.buffer = noiseFor(context);
    source.loop = true;
    source.start(now, offset);
    sources.push(source);
    return source;
  };

  // The breeze: low, soft, rising and falling slowly.
  const breezeTone = context.createBiquadFilter();
  breezeTone.type = 'lowpass';
  breezeTone.frequency.value = 320;
  const breezeGain = context.createGain();
  breezeGain.gain.value = BREEZE;
  loop(0.4).connect(breezeTone).connect(breezeGain).connect(master);
  const sway = context.createOscillator();
  sway.frequency.value = 0.07;
  const swayDepth = context.createGain();
  swayDepth.gain.value = BREEZE * 0.7;
  sway.connect(swayDepth).connect(breezeGain.gain);
  sway.start(now);
  sources.push(sway);

  // Waves, by the water: swelling in, drawing back.
  let waveGain: GainNode | null = null;
  if (shore) {
    const waveTone = context.createBiquadFilter();
    waveTone.type = 'lowpass';
    waveTone.frequency.value = 750;
    waveGain = context.createGain();
    waveGain.gain.value = 0.0001;
    loop(1.7).connect(waveTone).connect(waveGain).connect(master);
  }

  // Pending timers only: each removes itself as it fires, so a long game does
  // not collect thousands, and nothing is scheduled again once stopped.
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

  const wave = (): void => {
    if (waveGain === null) return;
    const t = context.currentTime;
    const peak = jitter(WAVES, 0.5);
    waveGain.gain.setTargetAtTime(peak, t, 0.7);
    waveGain.gain.setTargetAtTime(WAVES * 0.15, t + jitter(2.2, 0.3), 1.1);
    later(jitter(6.5, 0.4), wave);
  };
  wave();

  // Now and then, a bird nearby: a songbird inland, a far gull by the water.
  const song = (): void => {
    if (context.state === 'running') {
      if (shore) {
        if (Math.random() < 0.5) gulls(context, master, 0.012);
      } else {
        chirps(context, master);
      }
    }
    later(jitter(shore ? 11 : 6, 0.7), song);
  };
  later(2 + Math.random() * 3, song);

  return {
    call: (kind) => {
      if (context.state !== 'running') return;
      if (kind === 'soarer') buzzard(context, master, 0.035);
      else if (shore) gulls(context, master, 0.045);
      else rooks(context, master, 0.04);
    },
    stop: () => {
      stopped = true;
      for (const timer of timers) window.clearTimeout(timer);
      timers.clear();
      const t = context.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), t);
      master.gain.exponentialRampToValueAtTime(0.0001, t + FADE);
      for (const node of sources) node.stop(t + FADE + 0.05);
    },
  };
}
