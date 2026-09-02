// WHAT: The Phase 8 acceptance invariants for WarpedBoardLayout, run across
//       all three fixture areas plus synthetic edge cases.
// HOW:  Builds TerrainInputs from the shipped elevation + feature fixtures via
//       the production adapter, constructs the layout, and checks:
//         1. all 64 cells convex, none below minimum area
//         2. no two cells overlap; the union has no holes (areas sum to the board)
//         3. every cell's four neighbours are the same as on a plain grid
//         4. no vertex moved further than the cap
//         5. deterministic for the same input
//       plus: a1 south-west, IBoardLayout contract, rivers actually attract,
//       and a nasty synthetic input that the repair loop must survive.
// WHY:  BUILD_PLAN Phase 8 "done when". These are the tests that let the
//       weights be tuned by eye without fear.

import { describe, expect, it } from 'vitest';

import { isConvex, segmentsCross } from '@domain/board/geometry';
import { inradius, LATTICE_N } from '@domain/board/latticeWarp';
import { centroid, containsPoint, signedArea } from '@domain/board/polygon';
import { ALL_SQUARES, fileIndex, rankIndex, squareAt } from '@domain/board/Square';
import { FLAT_HEIGHTS } from '@domain/board/TerrainInputs';
import type { TerrainInputs } from '@domain/board/TerrainInputs';
import type { BoardPoint } from '@domain/board/types';
import { WarpedBoardLayout } from '@domain/board/WarpedBoardLayout';
import { buildTerrainInputs } from '@mapdata/board/buildTerrainInputs';
import { fixtureEntries } from '@mapdata/elevation/fixtureAreas';
import { fixtureToField } from '@mapdata/elevation/heightFieldFixture';
import type { Base64Codec } from '@mapdata/elevation/heightFieldFixture';
import { featureFixtureEntries } from '@mapdata/features/FixtureFeatureProvider';
import { normalizeFeatures, parseOverpassResponse } from '@mapdata/features/normalizeOverpass';
import { describeArea } from '@mapdata/model/MapArea';
import { FIXTURE_AREAS } from '@mapdata/model/fixtureAreas';

const nodeBase64: Base64Codec = {
  encode: (bytes) => Buffer.from(bytes).toString('base64'),
  decode: (text) => new Uint8Array(Buffer.from(text, 'base64')),
};

const SIZE = 2000;
const CELL = SIZE / LATTICE_N;

async function inputsFor(name: string): Promise<TerrainInputs> {
  const def = FIXTURE_AREAS.find((a) => a.name === name);
  const elev = fixtureEntries().find((e) => e.name === name);
  const feat = featureFixtureEntries().find((e) => e.name === name);
  if (def === undefined || elev === undefined || feat === undefined)
    throw new Error(`fixture ${name} missing`);
  const field = fixtureToField(await elev.load(), nodeBase64);
  const features = normalizeFeatures(
    parseOverpassResponse(await feat.load()),
    describeArea(def.area).projection,
  );
  return buildTerrainInputs(SIZE, field, features);
}

/** The four rank/file neighbours of a square, as on a plain board. */
function gridNeighbours(square: (typeof ALL_SQUARES)[number]): string[] {
  const f = fileIndex(square);
  const r = rankIndex(square);
  const out: string[] = [];
  for (const [df, dr] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    const nf = f + df;
    const nr = r + dr;
    if (nf >= 0 && nf < 8 && nr >= 0 && nr < 8) out.push(squareAt(nf, nr));
  }
  return out.sort();
}

function sharedEdge(a: readonly BoardPoint[], b: readonly BoardPoint[]): boolean {
  let shared = 0;
  for (const p of a)
    if (b.some((q) => Math.abs(p.x - q.x) < 1e-6 && Math.abs(p.z - q.z) < 1e-6)) shared += 1;
  return shared === 2;
}

