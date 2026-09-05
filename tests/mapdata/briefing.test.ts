// WHAT: Tests for the gazetteer entry shown beside the board.
// HOW:  Hand-built inputs for the edge cases, then the three offline fixture
//       areas through the real pipeline so the prose can be read as a whole.
// WHY:  Every sentence claims something about a real place. The rule this file
//       exists to protect is that the briefing only ever counts or quotes what
//       OpenStreetMap recorded: no dates, no events, nothing invented. A test
//       cannot check for invention directly, but it can check that an area with
//       no data produces a short honest entry rather than a padded one.

import { describe, expect, it } from 'vitest';

import { FlatBoardLayout } from '@domain/board/FlatBoardLayout';
import { WarpedBoardLayout } from '@domain/board/WarpedBoardLayout';
import { buildBriefing } from '@mapdata/board/buildBriefing';
import type { CellCover } from '@mapdata/board/classifyCellCover';
import { classifyCellCover } from '@mapdata/board/classifyCellCover';
import { buildTerrainInputs } from '@mapdata/board/buildTerrainInputs';
import { fixtureEntries } from '@mapdata/elevation/fixtureAreas';
import { fixtureToField } from '@mapdata/elevation/heightFieldFixture';
import { featureFixtureEntries } from '@mapdata/features/FixtureFeatureProvider';
import { normalizeFeatures, parseOverpassResponse } from '@mapdata/features/normalizeOverpass';
import { createHeightField } from '@mapdata/model/HeightField';
import type { HeightField } from '@mapdata/model/HeightField';
import { FIXTURE_AREAS } from '@mapdata/model/fixtureAreas';
import { describeArea } from '@mapdata/model/MapArea';
import type { MapFeature } from '@mapdata/model/MapFeature';
import type { Base64Codec } from '@mapdata/elevation/heightFieldFixture';

/** Node has no atob/btoa in this environment; the fixtures are base64 PNG data. */
const nodeBase64: Base64Codec = {
  encode: (bytes: Uint8Array) => Buffer.from(bytes).toString('base64'),
  decode: (text: string) => new Uint8Array(Buffer.from(text, 'base64')),
};

const BOARD = 2000;
const flat = new FlatBoardLayout({ boardSizeMeters: BOARD });

function level(height: number): HeightField {
  const cols = 9;
  const step = BOARD / (cols - 1);
  return createHeightField(
    -BOARD / 2,
    -BOARD / 2,
    step,
    cols,
    cols,
    new Float32Array(cols * cols).fill(height),
  );
}

function allGrass(): CellCover {
  return new Map(flat.cells.map((c) => [c.square, 'grass' as const]));
}

describe('buildBriefing — an empty square of the world', () => {
  const briefing = buildBriefing({
    features: [],
    heights: level(40),
    cover: allGrass(),
    bounds: flat.bounds,
  });

  it('admits it does not know the place', () => {
    expect(briefing.title).toBe('Unnamed ground');
  });

  it('says so plainly rather than padding the entry', () => {
    expect(briefing.remark).toContain('almost nothing to say');
    expect(briefing.lines.length).toBeLessThanOrEqual(3);
  });

  it('still reports the ground, which elevation always knows', () => {
    expect(briefing.lines.some((l) => l.label === 'Ground')).toBe(true);
  });

  it('does not claim anybody lives there', () => {
    const settled = briefing.lines.find((l) => l.label === 'Settled');
    expect(settled?.text).toContain('Nobody lives here');
  });
});

describe('buildBriefing — what it says about real ground', () => {
  async function forFixture(name: string) {
    const def = FIXTURE_AREAS.find((a) => a.name === name);
    const elev = fixtureEntries().find((e) => e.name === name);
    const feat = featureFixtureEntries().find((e) => e.name === name);
    if (def === undefined || elev === undefined || feat === undefined) throw new Error(name);
    const heights = fixtureToField(await elev.load(), nodeBase64);
    const features: readonly MapFeature[] = normalizeFeatures(
      parseOverpassResponse(await feat.load()),
      describeArea(def.area).projection,
    );
    const layout = new WarpedBoardLayout(buildTerrainInputs(BOARD, heights, features));
    const cover = classifyCellCover(layout, features, heights);
    return buildBriefing({ features, heights, cover, bounds: layout.bounds });
  }

  it('names Rievaulx and remembers its abbey', async () => {
    const b = await forFixture('rievaulx');
    expect(b.title).toContain('Rievaulx');
    const remembered = b.lines.find((l) => l.label === 'Remembered')?.text ?? '';
    expect(remembered.toLowerCase()).toContain('abbey');
  });

  it('gives Glen Coe its relief', async () => {
    const b = await forFixture('glencoe');
    const ground = b.lines.find((l) => l.label === 'Ground')?.text ?? '';
    // A Highland glen: hundreds of metres between the floor and the tops.
    expect(ground).toMatch(/rise of \d{3} m/);
  });

  it('notices the sea at Lindisfarne', async () => {
    const b = await forFixture('lindisfarne');
    const said = [b.remark, ...b.lines.map((l) => l.text)].join(' ');
    expect(said.toLowerCase()).toMatch(/sea|tidal/);
  });

  it('finishes every sentence and never leaves a hole in one', async () => {
    for (const name of ['rievaulx', 'glencoe', 'lindisfarne']) {
      const b = await forFixture(name);
      for (const line of [...b.lines.map((l) => l.text), b.remark]) {
        expect(line, `${name}: ${line}`).toMatch(/[.!]$/);
        expect(line, name).not.toContain('undefined');
        expect(line, name).not.toContain('null');
        expect(line, name).not.toContain('NaN');
        expect(line, name).not.toMatch(/\s,|,\s*\./);
      }
    }
  });
});
