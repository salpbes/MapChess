// WHAT: Tests for the theming layer: naming chain, piece assignment, and the
//       "three very different areas" acceptance check on the fixtures.
// HOW:  Hand-written CellFacts for the rules; an all-empty board for the sparse
//       case; the real fixtures through the production adapter for the rest.
// WHY:  BUILD_PLAN Phase 10 "done when": a mountain valley, a flat coast and an
//       empty square all produce a complete, sensible board. "Complete" is
//       testable: 64 names, no blanks, 32 identities, 16 distinct cells per side.

import { describe, expect, it } from 'vitest';

import { ALL_SQUARES, rankIndex } from '@domain/board/Square';
import type { Square } from '@domain/board/Square';
import { WarpedBoardLayout } from '@domain/board/WarpedBoardLayout';
import { buildBoardTheme } from '@domain/theme/buildBoardTheme';
import { nameCells } from '@domain/theme/nameCells';
import type { BoardTheme, CellFacts, ThemeFeature } from '@domain/theme/types';
import { hasStem, RELIGIOUS_STEMS } from '@domain/theme/wordlists';
import { buildTerrainInputs } from '@mapdata/board/buildTerrainInputs';
import { classifyCellCover } from '@mapdata/board/classifyCellCover';
import { fixtureEntries } from '@mapdata/elevation/fixtureAreas';
import { fixtureToField } from '@mapdata/elevation/heightFieldFixture';
import type { Base64Codec } from '@mapdata/elevation/heightFieldFixture';
import { featureFixtureEntries } from '@mapdata/features/FixtureFeatureProvider';
import { normalizeFeatures, parseOverpassResponse } from '@mapdata/features/normalizeOverpass';
import { describeArea } from '@mapdata/model/MapArea';
import { FIXTURE_AREAS } from '@mapdata/model/fixtureAreas';
import { buildCellFacts } from '@mapdata/theme/buildCellFacts';

const nodeBase64: Base64Codec = {
  encode: (bytes) => Buffer.from(bytes).toString('base64'),
  decode: (text) => new Uint8Array(Buffer.from(text, 'base64')),
};

function plainCells(height: (sq: Square) => number = () => 50): CellFacts[] {
  return ALL_SQUARES.map((square) => ({
    square,
    heightMeters: height(square),
    cover: 'grass',
    features: [],
    coastal: false,
  }));
}

function withFeature(
  cells: CellFacts[],
  square: Square,
  f: Partial<ThemeFeature> & { kind: ThemeFeature['kind'] },
): CellFacts[] {
  return cells.map((c) =>
    c.square === square
      ? {
          ...c,
          features: [
            ...c.features,
            { subtype: null, names: {}, distanceMeters: 0, elevationMeters: null, ...f },
          ],
        }
      : c,
  );
}

function checkComplete(theme: BoardTheme): void {
  expect(theme.cells.size).toBe(64);
  const names = new Set<string>();
  for (const sq of ALL_SQUARES) {
    const id = theme.cells.get(sq);
    expect(id?.name.trim().length ?? 0, `${sq} has a name`).toBeGreaterThan(0);
    expect(id?.ground.trim().length ?? 0, `${sq} has ground`).toBeGreaterThan(0);
    names.add((id?.name ?? '').toLowerCase());
  }
  expect(names.size, 'every cell name is unique').toBe(64);
  expect(theme.pieces).toHaveLength(32);
  for (const color of ['white', 'black'] as const) {
    const mine = theme.pieces.filter((p) => p.color === color);
    expect(mine).toHaveLength(16);
    expect(
      new Set(mine.map((p) => p.cell.square)).size,
      `${color} identities are distinct cells`,
    ).toBe(16);
    for (const p of mine) {
      const r = rankIndex(p.cell.square);
      expect(color === 'white' ? r < 4 : r >= 4, `${color} ${p.type} from own half`).toBe(true);
      expect(p.reason.length).toBeGreaterThan(3);
    }
    expect(mine.filter((p) => p.type === 'pawn')).toHaveLength(8);
  }
}

