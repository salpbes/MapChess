// WHAT: The mist takes fewer steps along each ray on a machine that cannot
//       keep up, and only then.
// WHY:  Drawn without a graphics card, the full mist cost a quarter of a
//       second a frame, and the game answered clicks seconds late; the deploy
//       gate's tests timed out on it. A fast machine must never lose its mist
//       to the few long frames of a board being built.

import { describe, expect, it } from 'vitest';

import { MistVolume } from '@world/scene/MistVolume';

const SLOW = 0.25;
const FAST = 1 / 60;

function shown(): MistVolume {
  const mist = new MistVolume(22);
  mist.setVisible(true);
  return mist;
}

describe('the mist on a slow machine', () => {
  it('takes fewer steps when frames stay slow, down to a floor', () => {
    const mist = shown();
    for (let i = 0; i < 100; i += 1) mist.pace(SLOW);
    expect(mist.stepsTaken).toBe(5);
  });

  it('keeps every step through a hitch', () => {
    const mist = shown();
    for (let round = 0; round < 10; round += 1) {
      for (let i = 0; i < 6; i += 1) mist.pace(SLOW);
      for (let i = 0; i < 60; i += 1) mist.pace(FAST);
    }
    expect(mist.stepsTaken).toBe(22);
  });

  it('is not judged while it is not showing', () => {
    const mist = new MistVolume(22);
    for (let i = 0; i < 100; i += 1) mist.pace(SLOW);
    expect(mist.stepsTaken).toBe(22);
  });
});
