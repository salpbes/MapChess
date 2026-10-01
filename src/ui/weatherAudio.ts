// WHAT: The storm's sound: rain, wind that gusts, and thunder.
// HOW:  All of it is noise through filters, like the rest of the game's sound
//       is oscillators through envelopes — nothing to download, nothing to load
//       before it can play. Rain is noise with its rumble cut away, hissing;
//       wind is noise with everything but the low end cut away, its loudness
//       and its pitch drifting on two slow oscillators so it rises and falls in
//       gusts; thunder is a burst of very low noise whose filter closes as it
//       dies, so it cracks and then rolls.
// WHY:  A storm you can see but not hear is a picture of one. Every level here
//       sits under the move knock (0.16): the weather is the room the game is
//       played in, and a player should never have to listen past it to hear
//       that the computer has moved. Thunder alone rises above it, briefly.

import { MEDIUM_RAIN } from '@world/scene/Atmosphere';

/** One noise buffer per context, looped by every source that needs noise. */
const noise = new WeakMap<BaseAudioContext, AudioBuffer>();

function noiseFor(context: BaseAudioContext): AudioBuffer {
  const made = noise.get(context);
  if (made !== undefined) return made;
  const seconds = 3;
  const buffer = context.createBuffer(1, context.sampleRate * seconds, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  noise.set(context, buffer);
  return buffer;
}

/**
 * Brown noise: white noise summed and leaked, so its weight sits in the low
 * end. Thunder is a rumble, and filtered white noise only ever sounds like a
 * louder hiss; this sounds like air moving.
 */
const brown = new WeakMap<BaseAudioContext, AudioBuffer>();

function brownFor(context: BaseAudioContext): AudioBuffer {
  const made = brown.get(context);
  if (made !== undefined) return made;
  const buffer = context.createBuffer(1, context.sampleRate * 4, context.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i += 1) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    data[i] = last * 3.5;
  }
  brown.set(context, buffer);
  return buffer;
}

function looping(context: BaseAudioContext, offset: number): AudioBufferSourceNode {
  const source = context.createBufferSource();
  source.buffer = noiseFor(context);
  source.loop = true;
  source.start(context.currentTime, offset);
  return source;
}

const RAIN = 0.035;
/** The downpour sits a little louder than the steady rain, and still under the move knock. */
const HEAVY_RAIN = 0.07;
const WIND = 0.03;
const GUST = 0.022;
/** Seconds to fade the storm in or out, so it arrives and leaves like weather. */
const FADE = 1.8;

export interface Ambience {
  /** How hard it is raining, MEDIUM_RAIN to 1: crossfades the steady rain into the downpour. */
  setIntensity(intensity: number): void;
  stop(): void;
}

/** Rain and gusting wind until `stop`, fading in and out. */
export function startStorm(context: AudioContext): Ambience {
  const now = context.currentTime;
  const master = context.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(1, now + FADE);
  master.connect(context.destination);

  /*
    Two rains, crossfaded. A steady one: a light, fine hiss, the rumble cut
    away and the top softened. A downpour: louder, and broader — down into the
    low-mids, where rain on a hillside roars rather than hisses. The intensity
    eases between them over several seconds, so the storm sets in and slackens.
  */
  const steadySource = looping(context, 0);
  const steadyHigh = context.createBiquadFilter();
  steadyHigh.type = 'highpass';
  steadyHigh.frequency.value = 1000;
  const steadySoft = context.createBiquadFilter();
  steadySoft.type = 'lowpass';
  steadySoft.frequency.value = 6000;
  const steadyGain = context.createGain();
  steadyGain.gain.value = RAIN;
  steadySource.connect(steadyHigh).connect(steadySoft).connect(steadyGain).connect(master);

  const heavySource = looping(context, 0.7);
  const heavyHigh = context.createBiquadFilter();
  heavyHigh.type = 'highpass';
  heavyHigh.frequency.value = 380;
  const heavyBody = context.createBiquadFilter();
  heavyBody.type = 'peaking';
  heavyBody.frequency.value = 1200;
  heavyBody.gain.value = 4;
  const heavySoft = context.createBiquadFilter();
  heavySoft.type = 'lowpass';
  heavySoft.frequency.value = 9000;
  const heavyGain = context.createGain();
  heavyGain.gain.value = 0;
  heavySource
    .connect(heavyHigh)
    .connect(heavyBody)
    .connect(heavySoft)
    .connect(heavyGain)
    .connect(master);

  // Wind: only the low end, its loudness and pitch both drifting in gusts.
  const windSource = looping(context, 1.3);
  const windTone = context.createBiquadFilter();
  windTone.type = 'lowpass';
  windTone.frequency.value = 420;
  windTone.Q.value = 0.9;
  const windGain = context.createGain();
  windGain.gain.value = WIND;
  windSource.connect(windTone).connect(windGain).connect(master);

  const gustLoud = context.createOscillator();
  gustLoud.frequency.value = 0.09;
  const gustLoudDepth = context.createGain();
  gustLoudDepth.gain.value = GUST;
  gustLoud.connect(gustLoudDepth).connect(windGain.gain);

  const gustPitch = context.createOscillator();
  gustPitch.frequency.value = 0.053;
  const gustPitchDepth = context.createGain();
  gustPitchDepth.gain.value = 240;
  gustPitch.connect(gustPitchDepth).connect(windTone.frequency);
  gustLoud.start(now);
  gustPitch.start(now);

  return {
    setIntensity: (intensity) => {
      // 0 at a steady rain, 1 in a downpour.
      const heavy = Math.min(1, Math.max(0, (intensity - MEDIUM_RAIN) / (1 - MEDIUM_RAIN)));
      const t = context.currentTime;
      // Eased toward, not jumped to: the time constant smooths the steps of a
      // value that arrives a few times a second.
      steadyGain.gain.setTargetAtTime(RAIN * (1 - 0.6 * heavy), t, 0.4);
      heavyGain.gain.setTargetAtTime(HEAVY_RAIN * heavy, t, 0.4);
    },
    stop: () => {
      const t = context.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), t);
      master.gain.exponentialRampToValueAtTime(0.0001, t + FADE);
      for (const node of [steadySource, heavySource, windSource, gustLoud, gustPitch]) {
        node.stop(t + FADE + 0.05);
      }
    },
  };
}

