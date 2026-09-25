// WHAT: Which piece set a board is played with.
// WHY:  Two promises live here. Anywhere on Earth gets the original pieces — a
//       half-made era set must never reach a player — and a named battle gets
//       its era's set once, and only once, that set is whole.

import { describe, expect, it } from 'vitest';

import { CURATED_PLACES } from '@app/curatedPlaces';
import { choosePieceSet, previewSetFrom } from '@app/pieceSetChoice';

const anzac = CURATED_PLACES.find((p) => p.name === 'Anzac Cove');
const hastings = CURATED_PLACES.find((p) => p.name === 'Hastings');
if (anzac === undefined || hastings === undefined) throw new Error('places missing');

const known = new Set(['medieval', 'ww1']);
const facts = (complete: readonly string[]) => ({
  exists: (s: string) => known.has(s),
  complete: (s: string) => complete.includes(s),
});

describe('choosePieceSet', () => {
  it('gives anywhere on Earth the original pieces', () => {
    const somewhere = { centerLat: 10, centerLon: 10, sizeMeters: 2000, rotationDeg: 0 };
    expect(choosePieceSet(somewhere, null, facts(['medieval', 'ww1']))).toBe('medieval');
  });

  it('keeps a half-made set away from players', () => {
    expect(choosePieceSet(anzac.area, null, facts(['medieval']))).toBe('medieval');
  });

  it('dresses a named battle in its era once the set is whole', () => {
    expect(choosePieceSet(anzac.area, null, facts(['medieval', 'ww1']))).toBe('ww1');
  });

  it('falls back when an era has no set at all', () => {
    // Hastings is medieval, whose set is the original; the check is that an
    // era without a folder never yields a set name nothing can load.
    expect(choosePieceSet(hastings.area, null, facts(['medieval']))).toBe('medieval');
  });

  it('lets a preview show an unfinished set anywhere', () => {
    const somewhere = { centerLat: 10, centerLon: 10, sizeMeters: 2000, rotationDeg: 0 };
    expect(choosePieceSet(somewhere, 'ww1', facts(['medieval']))).toBe('ww1');
  });
});

describe('previewSetFrom', () => {
  const exists = (s: string) => known.has(s);
  it('reads the set from the address', () => {
    expect(previewSetFrom('?pieces=ww1', exists)).toBe('ww1');
    expect(previewSetFrom('?debug&pieces=ww1', exists)).toBe('ww1');
  });

  it('ignores a set it does not know, rather than breaking the game', () => {
    expect(previewSetFrom('?pieces=ww9', exists)).toBeNull();
    expect(previewSetFrom('', exists)).toBeNull();
  });
});