function checkInvariants(layout: WarpedBoardLayout): void {
  const cells = layout.cells;
  expect(cells).toHaveLength(64);
  expect(cells.map((c) => c.square)).toEqual(ALL_SQUARES);

  // 1. convex, area floor, and room for a plinth
  const minArea = layout.latticeParams.minArea * CELL * CELL;
  for (const c of cells) {
    expect(c.polygon).toHaveLength(4);
    expect(isConvex(c.polygon), `${c.square} convex`).toBe(true);
    expect(signedArea(c.polygon), `${c.square} area`).toBeGreaterThanOrEqual(minArea - 1e-6);
    expect(inradius(c.polygon), `${c.square} inradius`).toBeGreaterThanOrEqual(
      layout.latticeParams.minInradius * CELL - 1e-6,
    );
    expect(containsPoint(c.polygon, c.centroid), `${c.square} centroid inside`).toBe(true);
  }

  // 2. no overlaps, no holes: areas sum to the board, and no two cell edges cross
  const total = cells.reduce((s, c) => s + signedArea(c.polygon), 0);
  expect(total).toBeCloseTo(SIZE * SIZE, 3);
  for (let i = 0; i < cells.length; i += 1) {
    for (let j = i + 1; j < cells.length; j += 1) {
      const ci = cells[i];
      const cj = cells[j];
      if (ci === undefined || cj === undefined) throw new Error('cell missing');
      const a = ci.polygon;
      const b = cj.polygon;
      for (let k = 0; k < 4; k += 1) {
        for (let m = 0; m < 4; m += 1) {
          const a0 = a[k];
          const a1 = a[(k + 1) % 4];
          const b0 = b[m];
          const b1 = b[(m + 1) % 4];
          if (a0 && a1 && b0 && b1)
            expect(segmentsCross(a0, a1, b0, b1), `${ci.square} × ${cj.square}`).toBe(false);
        }
      }
    }
  }
  // Every centroid lies in exactly its own cell.
  for (const c of cells) {
    const owners = cells.filter((o) => containsPoint(o.polygon, c.centroid));
    expect(owners.map((o) => o.square)).toEqual([c.square]);
  }

  // 3. neighbours: rank/file neighbours share exactly one edge (two vertices)
  for (const c of cells) {
    const touching = cells
      .filter((o) => o !== c && sharedEdge(c.polygon, o.polygon))
      .map((o) => o.square)
      .sort();
    expect(touching, `${c.square} neighbours`).toEqual(gridNeighbours(c.square));
  }

  // 4. displacement cap
  const half = SIZE / 2;
  for (let r = 0; r <= LATTICE_N; r += 1) {
    for (let cIdx = 0; cIdx <= LATTICE_N; cIdx += 1) {
      const v = layout.lattice[r]?.[cIdx];
      if (v === undefined) throw new Error('missing vertex');
      const ox = cIdx * CELL - half;
      const oz = r * CELL - half;
      expect(Math.hypot(v.x - ox, v.z - oz)).toBeLessThanOrEqual(
        layout.latticeParams.maxMove * CELL + 1e-6,
      );
    }
  }

  // Orientation: a1 south-west, h8 north-east, boundary intact.
  const a1 = layout.cell('a1').centroid;
  const h8 = layout.cell('h8').centroid;
  expect(a1.x).toBeLessThan(0);
  expect(a1.z).toBeGreaterThan(0);
  expect(h8.x).toBeGreaterThan(0);
  expect(h8.z).toBeLessThan(0);
  expect(layout.bounds).toMatchObject({ minX: -half, maxX: half, minZ: -half, maxZ: half });
  expect(layout.cell('a1').shade).toBe('dark');
}

