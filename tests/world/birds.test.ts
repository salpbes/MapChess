// WHAT: Birds over a fine day's board: they come, they cross, they go — high
//       over the pieces, one visit at a time, and only when they are let.
// WHY:  Birds that flew through the pieces, or never left, or came in crowds,
//       would turn a pleasure into traffic. These are the limits that keep
//       them a glimpse.

import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';

import { Birds } from '@world/scene/Birds';
import type { Visit } from '@world/scene/Birds';

const BOUNDS = { minX: -1000, maxX: 1000, minY: 0, maxY: 120, minZ: -1000, maxZ: 1000 };

function birdsOver(): { birds: Birds; heard: Visit[] } {
  const birds = new Birds();
  birds.fit(BOUNDS);
  birds.setActive(true);
  const heard: Visit[] = [];
  birds.onArrival((kind) => heard.push(kind));
  return { birds, heard };
}

/** Runs the sky for `seconds`, calling `each` every frame. */
function fly(birds: Birds, seconds: number, each?: () => void): void {
  for (let t = 0; t < seconds; t += 1 / 30) {
    birds.update(1 / 30);
    each?.();
  }
}

describe('birds', () => {
  it('stay away until they are let', () => {
    const birds = new Birds();
    birds.fit(BOUNDS);
    expect(birds.send()).toBe(false);
    fly(birds, 120);
    expect(birds.flying).toBe(0);
  });

  it('come over on their own, soon after a fine day begins', () => {
    const { birds } = birdsOver();
    let seen = false;
    fly(birds, 20, () => {
      seen ||= birds.flying > 0;
    });
    expect(seen).toBe(true);
  });

  it('cross the board high over the pieces, are heard once, and go', () => {
    const { birds, heard } = birdsOver();
    birds.send('flock');
    expect(birds.flying).toBeGreaterThanOrEqual(3);
    expect(birds.flying).toBeLessThanOrEqual(7);

    let lowest = Infinity;
    const at = new Vector3();
    fly(birds, 60, () => {
      for (const child of birds.group.children) {
        child.getWorldPosition(at);
        lowest = Math.min(lowest, at.y);
      }
    });
    // A piece is about a tenth of the board's width tall; the birds fly well above that.
    expect(lowest).toBeGreaterThan(BOUNDS.maxY + 0.15 * 2000);
    expect(heard).toEqual(['flock']);
  });

  it('are never seen where they are made, before they are placed', () => {
    const { birds } = birdsOver();
    const at = new Vector3();
    for (const kind of ['flock', 'soarer'] as const) {
      birds.send(kind);
      for (const child of birds.group.children) {
        child.getWorldPosition(at);
        expect(at.y).toBeGreaterThan(BOUNDS.maxY);
      }
    }
  });

  it('let a soarer circle over the board for a while before it leaves', () => {
    const { birds, heard } = birdsOver();
    birds.send('soarer');
    expect(birds.flying).toBe(1);
    let over = 0;
    let gone = false;
    const at = new Vector3();
    fly(birds, 120, () => {
      // Once it has left, the next visit is another bird.
      gone ||= birds.flying === 0;
      const bird = birds.group.children[0];
      if (bird === undefined || gone) return;
      bird.getWorldPosition(at);
      if (Math.abs(at.x) < 1000 && Math.abs(at.z) < 1000) over += 1 / 30;
    });
    expect(heard[0]).toBe('soarer');
    expect(over).toBeGreaterThan(28);
    expect(gone).toBe(true);
  });

  it('leave at once when the weather turns', () => {
    const { birds } = birdsOver();
    birds.send('flock');
    birds.setActive(false);
    expect(birds.flying).toBe(0);
    expect(birds.group.children).toHaveLength(0);
  });
});