describe('nameCells — fallback chain', () => {
  it('prefers old_name, then historic, then name, on the most specific feature', () => {
    let cells = plainCells();
    cells = withFeature(cells, 'a1', {
      kind: 'place',
      subtype: 'village',
      names: { name: 'Newton', oldName: 'Niwetun' },
    });
    cells = withFeature(cells, 'b1', {
      kind: 'waterway',
      subtype: 'river',
      names: { name: 'River Coe', historicName: 'Abhainn Chomhann' },
    });
    cells = withFeature(cells, 'c1', { kind: 'wood', names: { name: 'Hags Wood' } });
    cells = withFeature(cells, 'c1', {
      kind: 'place',
      subtype: 'farm',
      names: { name: 'Griff Farm' },
    });
    const named = nameCells(cells);
    expect(named.get('a1')).toMatchObject({ name: 'Niwetun', source: 'old_name' });
    expect(named.get('b1')).toMatchObject({ name: 'Abhainn Chomhann', source: 'historic' });
    expect(named.get('c1')).toMatchObject({ name: 'Griff Farm', source: 'name' });
  });

  it('borrows a nearby name when the cell has none', () => {
    let cells = plainCells();
    cells = withFeature(cells, 'd4', {
      kind: 'peak',
      names: { name: 'Ashberry Hill' },
      distanceMeters: 220,
    });
    cells = withFeature(cells, 'e4', {
      kind: 'waterway',
      subtype: 'river',
      names: { name: 'River Rye' },
      distanceMeters: 90,
    });
    const named = nameCells(cells);
    expect(named.get('d4')).toMatchObject({ name: 'Below Ashberry Hill', source: 'nearby' });
    expect(named.get('e4')).toMatchObject({ name: 'By River Rye', source: 'nearby' });
  });

  it('generates unique names from height and cover when there is nothing at all', () => {
    const cells = plainCells((sq) => rankIndex(sq) * 10).map((c) =>
      c.square.startsWith('a') ? { ...c, cover: 'wood' as const } : c,
    );
    const named = nameCells(cells);
    const names = [...named.values()].map((n) => n.name);
    expect(new Set(names).size).toBe(64);
    for (const n of named.values()) expect(n.source).toBe('generated');
    expect(named.get('a8')?.name).toMatch(/^(High|Upper|Top|North|North-east|North-west)/);
    expect(named.get('a1')?.name).toMatch(/Wood|Copse|Grove|Holt|Spinney/);
  });

  it('describes the ground in words', () => {
    let cells = plainCells((sq) => rankIndex(sq) * 30);
    cells = withFeature(cells, 'h8', { kind: 'peak', names: {} });
    const named = nameCells(cells);
    expect(named.get('h8')?.ground).toBe('summit, 210 m');
    expect(named.get('a1')?.ground).toBe('low ground, 0 m');
  });
});

