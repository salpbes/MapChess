// WHAT: The storm's lightning and its wind.
// WHY:  Flashing light can bring on a seizure in someone photosensitive. The
//       guideline is no more than three flashes in any one second, and the
//       limits that keep the storm inside it — two flickers a strike, strikes
//       several seconds apart — are pinned here, where a tweak to make the
//       lightning more dramatic cannot quietly break them.

import { describe, expect, it } from 'vitest';

import {
  MEDIUM_RAIN,
  MIN_STRIKE_GAP_SECONDS,
  STRIKE_SECONDS,
  rainIntensityAt,
  thunderEpisode,
  gustAt,
  lightningAt,
  windDirectionAt,
} from '@world/scene/Atmosphere';

/** Separate flashes in a stretch of time: each rise past half brightness counts once. */
function flashesIn(from: number, to: number, step = 0.001): number {
  let count = 0;
  let lit = false;
  for (let t = from; t <= to; t += step) {
    const now = lightningAt(t) > 0.5;
    if (now && !lit) count += 1;
    lit = now;
  }
  return count;
}

describe('lightning', () => {
  it('is two flickers, then gone, inside a third of a second', () => {
    expect(flashesIn(0, STRIKE_SECONDS)).toBe(2);
    expect(STRIKE_SECONDS).toBeLessThan(0.34);
    expect(lightningAt(-0.01)).toBe(0);
    expect(lightningAt(STRIKE_SECONDS + 0.01)).toBe(0);
  });

  it('never brightens past full, nor below dark', () => {
    for (let t = 0; t <= STRIKE_SECONDS; t += 0.002) {
      expect(lightningAt(t)).toBeGreaterThanOrEqual(0);
      expect(lightningAt(t)).toBeLessThanOrEqual(1);
    }
  });

  it('stays under three flashes in any second, even if strikes came as close as they can', () => {
    // A strike, then the next at the shortest gap the scheduler allows.
    const gap = MIN_STRIKE_GAP_SECONDS;
    expect(gap).toBeGreaterThanOrEqual(1);
    const twoStrikes = (t: number) => lightningAt(t) + lightningAt(t - gap);
    for (let start = 0; start < gap + 1; start += 0.05) {
      let count = 0;
      let lit = false;
      for (let t = start; t <= start + 1; t += 0.001) {
        const now = twoStrikes(t) > 0.5;
        if (now && !lit) count += 1;
        lit = now;
      }
      expect(count, `the second from ${start.toFixed(2)} s`).toBeLessThan(3);
    }
  });
});

describe('the wind', () => {
  it('is always a direction, never a speed', () => {
    for (let t = 0; t < 600; t += 7.3) {
      const { x, z } = windDirectionAt(t);
      expect(Math.hypot(x, z)).toBeCloseTo(1, 9);
    }
  });

  it('swings far enough that the rain changes side, and soon', () => {
    // On screen the rain leans with the wind's east-west part. The first wind
    // kept that between 0.59 and 1.00, so the rain never changed side, and
    // two minutes of watching showed nothing.
    let flips = 0;
    let first: number | null = null;
    let side = Math.sign(windDirectionAt(0).x);
    for (let t = 0; t <= 140; t += 0.25) {
      const now = Math.sign(windDirectionAt(t).x);
      if (now !== side) {
        flips += 1;
        first ??= t;
      }
      side = now;
    }
    expect(flips).toBeGreaterThanOrEqual(4);
    expect(first ?? Infinity).toBeLessThan(30);
  });

  it('turns smoothly enough to read as weather, not as a fault', () => {
    for (let t = 0; t < 600; t += 0.5) {
      const a = windDirectionAt(t);
      const b = windDirectionAt(t + 1);
      const turned = (Math.acos(Math.min(1, a.x * b.x + a.z * b.z)) * 180) / Math.PI;
      // A squall's shift, a few seconds across the camera's line — never a snap.
      expect(turned).toBeLessThan(40);
    }
  });

  it('spends most of its time blowing where the rain shows it', () => {
    // Blowing toward or away from the camera the rain looks upright, so a
    // wind that lingered there would look like no wind at all.
    let leaning = 0;
    let samples = 0;
    for (let t = 0; t <= 300; t += 0.25) {
      if (Math.abs(windDirectionAt(t).x) > 0.6) leaning += 1;
      samples += 1;
    }
    expect(leaning / samples).toBeGreaterThan(0.8);
  });

  it('gusts, between a lull and full strength', () => {
    let lo = 1;
    let hi = 0;
    for (let t = 0; t < 120; t += 0.05) {
      lo = Math.min(lo, gustAt(t));
      hi = Math.max(hi, gustAt(t));
    }
    expect(lo).toBeGreaterThanOrEqual(0.55);
    expect(hi).toBeLessThanOrEqual(1.0001);
    expect(hi - lo).toBeGreaterThan(0.3);
  });
});

describe('a thunder episode', () => {
  for (const [name, random] of [
    ['at its quickest', () => 0],
    ['at its slowest', () => 0.9999],
    ['in between', () => 0.5],
  ] as const) {
    it(`is a strike close by, then two far off ten to fifteen seconds later — ${name}`, () => {
      const [near, far1, far2, ...rest] = thunderEpisode(random);
      expect(rest).toEqual([]);
      expect(near).toEqual({ at: 0, near: true });
      expect(far1?.near).toBe(false);
      expect(far2?.near).toBe(false);
      expect(far1?.at ?? 0).toBeGreaterThanOrEqual(10);
      expect(far1?.at ?? 0).toBeLessThanOrEqual(15);
      // Never two strikes closer than the flash-safety gap.
      expect((far2?.at ?? 0) - (far1?.at ?? 0)).toBeGreaterThanOrEqual(MIN_STRIKE_GAP_SECONDS);
    });
  }
});

describe('the rain', () => {
  it('stays between a steady rain and a downpour', () => {
    for (let t = 0; t < 600; t += 0.5) {
      expect(rainIntensityAt(t)).toBeGreaterThanOrEqual(MEDIUM_RAIN - 1e-9);
      expect(rainIntensityAt(t)).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it('dwells at each, rather than hovering between them', () => {
    let medium = 0;
    let heavy = 0;
    let samples = 0;
    for (let t = 0; t < 600; t += 0.5) {
      const r = rainIntensityAt(t);
      if (r < MEDIUM_RAIN + 0.05) medium += 1;
      if (r > 0.95) heavy += 1;
      samples += 1;
    }
    expect(medium / samples).toBeGreaterThan(0.25);
    expect(heavy / samples).toBeGreaterThan(0.25);
  });

  it('eases from one to the other over several seconds, never jumps', () => {
    for (let t = 0; t < 600; t += 0.25) {
      expect(Math.abs(rainIntensityAt(t + 1) - rainIntensityAt(t))).toBeLessThan(0.15);
    }
  });
});
