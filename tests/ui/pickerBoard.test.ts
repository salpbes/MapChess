// WHAT: The chessboard drawn inside the map picker.
// WHY:  Its whole job is to tell the truth about orientation before a player
//       commits: which way White faces, where the kings stand, how the board
//       lies across the ground. A board drawn a square off, or mirrored, would
//       be worse than the plain yellow square it replaced, because it would be
//       believed. So these pin it to the same geometry the game uses.

import { describe, expect, it } from 'vitest';

import { describeArea } from '@mapdata/model/MapArea';
import type { SelectedArea } from '@mapdata/model/SelectedArea';
import { pickerBoard } from '@ui/pickerBoard';

const AREA: SelectedArea = {
  centerLat: 50.9116,
  centerLon: 0.4874,
  sizeMeters: 2000,
  rotationDeg: 0,
};

function centre(ring: readonly (readonly number[])[]): { lon: number; lat: number } {
  const pts = ring.slice(0, -1);
  return {
    lon: pts.reduce((a, p) => a + (p[0] ?? 0), 0) / pts.length,
    lat: pts.reduce((a, p) => a + (p[1] ?? 0), 0) / pts.length,
  };
}

describe('pickerBoard', () => {
  it('draws sixty-four squares and two full armies', () => {
    const f = pickerBoard(AREA).features;
    expect(f.filter((x) => x.properties.kind === 'cell')).toHaveLength(64);
    expect(
      f.filter((x) => x.properties.kind === 'piece' && x.properties.side === 'white'),
    ).toHaveLength(16);
    expect(
      f.filter((x) => x.properties.kind === 'piece' && x.properties.side === 'black'),
    ).toHaveLength(16);
    const kings = f
      .filter((x) => x.properties.kind === 'king-mark')
      .map((x) => x.properties.square);
    expect(kings.sort()).toEqual(['e1', 'e8']);
  });

  it('colours the squares the way every chessboard is coloured', () => {
    const cells = new Map(
      pickerBoard(AREA)
        .features.filter((x) => x.properties.kind === 'cell')
        .map((x) => [x.properties.square, x.properties.dark]),
    );
    // "Light on the right": a1 dark, h1 light, and the colours alternate.
    expect(cells.get('a1')).toBe(true);
    expect(cells.get('h1')).toBe(false);
    expect(cells.get('a2')).toBe(false);
    expect(cells.get('h8')).toBe(true);
  });

  it('lays the board over exactly the ground the game will build on', () => {
    const { corners } = describeArea(AREA);
    const a1 = pickerBoard(AREA).features.find(
      (x) => x.properties.square === 'a1' && x.properties.kind === 'cell',
    );
    const first = a1?.geometry.coordinates[0]?.[0];
    // The a1 square's outer corner IS the area's a1 corner, not near it.
    expect(first?.[0]).toBeCloseTo(corners.sw.lon, 9);
    expect(first?.[1]).toBeCloseTo(corners.sw.lat, 9);
  });

  it('puts White to the south at rest and turns the armies with the board', () => {
    const side = (area: SelectedArea, s: 'white' | 'black') => {
      const pieces = pickerBoard(area).features.filter(
        (x) => x.properties.kind === 'piece' && x.properties.side === s,
      );
      const cs = pieces.map((x) => centre(x.geometry.coordinates[0] ?? []));
      return cs.reduce((a, c) => a + c.lat, 0) / cs.length;
    };
    // Unrotated, White sits on the south edge, as the game's board frame says.
    expect(side(AREA, 'white')).toBeLessThan(side(AREA, 'black'));
    // Half a turn, and White is coming from the north — the drawing follows the slider.
    const turned = { ...AREA, rotationDeg: 180 };
    expect(side(turned, 'white')).toBeGreaterThan(side(turned, 'black'));
  });

  it('sits every piece inside its own square', () => {
    const f = pickerBoard({ ...AREA, rotationDeg: 37 }).features;
    const cellAt = new Map(
      f
        .filter((x) => x.properties.kind === 'cell')
        .map((x) => [x.properties.square, x.geometry.coordinates[0] ?? []]),
    );
    for (const piece of f.filter((x) => x.properties.kind === 'piece')) {
      const c = centre(piece.geometry.coordinates[0] ?? []);
      const cell = centre(cellAt.get(piece.properties.square) ?? []);
      expect(Math.abs(c.lat - cell.lat), piece.properties.square).toBeLessThan(1e-6);
      expect(Math.abs(c.lon - cell.lon), piece.properties.square).toBeLessThan(1e-6);
    }
  });
});