/**
 * Thunder after a strike, `delaySeconds` later: the crack, then the roll, the
 * way the sound reaches you after the light from a storm a mile or so off.
 */
export function playThunder(context: AudioContext, delaySeconds: number): void {
  const start = context.currentTime + delaySeconds;
  for (const [after, peak, seconds] of [
    [0, 0.3, 3.2],
    [0.35, 0.18, 2.4],
  ] as const) {
    const at = start + after;
    const source = context.createBufferSource();
    source.buffer = noiseFor(context);
    const tone = context.createBiquadFilter();
    tone.type = 'lowpass';
    // Opens with a crack and closes into a rumble.
    tone.frequency.setValueAtTime(900, at);
    tone.frequency.exponentialRampToValueAtTime(90, at + seconds * 0.8);
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(peak, at + 0.08);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
    source.connect(tone).connect(envelope).connect(context.destination);
    source.start(at, Math.random() * 1.5);
    source.stop(at + seconds + 0.1);
  }
}

/**
 * Thunder close by: no gap after the light, and a sound that rolls rather
 * than snaps. The first attempt was a crack of bright noise with no attack
 * at all, and the author was right that it did not sound like thunder —
 * close thunder is a huge, rough rumble that swells in over a tenth of a
 * second and rolls away in waves as the sound arrives from farther and
 * farther along the bolt. So: five overlapping rumbles of brown noise, each
 * starting brighter and closing down into the low end, each later one
 * quieter, under a deep body that carries the whole roll for six seconds.
 * A compressor holds the sum together, so it is loud without clipping.
 */
export function playNearThunder(context: AudioContext, delaySeconds = 0.1): void {
  const at = context.currentTime + delaySeconds;
  const bus = context.createDynamicsCompressor();
  bus.threshold.value = -16;
  bus.ratio.value = 3.5;
  bus.attack.value = 0.02;
  bus.release.value = 0.6;
  bus.connect(context.destination);

  const rumble = (
    after: number,
    peak: number,
    attack: number,
    seconds: number,
    from: number,
  ): void => {
    const start = at + after;
    const source = context.createBufferSource();
    source.buffer = brownFor(context);
    const tone = context.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.setValueAtTime(from, start);
    tone.frequency.exponentialRampToValueAtTime(110, start + seconds * 0.85);
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(peak, start + attack);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
    source.connect(tone).connect(envelope).connect(bus);
    source.start(start, Math.random() * 2.5);
    source.stop(start + seconds + 0.1);
  };

  // The roll: each wave from a little farther along the bolt.
  rumble(0, 0.5, 0.12, 2.6, 1500);
  rumble(0.45, 0.42, 0.1, 2.4, 1200);
  rumble(1.1, 0.34, 0.12, 2.6, 900);
  rumble(1.9, 0.24, 0.14, 2.8, 700);
  rumble(2.9, 0.15, 0.18, 3, 520);
  // The body: deep, and slow to leave.
  rumble(0.05, 0.3, 0.25, 6, 160);
}
