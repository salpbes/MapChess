// WHAT: A capture knocks the taken piece over, away from the piece that took
//       it, and the ground throws up dust of its own colour — and neither
//       happens for a player who has asked for less motion.
// WHY:  The fall is the one place a piece is ever tilted (PieceLayer keeps
//       every other piece upright), so its direction and its end are pinned:
//       a victim that fell toward its attacker would read as the attacker
//       falling, and one that never left the scene would stand in the next
//       position's way.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PointsMaterial } from 'three';
import { Group, Mesh, BoxGeometry, Points, Vector3 } from 'three';

import { BURST_SECONDS, CAPTURE_SECONDS, CaptureEffects } from '@world/pieces/CaptureEffects';

let reduce = false;

beforeEach(() => {
  reduce = false;
  vi.stubGlobal('window', {
    matchMedia: () => ({
      get matches() {
        return reduce;
      },
    }),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A piece 185 tall standing at the origin of its board, as the factory makes them. */
function boardWithVictim(): { board: Group; victim: Mesh } {
  const board = new Group();
  const geometry = new BoxGeometry(90, 185, 90);
  geometry.translate(0, 92.5, 0);
  const victim = new Mesh(geometry);
  board.add(victim);
  return { board, victim };
}

function run(effects: CaptureEffects, seconds: number, step = 1 / 60): void {
  for (let t = 0; t < seconds; t += step) effects.update(step);
}

const FROM = new Vector3(-250, 0, 250);
const TO = new Vector3(0, 0, 0);

describe('a capture', () => {
  it('knocks the victim over away from its attacker', () => {
    const { victim } = boardWithVictim();
    const effects = new CaptureEffects(250);
    effects.knockOver(victim, 'd5', FROM, TO);
    run(effects, 0.5);

    const away = new Vector3().subVectors(TO, FROM).setY(0).normalize();
    const up = new Vector3(0, 1, 0).applyQuaternion(victim.quaternion);
    // Most of the way over, and toward `away`.
    expect(up.y).toBeLessThan(0.4);
    expect(up.dot(away)).toBeGreaterThan(0.8);
    // Carried off the square's middle the same way, out of the attacker's path.
    expect(victim.position.clone().setY(0).dot(away)).toBeGreaterThan(50);
  });

  it('sinks the victim and then takes it away', () => {
    const { board, victim } = boardWithVictim();
    const effects = new CaptureEffects(250);
    effects.knockOver(victim, 'd5', FROM, TO);
    run(effects, CAPTURE_SECONDS * 0.9);
    expect(victim.parent).toBe(board);
    expect(victim.position.y).toBeLessThan(0);

    run(effects, CAPTURE_SECONDS * 0.2);
    expect(victim.parent).toBeNull();
    expect(effects.falling).toBe(0);
  });

  it('throws up dust the colour of the ground, and clears it', () => {
    const { board, victim } = boardWithVictim();
    const effects = new CaptureEffects(250);
    effects.setGround((square) => (square === 'd5' ? 'sand' : 'grass'));
    effects.knockOver(victim, 'd5', FROM, TO);

    const dust = board.children.find((child) => child.name === 'capture-burst');
    expect(dust).toBeInstanceOf(Points);
    const sand = ((dust as Points).material as PointsMaterial).color.getHexString();

    const other = boardWithVictim();
    effects.knockOver(other.victim, 'e4', FROM, TO);
    const grassDust = other.board.children.find((child) => child.name === 'capture-burst');
    const grass = ((grassDust as Points).material as PointsMaterial).color.getHexString();
    expect(sand).not.toBe(grass);

    run(effects, BURST_SECONDS + 0.05);
    expect(board.children.some((child) => child.name === 'capture-burst')).toBe(false);
  });

  it('only removes the victim for a player who has asked for less motion', () => {
    reduce = true;
    const { board, victim } = boardWithVictim();
    const effects = new CaptureEffects(250);
    effects.knockOver(victim, 'd5', FROM, TO);
    expect(victim.parent).toBeNull();
    expect(board.children).toHaveLength(0);
    expect(effects.falling).toBe(0);
  });
});
