// WHAT: Tests for the loading-screen chess tips.
// HOW:  Calls the picker repeatedly and checks what comes back.
// WHY:  Two failure modes, both quiet: an empty list would put a blank line
//       under "Loading terrain…", and a picker that can repeat itself makes a
//       slow load look frozen because the text never changes.

import { describe, expect, it } from 'vitest';

import { nextTip, TIP_COUNT } from '@ui/chessTips';

describe('nextTip', () => {
  it('has enough tips that a slow load does not go round twice', () => {
    expect(TIP_COUNT).toBeGreaterThanOrEqual(10);
  });

  it('always returns something to read', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(nextTip(null).length).toBeGreaterThan(0);
    }
  });

  it('never hands back the tip already on screen', () => {
    let shown = nextTip(null);
    for (let i = 0; i < 200; i += 1) {
      const next = nextTip(shown);
      expect(next).not.toBe(shown);
      shown = next;
    }
  });

  it('copes with a tip that is not in the list', () => {
    expect(nextTip('something else entirely').length).toBeGreaterThan(0);
  });
});
