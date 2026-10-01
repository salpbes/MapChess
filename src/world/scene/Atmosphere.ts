// WHAT: The weather over the board — midday, mist or storm: the sky behind it,
//       the sun's angle, colour and strength, the fill light, and the fog.
// HOW:  One table of moods and one function that applies a mood to the scene
//       and its light rig. WorldStage keeps the current mood and applies it
//       again whenever the rig is rebuilt for a new board, so a mood survives
//       every reframe. The sky is a vertical gradient set as the scene's
//       background; the fog is distance fog sized by the board's width.
// WHY:  Every board was lit by the same high sun against a flat dark void, and
//       the ground — the game's whole subject — read as a model on a table.
//       A sky makes it a landscape. A prototype tried four moods on Glencoe;
//       the author kept three, and dropped golden evening, which tinted both
//       armies orange until White and Black were harder to tell apart.
//
//       That is the constraint every mood here answers to: the two sides must
//       stay distinct. Storm is deliberately lighter than the prototype's,
//       which let Black's pieces sink into a dark board. And fog is kept off
//       the move highlights and the coordinates — see their materials — so
//       weather can blur the far hills but never where a piece can go.

import {
  CanvasTexture,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  SRGBColorSpace,
  Vector2,
} from 'three';
import type { Object3D, Scene } from 'three';

import type { BoardBounds } from '@domain/board/types';

export type Mood = 'midday' | 'mist' | 'storm';

/** The order the weather button steps through them. */
export const MOODS: readonly Mood[] = ['midday', 'mist', 'storm'];

interface MoodDef {
  /** Degrees above the horizon. */
  readonly elevation: number;
  /** Compass bearing the sun shines FROM: 0 north, 90 east, 180 south. */
  readonly azimuth: number;
  readonly sun: string;
  readonly sunPower: number;
  readonly skyTop: string;
  readonly skyLow: string;
  readonly ground: string;
  readonly hemiPower: number;
  readonly fillPower: number;
  /** Fog as multiples of the board's width: where it begins, where it is total. */
  readonly fog: { readonly color: string; readonly near: number; readonly far: number };
  /** 0 is still air, 1 a gale: bends the trees and slants the rain. */
  readonly wind: number;
  readonly rain: boolean;
  /** Lightning, and the thunder after it. */
  readonly thunder: boolean;
}

/**
 * The clock and the wind, shared by everything the weather moves — the rain's
 * shader and the trees' — so they agree on which way it is blowing. Uniform
 * objects, so a shader that holds one sees every change without being told.
 */
export const weather = {
  time: { value: 0 },
  wind: { value: 0 },
  /** How hard it is raining, MEDIUM_RAIN to 1; the rain's shader thins its drops by it. */
  rain: { value: 1 },
  // From the west-north-west, across the board from White's left.
  windDir: { value: new Vector2(1, 0.3).normalize() },
};

export function windFor(mood: Mood): number {
  return MOOD[mood].wind;
}

export function rainsIn(mood: Mood): boolean {
  return MOOD[mood].rain;
}

export function thundersIn(mood: Mood): boolean {
  return MOOD[mood].thunder;
}

/**
 * The wind's direction at a moment, as a unit vector in the board's x/z.
 *
 * It swings — far enough that the rain, which leans the way the wind blows,
 * leans to one side of the screen and then comes round to lean the other.
 * The first version veered only fifty degrees, mostly toward and away from
 * the camera where a change is foreshortened to nothing; its east-west part
 * never left 0.59–1.00 in two minutes, so on screen the rain always leaned
 * the same way and the author, watching for two minutes, saw no change at
 * all. Waves of unrelated period, fifty, seventeen and twenty-three seconds,
 * so it never visibly repeats.
 */