describe('assignPieces — rules', () => {
  it('gives the king the biggest settlement, the rook the peak, the bishop the church, the knight the ford', () => {
    let cells = plainCells((sq) => rankIndex(sq) * 5);
    cells = withFeature(cells, 'b2', {
      kind: 'place',
      subtype: 'village',
      names: { name: 'Rievaulx' },
    });
    cells = withFeature(cells, 'g3', {
      kind: 'place',
      subtype: 'hamlet',
      names: { name: 'Griff' },
    });
    cells = withFeature(cells, 'c4', { kind: 'peak', names: { name: 'Ashberry Hill' } });
    cells = withFeature(cells, 'f1', {
      kind: 'worship',
      subtype: 'christian',
      names: { name: 'St Mary the Virgin' },
    });
    cells = withFeature(cells, 'd3', { kind: 'ford', names: {} });
    const theme = buildBoardTheme(cells);
    const white = (t: string) => theme.pieces.filter((p) => p.color === 'white' && p.type === t);
    expect(white('king')[0]?.cell.name).toBe('Rievaulx');
    expect(white('queen')[0]?.cell.name).toBe('Griff');
    expect(white('rook')[0]?.cell.name).toBe('Ashberry Hill');
    expect(white('rook')[0]?.reason).toContain('summit');
    expect(white('bishop')[0]?.cell.name).toBe('St Mary the Virgin');
    expect(white('knight')[0]?.cell.square).toBe('d3');
    expect(white('knight')[0]?.reason).toContain('crossing');
    checkComplete(theme);
  });

  it('fills every identity on a board with no OSM data at all', () => {
    const theme = buildBoardTheme(
      plainCells((sq) => rankIndex(sq) * 12 + (sq.charCodeAt(0) - 97) * 3),
    );
    checkComplete(theme);
    // Rooks still go to the highest cells of each half.
    const wr = theme.pieces.filter((p) => p.color === 'white' && p.type === 'rook');
    for (const r of wr) expect(rankIndex(r.cell.square)).toBe(3);
    expect(wr[0]?.reason).toContain('highest ground');
    for (const p of theme.pieces) expect(p.cell.source).toBe('generated');
  });

  it('never reuses a cell within one colour and is deterministic', () => {
    const cells = plainCells();
    const a = buildBoardTheme(cells);
    const b = buildBoardTheme(cells);
    expect(b).toEqual(a);
    checkComplete(a);
  });

  it('recognises religious stems as whole words only', () => {
    expect(hasStem('St Mary the Virgin', RELIGIOUS_STEMS)).toBe(true);
    expect(hasStem('Rievaulx Abbey', RELIGIOUS_STEMS)).toBe(true);
    expect(hasStem('Cross Green', RELIGIOUS_STEMS)).toBe(true);
    expect(hasStem('Castle Point Lime Kilns', RELIGIOUS_STEMS)).toBe(false);
    expect(hasStem('Crossbow Lane', RELIGIOUS_STEMS)).toBe(false);
  });
});

describe('buildBoardTheme — the three fixture areas', () => {
  async function themeFor(name: string): Promise<BoardTheme> {
    const def = FIXTURE_AREAS.find((a) => a.name === name);
    const elev = fixtureEntries().find((e) => e.name === name);
    const feat = featureFixtureEntries().find((e) => e.name === name);
    if (def === undefined || elev === undefined || feat === undefined) throw new Error(name);
    const field = fixtureToField(await elev.load(), nodeBase64);
    const features = normalizeFeatures(
      parseOverpassResponse(await feat.load()),
      describeArea(def.area).projection,
    );
    const terrain = buildTerrainInputs(2000, field, features);
    const layout = new WarpedBoardLayout(terrain);
    const cover = classifyCellCover(layout, features, field);
    const { scale, baseMeters } = layout.terraceInfo;
    const facts = buildCellFacts(layout, features, cover, {
      yToMeters: (y) => (scale > 0 ? y / scale + baseMeters : baseMeters),
    });
    return buildBoardTheme(facts);
  }

  for (const def of FIXTURE_AREAS) {
    it(`${def.name}: complete and sensible`, async () => {
      const theme = await themeFor(def.name);
      checkComplete(theme);
      const named = [...theme.cells.values()].filter(
        (c) => c.source === 'name' || c.source === 'old_name' || c.source === 'historic',
      );
      expect(named.length, 'some cells carry real names').toBeGreaterThan(5);
    });
  }

  it('Rievaulx: the village is a king, the abbey a bishop, the hill a rook', async () => {
    const theme = await themeFor('rievaulx');
    const names = (color: string, type: string) =>
      theme.pieces.filter((p) => p.color === color && p.type === type).map((p) => p.cell.name);
    const all = theme.pieces.map((p) => `${p.color} ${p.type}: ${p.cell.name}`);
    expect(
      all.some((s) => (s.includes('king') || s.includes('queen')) && s.includes('Rievaulx')),
    ).toBe(true);
    expect(
      [...names('white', 'bishop'), ...names('black', 'bishop')].some(
        (n) => n.includes('Abbey') || n.includes('St Mary') || n.includes('Church'),
      ),
    ).toBe(true);
    expect(
      [...names('white', 'rook'), ...names('black', 'rook')].some((n) =>
        n.includes('Ashberry Hill'),
      ),
    ).toBe(true);
  });

  it('Glen Coe: rooks are summits or ridges', async () => {
    const theme = await themeFor('glencoe');
    const rooks = theme.pieces.filter((p) => p.type === 'rook');
    expect(rooks.some((r) => /summit|ridge|highest/.test(r.reason))).toBe(true);
  });
});
