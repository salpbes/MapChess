// WHAT: The sound of a piece landing on the ground it lands on — a soft thud on
//       grass, a crunch on sand, a splash in water, leaves in a wood, dry brush
//       on scrub — and a heavier one when it lands on a capture.
// HOW:  Short shaped bursts of noise, one recipe per kind of ground, played
//       under the move's own knock rather than instead of it: the knock says
//       "a move", and the ground says where. Noise only, like the storm, so
//       there is nothing to download.
// WHY:  The board already knows what every square is — grass, wood, water,
//       sand, scrub — and until now a move sounded the same everywhere. A
//       pawn wading into a river and a pawn stepping onto a beach are
//       different things, and the ground is the point of this game.
//
//       All of it sits under the knock (0.16): a ground sound that drowned
//       the move would tell a player less, not more.

import type { CoverName } from '@domain/theme/types';

const noise = new WeakMap<BaseAudioContext, AudioBuffer>();

function noiseFor(context: BaseAudioContext): AudioBuffer {
  const made = noise.get(context);
  if (made !== undefined) return made;
  const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  noise.set(context, buffer);
  return buffer;
}

interface Burst {
  readonly filter: BiquadFilterType;
  /** Filter frequency at the start and the end of the burst. */
  readonly from: number;
  readonly to: number;
  readonly q?: number;
  readonly peak: number;
  readonly attack: number;
  readonly seconds: number;
  /** Delay after the landing, for a sound of more than one part. */
  readonly after?: number;
}

/** One recipe per kind of ground. */
const GROUND: Readonly<Record<CoverName, readonly Burst[]>> = {
  // A muffled thump into turf.
  grass: [{ filter: 'lowpass', from: 520, to: 180, peak: 0.09, attack: 0.004, seconds: 0.13 }],
  // Grit: a bright, rough burst with a second, smaller settle after it.
  sand: [
    { filter: 'bandpass', from: 2600, to: 1800, q: 0.8, peak: 0.07, attack: 0.003, seconds: 0.12 },
    {
      filter: 'bandpass',
      from: 3200,
      to: 2200,
      q: 0.9,
      peak: 0.035,
      attack: 0.004,
      seconds: 0.1,
      after: 0.07,
    },
  ],
  // A splash that falls in pitch, and the slap of the water closing.
  water: [
    { filter: 'bandpass', from: 1800, to: 500, q: 1.1, peak: 0.1, attack: 0.008, seconds: 0.32 },
    {
      filter: 'lowpass',
      from: 700,
      to: 200,
      peak: 0.06,
      attack: 0.004,
      seconds: 0.12,
      after: 0.03,
    },
  ],
  // Leaf litter: a soft high rustle, and a small twig.
  wood: [
    { filter: 'highpass', from: 2500, to: 3500, peak: 0.04, attack: 0.01, seconds: 0.2 },
    {
      filter: 'bandpass',
      from: 1400,
      to: 1100,
      q: 3,
      peak: 0.05,
      attack: 0.002,
      seconds: 0.04,
      after: 0.03,
    },
  ],
  // Dry brush: a short, papery scrape.
  scrub: [
    { filter: 'bandpass', from: 1900, to: 1300, q: 1.2, peak: 0.06, attack: 0.006, seconds: 0.16 },
  ],
};

/**
 * The ground a piece just landed on. `heavy` for a capture: the same ground,
 * louder and longer, because something fell on it as well.
 */
export function playGround(context: AudioContext, cover: CoverName, heavy: boolean): void {
  const start = context.currentTime;
  const loud = heavy ? 1.7 : 1;
  const long = heavy ? 1.5 : 1;
  for (const burst of GROUND[cover]) {
    const at = start + (burst.after ?? 0);
    const source = context.createBufferSource();
    source.buffer = noiseFor(context);
    const filter = context.createBiquadFilter();
    filter.type = burst.filter;
    if (burst.q !== undefined) filter.Q.value = burst.q;
    filter.frequency.setValueAtTime(burst.from, at);
    filter.frequency.exponentialRampToValueAtTime(burst.to, at + burst.seconds * long);
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(burst.peak * loud, at + burst.attack);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + burst.seconds * long);
    source.connect(filter).connect(envelope).connect(context.destination);
    source.start(at, Math.random() * 0.8);
    source.stop(at + burst.seconds * long + 0.05);
  }
}
