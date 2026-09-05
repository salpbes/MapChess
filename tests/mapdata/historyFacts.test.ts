// WHAT: Tests for reading Wikidata's answer.
// HOW:  Canned `wbgetentities` payloads — the real shapes, trimmed — so nothing
//       here touches the network. Includes the actual claims returned for
//       Rievaulx Abbey (Q1247496) when this was written.
// WHY:  This is the one place in MapChess that states historical fact, and it
//       must only ever repeat what the database said. A parser that guessed a
//       year, or attached one entity's date to another's name, would produce a
//       confident falsehood about a real place — which is exactly the failure
//       Wikidata was chosen to avoid.

import { describe, expect, it } from 'vitest';

import {
  describeFact,
  isWorthPrinting,
  labelsOf,
  referencedIds,
  toFacts,
} from '@mapdata/history/historyFacts';
import type { WikidataResponse } from '@mapdata/history/historyFacts';
import { WikidataProvider } from '@mapdata/history/WikidataProvider';
import type { MapFeature } from '@mapdata/model/MapFeature';

/** Rievaulx Abbey as Wikidata actually answers, cut down to the read claims. */
const ABBEY: WikidataResponse = {
  entities: {
    Q1247496: {
      labels: { en: { value: 'Rievaulx Abbey' } },
      claims: {
        P571: [{ mainsnak: { datavalue: { value: { time: '+1132-03-05T00:00:00Z' } } } }],
        P31: [{ mainsnak: { datavalue: { value: { id: 'Q160742' } } } }],
        P1435: [{ mainsnak: { datavalue: { value: { id: 'Q219538' } } } }],
      },
    },
  },
};

const LABELS: WikidataResponse = {
  entities: {
    Q160742: { labels: { en: { value: 'abbey' } } },
    Q219538: { labels: { en: { value: 'scheduled monument' } } },
  },
};

describe('reading Wikidata', () => {
  it('asks for the entities the claims point at, and no others', () => {
    expect([...referencedIds(ABBEY)].sort()).toEqual(['Q160742', 'Q219538']);
  });

  it('reads the year out of a full timestamp', () => {
    const fact = toFacts(ABBEY, labelsOf(LABELS)).get('Q1247496');
    expect(fact?.year).toBe(1132);
    expect(fact?.label).toBe('Rievaulx Abbey');
    expect(fact?.kind).toBe('abbey');
    expect(fact?.heritage).toBe('scheduled monument');
  });

  it('writes the line the briefing prints', () => {
    const fact = toFacts(ABBEY, labelsOf(LABELS)).get('Q1247496');
    expect(fact === undefined ? null : describeFact(fact)).toBe(
      'abbey, founded 1132, scheduled monument',
    );
  });

  it('leaves out what the database did not say', () => {
    const sparse = toFacts(ABBEY, new Map()).get('Q1247496');
    // No labels supplied, so no kind and no heritage — but the date stands.
    expect(sparse?.kind).toBeNull();
    expect(sparse?.heritage).toBeNull();
    expect(sparse === undefined ? null : describeFact(sparse)).toBe('founded 1132');
  });

  it('handles a date before the common era', () => {
    const bc: WikidataResponse = {
      entities: {
        Q1: {
          labels: { en: { value: 'Old Fort' } },
          claims: {
            P571: [{ mainsnak: { datavalue: { value: { time: '-0400-01-01T00:00:00Z' } } } }],
          },
        },
      },
    };
    const fact = toFacts(bc, new Map()).get('Q1');
    expect(fact?.year).toBe(-400);
    expect(fact === undefined ? null : describeFact(fact)).toBe('from 400 BC');
  });

  it('invents nothing when the payload is empty, malformed or unexpected', () => {
    for (const payload of [
      {},
      { entities: {} },
      { entities: { Q1: {} } },
      { entities: { Q1: { claims: { P571: [{}] } } } },
      { entities: { Q1: { claims: { P571: [{ mainsnak: { datavalue: { value: 'soon' } } }] } } } },
    ] as WikidataResponse[]) {
      for (const fact of toFacts(payload, new Map()).values()) {
        expect(fact.year).toBeNull();
        expect(fact.kind).toBeNull();
        expect(fact.heritage).toBeNull();
        expect(describeFact(fact)).toBeNull();
      }
    }
  });

  it('will not print a line that only repeats what the board already shows', () => {
    // "Aonach Dubh — mountain" is true and useless.
    const plain = { id: 'Q1', label: 'Aonach Dubh', year: null, kind: 'mountain', heritage: null };
    expect(isWorthPrinting(plain)).toBe(false);
    expect(isWorthPrinting({ ...plain, year: 1132 })).toBe(true);
    expect(isWorthPrinting({ ...plain, heritage: 'scheduled monument' })).toBe(true);
  });
});

describe('WikidataProvider', () => {
  it('makes no request at all for a board with nothing linked', async () => {
    // `fetch` is undefined in this environment, so a request would throw.
    const provider = new WikidataProvider(null);
    const features: MapFeature[] = [
      {
        id: 'node/1',
        kind: 'peak',
        subtype: null,
        names: { name: 'Nameless Fell' },
        elevationMeters: 300,
        wikidata: null,
        geometry: { type: 'point', point: { x: 0, z: 0 } },
      },
    ];
    await expect(provider.factsFor(features)).resolves.toEqual(new Map());
  });
});
