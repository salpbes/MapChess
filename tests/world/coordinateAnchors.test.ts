// WHAT: Where the board's coordinates sit.
// WHY:  A letter one square out is worse than no letter: a beginner told to
//       play e4 would put the pawn on d4 and believe the board. So the
//       placement is pinned against the board's own geometry, on a flat board
//       and on a warped one, where the squares inside move but the border
//       does not.

import { describe, expect, it } from 'vitest';

import { FlatBoardLayout } from '@domain/board/FlatBoardLayout';
import type { Square } from '@domain/board/Square';
import { WarpedBoardLayout } from '@domain/board/WarpedBoardLayout';
import { buildTerrainInputs } from '@mapdata/board/buildTerrainInputs';
import { createHeightField } from '@mapdata/model/HeightField';
import { coordinateAnchors } from '@world/builders/CoordinateBuilder';

function warped(): WarpedBoardLayout {
  const n = 64;
  const step = 2400 / (n - 1);
  const data = new Float32Array(n * n);
  for (let r = 0; r < n; r += 1) {
    for (let c = 0; c < n; c += 1)
      data[r * n + c] = 40 + 30 * Math.sin(c / 6) * Math.cos(r / 7) + r;
  }
  return new WarpedBoardLayout(
    buildTerrainInputs(2000, createHeightField(-1200, -1200, step, n, n, data), []),
  );
}

for (const [name, layout] of [
  ['a flat board', new FlatBoardLayout({ boardSizeMeters: 2000 })],
  ['a warped board', warped()],
] as const) {
  describe(`coordinateAnchors on ${name}`, () => {
    const anchors = coordinateAnchors(layout);
    const files = anchors.filter((a) => a.axis === 'file');
    const ranks = anchors.filter((a) => a.axis === 'rank');

    it('labels every file and every rank, once', () => {
      expect(files.map((a) => a.text)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
      expect(ranks.map((a) => a.text)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
    });

    it("puts the letters on White's edge, each under the middle of its own file", () => {
      for (const a of files) {
        expect(a.z).toBe(layout.bounds.maxZ);
        expect(a.outZ).toBe(1);
        // Inside its rank-1 square's span of border, not merely near it.
        const border = layout
          .cell(`${a.text}1` as Square)
          .polygon.filter((p) => Math.abs(p.z - layout.bounds.maxZ) < 1e-6)
          .map((p) => p.x);
        expect(a.x, a.text).toBeGreaterThan(Math.min(...border));
        expect(a.x, a.text).toBeLessThan(Math.max(...border));
      }
    });

    it('puts the numbers beside the h-file, rank 1 nearest White', () => {
      for (const a of ranks) {
        expect(a.x).toBe(layout.bounds.maxX);
        expect(a.outX).toBe(1);
        const border = layout
          .cell(`h${a.text}` as Square)
          .polygon.filter((p) => Math.abs(p.x - layout.bounds.maxX) < 1e-6)
          .map((p) => p.z);
        expect(a.z, a.text).toBeGreaterThan(Math.min(...border));
        expect(a.z, a.text).toBeLessThan(Math.max(...border));
      }
      expect(ranks[0]?.z ?? 0).toBeGreaterThan(ranks[7]?.z ?? 0);
    });

    it('stands each label at the height of the square it names', () => {
      for (const a of files) expect(a.y).toBe(layout.cell(`${a.text}1` as Square).platformY);
      for (const a of ranks) expect(a.y).toBe(layout.cell(`h${a.text}` as Square).platformY);
    });
  });
}
