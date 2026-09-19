// WHAT: That a board still builds when the map has told us nothing about the
//       place — terrain only, no rivers, woods or names.
// WHY:  Overpass is a free, shared service and it is sometimes just busy. When
//       it does not answer, the player can choose to play the ground anyway;
//       this is the test that the ground on its own is enough. Everything
//       downstream of `features` has to cope with an empty list rather than
//       assume at least one river exists somewhere.

import { describe, expect, it } from 'vitest';

import { WarpedBoardLayout } from '@domain/board/WarpedBoardLayout';
import { buildBoardTheme } from '@domain/theme/buildBoardTheme';
import { buildTerrainInputs } from '@mapdata/board/buildTerrainInputs';
import { classifyCellCover } from '@mapdata/board/classifyCellCover';
import { createHeightField } from '@mapdata/model/HeightField';
import { buildBriefing } from '@mapdata/board/buildBriefing';
import { buildCellFacts } from '@mapdata/theme/buildCellFacts';

const BOARD_METERS = 2000;

/** A gentle slope, the way a real square of ground mostly is. */
function slope(): ReturnType<typeof createHeightField> {
  const n = 64;
  const step = (BOARD_METERS * 1.2) / (n - 1);
  const data = new Float32Array(n * n);
  for (let row = 0; row < n; row += 1) {
    for (let col = 0; col < n; col += 1) {
      data[row * n + col] = 40 + col * 0.6 + row * 0.25;
    }
  }
  return createHeightField(-BOARD_METERS * 0.6, -BOARD_METERS * 0.6, step, n, n, data);
}

describe('a board with no map features at all', () => {
  const heights = slope();
  const terrain = buildTerrainInputs(BOARD_METERS, heights, []);
  const layout = new WarpedBoardLayout(terrain);
  const cover = classifyCellCover(layout, [], heights);
  const { scale, baseMeters } = layout.terraceInfo;
  const facts = buildCellFacts(layout, [], cover, {
    yToMeters: (y) => (scale > 0 ? y / scale + baseMeters : baseMeters),
  });

  it('still has 64 cells', () => {
    expect(layout.cells).toHaveLength(64);
  });

  it('names every one of them', () => {
    const theme = buildBoardTheme(facts);
    expect(theme.cells.size).toBe(64);
    for (const [square, identity] of theme.cells) {
      expect(identity.name, `${square} has no name`).not.toBe('');
    }
  });

  it('gives no two cells the same name', () => {
    const theme = buildBoardTheme(facts);
    const names = [...theme.cells.values()].map((c) => c.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  it('still finds an identity for all 32 pieces', () => {
    const theme = buildBoardTheme(facts);
    expect(theme.pieces).toHaveLength(32);
    for (const piece of theme.pieces) {
      expect(piece.cell.name, `${piece.color} ${piece.type} has no ground`).not.toBe('');
    }
  });

  it('still writes a gazetteer entry, with nothing to say about the place', () => {
    // The panel is on screen whatever happens, so it has to read as a sentence
    // about empty ground rather than throw on the first missing river.
    const briefing = buildBriefing({
      features: [],
      heights,
      cover,
      bounds: layout.bounds,
    });
    expect(briefing.title).not.toBe('');
    // The ground itself is still something to say about a place.
    expect(briefing.lines.length).toBeGreaterThan(0);
  });

  it('is deterministic, so a rebuilt board is the same board', () => {
    const first = buildBoardTheme(facts);
    const second = buildBoardTheme(facts);
    expect([...second.cells.values()]).toEqual([...first.cells.values()]);
  });
});