describe('WarpedBoardLayout — fixture areas', () => {
  for (const def of FIXTURE_AREAS) {
    it(`${def.name}: all invariants hold`, async () => {
      const inputs = await inputsFor(def.name);
      const layout = new WarpedBoardLayout(inputs);
      checkInvariants(layout);
    });

    it(`${def.name}: is deterministic`, async () => {
      const inputs = await inputsFor(def.name);
      const a = new WarpedBoardLayout(inputs);
      const b = new WarpedBoardLayout(inputs);
      expect(b.cells).toEqual(a.cells);
      expect(b.lattice).toEqual(a.lattice);
    });

    it(`${def.name}: actually warps and terraces`, async () => {
      const inputs = await inputsFor(def.name);
      const layout = new WarpedBoardLayout(inputs);
      let moved = 0;
      for (let r = 1; r < LATTICE_N; r += 1) {
        for (let c = 1; c < LATTICE_N; c += 1) {
          const v = layout.lattice[r]?.[c];
          if (v && Math.hypot(v.x - (c * CELL - SIZE / 2), v.z - (r * CELL - SIZE / 2)) > 1)
            moved += 1;
        }
      }
      expect(moved, 'interior vertices moved').toBeGreaterThan(10);
      expect(layout.bounds.maxY - layout.bounds.minY).toBeGreaterThan(0);
      expect(layout.bounds.maxY - layout.bounds.minY).toBeLessThanOrEqual(SIZE * 0.17 + 1e-6);
    });
  }

  it('Glen Coe relief hits the exaggeration cap; Lindisfarne stays gentle', async () => {
    const glen = new WarpedBoardLayout(await inputsFor('glencoe'));
    const isle = new WarpedBoardLayout(await inputsFor('lindisfarne'));
    expect(glen.bounds.maxY - glen.bounds.minY).toBeCloseTo(SIZE * 0.17, 3);
    expect(isle.bounds.maxY - isle.bounds.minY).toBeLessThan(SIZE * 0.05);
    expect(isle.terraceInfo.realReliefMeters).toBeLessThan(25);
  });
});