export function windDirectionAt(seconds: number): { x: number; z: number } {
  /*
    The rain leans on screen only with the wind's east-west part; blowing
    toward or away from the camera it looks straight down. A wind that swings
    evenly through every bearing spends much of its time on that line, and the
    second version did: two screenshots a quarter-minute apart both caught it
    there, and both showed upright rain. So the swing dwells where it shows —
    blowing east, or blowing west — and crosses the camera's line in a few
    seconds, the way a squall shifts the wind.
  */
  const swing =
    Math.sin((seconds * 2 * Math.PI) / 50) + 0.35 * Math.sin((seconds * 2 * Math.PI) / 17 + 1.3);
  const side = Math.tanh(1.5 * swing); // −1 blowing west … +1 blowing east, mostly near the ends
  const angle = Math.PI / 2 - (Math.PI / 2) * side + 0.25 * Math.sin((seconds * 2 * Math.PI) / 23);
  return { x: Math.cos(angle), z: Math.sin(angle) };
}

/**
 * How much of the mood's wind is blowing at a moment, 0.56 to 1: gusts. The
 * rain flattens in a gust and stands straighter in a lull.
 */
export function gustAt(seconds: number): number {
  return (
    0.78 +
    0.15 * Math.sin((seconds * 2 * Math.PI) / 11) +
    0.07 * Math.sin((seconds * 2 * Math.PI) / 4.3 + 0.7)
  );
}

/**
 * How bright one lightning strike is, 0 to 1, at `seconds` after it began.
 *
 * Two flickers and done, inside a third of a second. Flashing light can bring
 * on a seizure in someone photosensitive, and the accessibility guideline is
 * no more than three flashes in any one second; a strike here is two, the
 * scheduler leaves several seconds between strikes, and the brightening is a
 * lift of the scene's light rather than a white screen. Anyone whose device
 * asks for reduced motion gets none at all.
 */
export const STRIKE_SECONDS = 0.32;

/**
 * The fewest seconds between any two strikes, so two strikes can never add
 * up to a run of flashes: each is two flickers inside a third of a second, and
 * a second apart keeps every one-second window under three.
 */
export const MIN_STRIKE_GAP_SECONDS = 2;

export interface Strike {
  /** Seconds after the episode began. */
  readonly at: number;
  /** Close: lit harder and heard at once. Far: dimmer, and heard later. */
  readonly near: boolean;
}

/**
 * One burst of the storm, as the author asked for it: a strike close by, and
 * ten to fifteen seconds later two far off, a few seconds apart. `random` is
 * passed in, so the shape is testable and the game's own `Math.random` makes
 * every episode a little different.
 */
export function thunderEpisode(random: () => number = Math.random): readonly Strike[] {
  const firstFar = 10 + random() * 5;
  const secondFar = firstFar + MIN_STRIKE_GAP_SECONDS + random() * 2;
  return [
    { at: 0, near: true },
    { at: firstFar, near: false },
    { at: secondFar, near: false },
  ];
}

/** Quiet after an episode before the next one begins, in seconds. */
export const EPISODE_REST_SECONDS = { min: 14, max: 26 } as const;

/**
 * How hard it is raining, 0.55 (a steady medium rain) to 1 (a downpour). It
 * dwells at one or the other and eases between them over several seconds, so
 * the storm sets in and slackens rather than flickering. The rain's sound and
 * the drops on screen both follow it.
 */
export const MEDIUM_RAIN = 0.55;
export function rainIntensityAt(seconds: number): number {
  const wave =
    Math.sin((seconds * 2 * Math.PI) / 70) + 0.3 * Math.sin((seconds * 2 * Math.PI) / 29 + 0.8);
  const t = Math.min(1, Math.max(0, (wave + 0.35) / 0.7));
  const heavy = t * t * (3 - 2 * t);
  return MEDIUM_RAIN + (1 - MEDIUM_RAIN) * heavy;
}
export function lightningAt(seconds: number): number {
  if (seconds < 0 || seconds > STRIKE_SECONDS) return 0;
  // First flicker: sharp and short.
  if (seconds < 0.06) return seconds / 0.06;
  if (seconds < 0.13) return 1 - (seconds - 0.06) / 0.07;
  // A dark gap, then the brighter second flicker that fades away.
  if (seconds < 0.17) return 0;
  if (seconds < 0.2) return (seconds - 0.17) / 0.03;
  return Math.max(0, 1 - (seconds - 0.2) / 0.12);
}

