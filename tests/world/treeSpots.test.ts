// WHAT: Where trees are planted.
// WHY:  Three promises, each of which a prototype broke or nearly broke. Trees
//       grow inside a wood's real outline — woods are concave, and the first
//       attempt used the squares' convex-only test and lost nearly every tree.
//       They never stand where a piece does. And thinning a huge forest keeps
//       every wood, rather than clearing whichever came last.

import { describe, expect, it } from 'vitest';

import { FlatBoardLayout } from '@domain/board/FlatBoardLayout';
import type { BoardPoint } from '@domain/board/types';
import type { MapFeature } from '@mapdata/model/MapFeature';
import { insideOutline, treeSpots } from '@world/builders/TreeBuilder';

const layout = new FlatBoardLayout({ boardSizeMeters: 2000 });

function wood(ring: BoardPoint[], leafType: string | null = null, id = 'way/1'): MapFeature {
  return {
    id,
    kind: 'wood',
    subtype: leafType,
    names: {},
    geometry: { type: 'polygon', ring },
  } as unknown as MapFeature;
}

const square = (x0: number, z0: number, x1: number, z1: number): BoardPoint[] => [
  { x: x0, z: z0 },
  { x: x1, z: z0 },
  { x: x1, z: z1 },
  { x: x0, z: z1 },
];

const plant = (features: MapFeature[], cap = 100_000, ground: number | null = 5) =>
  treeSpots({
    features,
    cells: layout.cells,
    bounds: layout.bounds,
    groundAt: () => ground,
    cap,
  });

describe('treeSpots', () => {
  it('plants inside a concave wood and nowhere in its notch', () => {
    // A U: two arms joined along the bottom, the notch open at the top.
    const u: BoardPoint[] = [
      { x: -900, z: -900 },
      { x: -100, z: -900 },
      { x: -100, z: -100 },
      { x: -300, z: -100 },
      { x: -300, z: -700 },
      { x: -700, z: -700 },
      { x: -700, z: -100 },
      { x: -900, z: -100 },
    ];
    expect(insideOutline(u, { x: -500, z: -800 })).toBe(true);
    expect(insideOutline(u, { x: -500, z: -400 })).toBe(false);

    const spots = plant([wood(u)]);
    expect(spots.length).toBeGreaterThan(50);
    for (const s of spots) expect(insideOutline(u, s), `${String(s.x)},${String(s.z)}`).toBe(true);
  });

  it('keeps the middle of every square clear for its piece', () => {
    const spots = plant([wood(square(-1000, -1000, 1000, 1000))]);
    for (const s of spots) {
      if (Math.abs(s.x) > 1000 || Math.abs(s.z) > 1000) continue;
      const nearest = Math.min(
        ...layout.cells.map((c) => Math.hypot(s.x - c.centroid.x, s.z - c.centroid.z)),
      );
      expect(nearest).toBeGreaterThanOrEqual(0.3 * 250);
    }
  });

  it("stands a tree on its square, at that square's height", () => {
    const spots = plant([wood(square(-990, 760, -760, 990))]);
    const a1 = layout.cell('a1');
    expect(spots.length).toBeGreaterThan(0);
    for (const s of spots) expect(s.y).toBe(a1.platformY);
  });

  it('plants nothing on a bare square, or off the land', () => {
    const all = square(-1000, -1000, 1000, 1000);
    const bare = treeSpots({
      features: [wood(all)],
      cells: layout.cells,
      bounds: layout.bounds,
      groundAt: () => null,
      bare: () => true,
      cap: 100_000,
    });
    expect(bare).toEqual([]);
  });

  it('grows what the map says grows there', () => {
    const area = square(-600, -600, -200, -200);
    expect(new Set(plant([wood(area, 'broadleaved')]).map((s) => s.shape))).toEqual(
      new Set(['broadleaf']),
    );
    expect(new Set(plant([wood(area, 'needleleaved')]).map((s) => s.shape))).toEqual(
      new Set(['conifer']),
    );
    // Unrecorded is drawn mixed.
    expect(new Set(plant([wood(area, null)]).map((s) => s.shape))).toEqual(
      new Set(['broadleaf', 'conifer']),
    );
  });

  it('thins a huge forest evenly, keeping every wood', () => {
    const west = wood(square(-1000, -1000, -200, 1000), null, 'way/west');
    const east = wood(square(200, -1000, 1000, 1000), null, 'way/east');
    const full = plant([west, east]);
    const thin = plant([west, east], 100);
    expect(full.length).toBeGreaterThan(100);
    expect(thin).toHaveLength(100);
    // Both woods survive, not just whichever came first.
    expect(thin.some((s) => s.x < 0)).toBe(true);
    expect(thin.some((s) => s.x > 0)).toBe(true);
  });

  it('grows the same wood every time the board is loaded', () => {
    const w = [wood(square(-800, -800, 0, 0))];
    expect(plant(w)).toEqual(plant(w));
  });
});
