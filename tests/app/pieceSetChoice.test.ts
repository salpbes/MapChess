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

  it('dresses every First World War place in the WW1 set, not just Anzac Cove', () => {
    const ww1 = CURATED_PLACES.filter((p) => p.era === 'ww1');
    expect(ww1.map((p) => p.name).sort()).toEqual(['Anzac Cove', 'Kobarid', 'Verdun']);
    for (const place of ww1) {
      expect(choosePieceSet(place.area, null, facts(['medieval', 'ww1'])), place.name).toBe('ww1');
    }
  });

  it('keeps every other famous place on the original set', () => {
    for (const place of CURATED_PLACES.filter((p) => p.era !== 'ww1')) {
      expect(choosePieceSet(place.area, null, facts(['medieval', 'ww1'])), place.name).toBe(
        'medieval',
      );
    }
  });

  it('stops calling it a WW1 board once the square is dragged off the battlefield', () => {
    const verdun = CURATED_PLACES.find((p) => p.name === 'Verdun');
    if (verdun === undefined) throw new Error('Verdun missing');
    const nudged = { ...verdun.area, centerLat: verdun.area.centerLat + 0.001 };
    expect(choosePieceSet(nudged, null, facts(['medieval', 'ww1']))).toBe('medieval');
  });

  it('dresses a named battle in its era once the set is whole', () => {
    expect(choosePieceSet(anzac.area, null, facts(['medieval', 'ww1']))).toBe('ww1');
  });

  it('dresses a battle in the armies that fought there, not just its era', () => {
    const stalingrad = CURATED_PLACES.find((p) => p.name === 'Mamayev Kurgan');
    const cassino = CURATED_PLACES.find((p) => p.name === 'Monte Cassino');
    if (stalingrad === undefined || cassino === undefined) throw new Error('places missing');
    const ww2 = {
      exists: (s: string) => ['medieval', 'ww2', 'ww2-east'].includes(s),
      complete: () => true,
    };
    expect(choosePieceSet(stalingrad.area, null, ww2)).toBe('ww2-east');
    expect(choosePieceSet(cassino.area, null, ww2)).toBe('ww2');
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