const MOOD: Readonly<Record<Mood, MoodDef>> = {
  // The old rig's sun, now with a sky behind it, and a haze so faint it only
  // softens the farthest ground.
  midday: {
    elevation: 58,
    azimuth: 200,
    sun: '#fff4e0',
    sunPower: 2.2,
    skyTop: '#5d8fc9',
    skyLow: '#cfe0f0',
    ground: '#6b6355',
    hemiPower: 1.05,
    fillPower: 0.75,
    fog: { color: '#cfe0f0', near: 2.2, far: 6 },
    // A light breeze: enough that the woods are alive, not enough to notice.
    wind: 0.18,
    rain: false,
    thunder: false,
  },
  // A low morning sun from the east through pale fog: the far side fades and
  // the near pieces stand out, which plays as well as it looks.
  mist: {
    elevation: 9,
    azimuth: 95,
    sun: '#f2efe6',
    sunPower: 1.4,
    skyTop: '#aab4bd',
    skyLow: '#dfe3e3',
    ground: '#7a7a72',
    hemiPower: 1.25,
    fillPower: 0.5,
    fog: { color: '#d9dedd', near: 0.9, far: 3.1 },
    // Mist lies where the air is still.
    wind: 0,
    rain: false,
    thunder: false,
  },
  // Overcast and grey, but lit enough from the sky that a black piece on a
  // dark square is still a black piece.
  storm: {
    elevation: 32,
    azimuth: 300,
    sun: '#d6dde6',
    sunPower: 1.3,
    skyTop: '#3a424d',
    skyLow: '#7c8691',
    ground: '#4a4a44',
    hemiPower: 1.4,
    fillPower: 0.7,
    fog: { color: '#6f7883', near: 1.5, far: 4.6 },
    wind: 1,
    rain: true,
    thunder: true,
  },
};

const skies = new Map<Mood, CanvasTexture>();

/** A two-pixel-wide vertical gradient, made once per mood and kept. */
function sky(mood: Mood): CanvasTexture {
  const made = skies.get(mood);
  if (made !== undefined) return made;
  const { skyTop, skyLow } = MOOD[mood];
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('2D canvas unavailable');
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, skyTop);
  gradient.addColorStop(1, skyLow);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  skies.set(mood, texture);
  return texture;
}

/**
 * Applies a mood to the scene and to the light rig createLights built: the
 * shadow-casting light is the sun, the other directional is the fill.
 */
export function applyMood(scene: Scene, rig: Object3D, bounds: BoardBounds, mood: Mood): void {
  const m = MOOD[mood];
  const width = bounds.maxX - bounds.minX;
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;
  const elevation = (m.elevation * Math.PI) / 180;
  const azimuth = (m.azimuth * Math.PI) / 180;
  const reach = width * 1.6;

  rig.traverse((node) => {
    if (node instanceof HemisphereLight) {
      node.color.set(m.skyLow);
      node.groundColor.set(m.ground);
      node.intensity = m.hemiPower;
    } else if (node instanceof DirectionalLight && node.castShadow) {
      // Board frame: −Z is north, +X is east.
      node.position.set(
        cx + Math.sin(azimuth) * Math.cos(elevation) * reach,
        bounds.maxY + Math.sin(elevation) * reach,
        cz - Math.cos(azimuth) * Math.cos(elevation) * reach,
      );
      node.color.set(m.sun);
      node.intensity = m.sunPower;
    } else if (node instanceof DirectionalLight) {
      node.intensity = m.fillPower;
    }
  });

  scene.background = sky(mood);
  /*
    One fog, changed in place, never replaced. three compares the scene's fog
    by identity when it decides whether a material's shader is still right, so
    a new Fog object recompiles every program in the scene — and the lightning
    reapplies the mood every frame of a strike. That recompiled the whole board
    twenty times a strike, which froze software-rendered browsers outright and
    would have stuttered on any machine.
  */
  if (scene.fog instanceof Fog) {
    scene.fog.color.set(m.fog.color);
    scene.fog.near = width * m.fog.near;
    scene.fog.far = width * m.fog.far;
  } else {
    scene.fog = new Fog(new Color(m.fog.color), width * m.fog.near, width * m.fog.far);
  }
}