describe('WarpedBoardLayout — synthetic inputs', () => {
  it('with no terrain it is the flat board', () => {
    const layout = new WarpedBoardLayout({
      boardSizeMeters: SIZE,
      lines: [],
      points: [],
      heights: FLAT_HEIGHTS,
    });
    checkInvariants(layout);
    for (const c of layout.cells) {
      expect(signedArea(c.polygon)).toBeCloseTo(CELL * CELL, 6);
      expect(c.platformY).toBe(0);
    }
  });

  it('pulls vertices onto a meandering river so it runs along cell edges', () => {
    // A north–south river wandering ±40 m about x = 60: never on a lattice line, always near one.
    const river: BoardPoint[] = [];
    for (let i = 0; i <= 40; i += 1) {
      const t = i / 40;
      river.push({ x: 60 + 40 * Math.sin(t * Math.PI * 3), z: 1000 - 2000 * t });
    }
    const layout = new WarpedBoardLayout({
      boardSizeMeters: SIZE,
      lines: [{ points: river, weight: 1 }],
      points: [],
      heights: FLAT_HEIGHTS,
    });
    checkInvariants(layout);

    // Count how many river samples fall within 12 m of any cell edge vs. the flat board.
    const nearEdge = (cells: readonly { polygon: readonly BoardPoint[] }[]): number => {
      let n = 0;
      for (const p of river) {
        let best = Number.POSITIVE_INFINITY;
        for (const c of cells) {
          for (let k = 0; k < 4; k += 1) {
            const a = c.polygon[k];
            const b = c.polygon[(k + 1) % 4];
            if (!a || !b) continue;
            const dx = b.x - a.x;
            const dz = b.z - a.z;
            const len2 = dx * dx + dz * dz;
            const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2));
            best = Math.min(best, Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t)));
          }
        }
        if (best < 12) n += 1;
      }
      return n;
    };
    const flat = new WarpedBoardLayout({
      boardSizeMeters: SIZE,
      lines: [],
      points: [],
      heights: FLAT_HEIGHTS,
    });
    expect(nearEdge(flat.cells)).toBeLessThan(15);
    // 41 samples; the flat board manages ~9. The two boundary rows are pinned, so ~5 can never snap.
    expect(nearEdge(layout.cells)).toBeGreaterThan(25);
  });

  it('leaves a 45° river alone rather than turning it into a staircase', () => {
    const river: BoardPoint[] = [];
    for (let i = 0; i <= 20; i += 1) {
      const t = i / 20;
      river.push({ x: -1000 + 2000 * t + 60, z: 1000 - 2000 * t });
    }
    const layout = new WarpedBoardLayout({
      boardSizeMeters: SIZE,
      lines: [{ points: river, weight: 1 }],
      points: [],
      heights: FLAT_HEIGHTS,
    });
    const flat = new WarpedBoardLayout({
      boardSizeMeters: SIZE,
      lines: [],
      points: [],
      heights: FLAT_HEIGHTS,
    });
    expect(layout.lattice).toEqual(flat.lattice);
  });

  it('enlarges the cell around a point attractor', () => {
    const peak = { x: 125, z: -125 }; // centre of e5 on the flat board
    const layout = new WarpedBoardLayout({
      boardSizeMeters: SIZE,
      lines: [],
      points: [{ point: peak, priority: 100, label: 'peak' }],
      heights: FLAT_HEIGHTS,
    });
    checkInvariants(layout);
    const e5 = layout.cell('e5');
    expect(containsPoint(e5.polygon, peak)).toBe(true);
    expect(signedArea(e5.polygon)).toBeGreaterThan(CELL * CELL * 1.15);
    expect(
      Math.hypot(centroid(e5.polygon).x - peak.x, centroid(e5.polygon).z - peak.z),
    ).toBeLessThan(CELL * 0.2);
  });

  it('survives hostile input: many crossing lines and a point in every cell', () => {
    const lines = [];
    for (let i = 0; i < 12; i += 1) {
      const a = -1000 + (i * 2000) / 11;
      lines.push({
        points: [
          { x: a, z: -1200 },
          { x: -a, z: 1200 },
        ],
        weight: 1,
      });
      lines.push({
        points: [
          { x: -1200, z: a },
          { x: 1200, z: -a },
        ],
        weight: 1,
      });
    }
    const points = [];
    for (let f = 0; f < 8; f += 1)
      for (let r = 0; r < 8; r += 1)
        points.push({ point: { x: -1000 + f * CELL + 30, z: 1000 - r * CELL - 200 }, priority: 1 });
    const layout = new WarpedBoardLayout({
      boardSizeMeters: SIZE,
      lines,
      points,
      heights: FLAT_HEIGHTS,
    });
    checkInvariants(layout);
  });

  it('respects the max-move parameter when overridden', () => {
    const river = [
      { x: -1000, z: 60 },
      { x: 1000, z: 60 },
    ];
    const layout = new WarpedBoardLayout(
      {
        boardSizeMeters: SIZE,
        lines: [{ points: river, weight: 1 }],
        points: [],
        heights: FLAT_HEIGHTS,
      },
      { lattice: { maxMove: 0.1 } },
    );
    const half = SIZE / 2;
    for (let r = 0; r <= LATTICE_N; r += 1) {
      for (let c = 0; c <= LATTICE_N; c += 1) {
        const v = layout.lattice[r]?.[c];
        if (!v) continue;
        expect(Math.hypot(v.x - (c * CELL - half), v.z - (r * CELL - half))).toBeLessThanOrEqual(
          0.1 * CELL + 1e-6,
        );
      }
    }
  });

  it('rejects a non-positive board size', () => {
    expect(
      () =>
        new WarpedBoardLayout({ boardSizeMeters: 0, lines: [], points: [], heights: FLAT_HEIGHTS }),
    ).toThrow(RangeError);
  });
});

describe('buildTerrainInputs', () => {
  it('classifies fixture features into lines and prioritised points', async () => {
    const inputs = await inputsFor('rievaulx');
    expect(inputs.lines.length).toBeGreaterThan(10);
    expect(inputs.points.length).toBeGreaterThan(5);
    const labels = inputs.points.map((p) => p.label);
    expect(labels).toContain('Rievaulx');
    expect(labels).toContain('Ashberry Hill');
    // Peak outranks the village; rivers outrank streams.
    expect(inputs.points[0]?.label).toBe('Ashberry Hill');
    expect(inputs.lines[0]?.weight).toBe(1);
    for (const l of inputs.lines)
      for (const p of l.points)
        expect(Math.max(Math.abs(p.x), Math.abs(p.z))).toBeLessThanOrEqual(1150);
  });
});
