// WHAT: Tests for how each cell's ground is classified, and the sea rule in
//       particular.
// HOW:  A flat board layout with a hand-built HeightField, so the height of
//       every cell is known exactly, plus the one feature that makes a board
//       coastal.
// WHY:  OSM gives the coast as a line, not a polygon, so nothing in the feature
//       data says "this square is sea" — only the elevation does. That made a
//       bay in the corner of a board render as a pale beach across the whole
//       bay, which is the sort of wrong that looks deliberate.

import { describe, expect, it } from 'vitest';

import { FlatBoardLayout } from '@domain/board/FlatBoardLayout';
import { classifyCellCover } from '@mapdata/board/classifyCellCover';
import { createHeightField } from '@mapdata/model/HeightField';
import type { HeightField } from '@mapdata/model/HeightField';
import type { MapFeature } from '@mapdata/model/MapFeature';

const BOARD_METERS = 2000;
const layout = new FlatBoardLayout({ boardSizeMeters: BOARD_METERS });

const COASTLINE: MapFeature = {
  id: 'coast-1',
  kind: 'coastline',
  subtype: null,
  names: {},
  elevationMeters: null,
  geometry: {
    type: 'line',
    points: [
      { x: -BOARD_METERS / 2, z: 0 },
      { x: BOARD_METERS / 2, z: 0 },
    ],
  },
};

/** Heights from a function of board position, sampled on a coarse grid. */
function field(heightAt: (x: number, z: number) => number): HeightField {
  const cols = 33;
  const rows = 33;
  const step = BOARD_METERS / (cols - 1);
  const origin = -BOARD_METERS / 2;
  const data = new Float32Array(cols * rows);
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      data[row * cols + col] = heightAt(origin + col * step, origin + row * step);
    }
  }
  return createHeightField(origin, origin, step, cols, rows, data);
}

describe('classifyCellCover — the coast', () => {
  it('calls submerged ground sea, not sand', () => {
    // Everything north of the middle is at sea level; the south rises inland.
    const cover = classifyCellCover(
      layout,
      [COASTLINE],
      field((_x, z) => (z < 0 ? 0 : 40)),
    );
    expect(cover.get('a8')).toBe('water');
    expect(cover.get('h8')).toBe('water');
    expect(cover.get('a1')).toBe('grass');
  });

  it('keeps tidal sand for ground that is just above the water', () => {
    const cover = classifyCellCover(
      layout,
      [COASTLINE],
      field((_x, z) => (z < 0 ? 0.8 : 40)),
    );
    expect(cover.get('a8')).toBe('sand');
    expect(cover.get('a1')).toBe('grass');
  });

  it('drowns only the corner that is actually under water', () => {
    // Sea in the a8 corner alone: the north-west quarter of the board.
    const cover = classifyCellCover(
      layout,
      [COASTLINE],
      field((x, z) => (x < 0 && z < 0 ? 0 : 30)),
    );
    expect(cover.get('a8')).toBe('water');
    expect(cover.get('b7')).toBe('water');
    expect(cover.get('h8')).toBe('grass');
    expect(cover.get('a1')).toBe('grass');
    const drowned = [...cover.values()].filter((c) => c === 'water').length;
    expect(drowned).toBeGreaterThan(8);
    expect(drowned).toBeLessThan(24);
  });

  it('leaves an inland board alone, however low it lies', () => {
    // No coastline feature: a valley floor at 0 m is not the sea.
    const cover = classifyCellCover(
      layout,
      [],
      field(() => 0),
    );
    expect([...cover.values()].every((c) => c === 'grass')).toBe(true);
  });

  it('needs elevation before it will drown anything', () => {
    const cover = classifyCellCover(layout, [COASTLINE], null);
    expect([...cover.values()].every((c) => c === 'grass')).toBe(true);
  });

  it('rises out of the sea as the ground does', () => {
    const heights = [0, 0.2, 0.5, 1.4, 2.0];
    const covers = heights.map((h) =>
      classifyCellCover(
        layout,
        [COASTLINE],
        field(() => h),
      ).get('d5'),
    );
    expect(covers).toEqual(['water', 'water', 'sand', 'sand', 'grass']);
  });
});
