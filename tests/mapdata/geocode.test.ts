// WHAT: Tests for the Nominatim parser and the RateLimiter.
// HOW:  The parser runs against a captured real response (Lindisfarne, 2026-09)
//       and against junk. The limiter is driven with a fake clock and sleep so
//       the test is instant and deterministic.
// WHY:  These are the two pieces of the geocoder that can be tested without
//       the network, and the two most likely to break quietly.

import { describe, expect, it } from 'vitest';

import { RateLimiter } from '@mapdata/cache/RateLimiter';
import { parseNominatim } from '@mapdata/geocode/NominatimGeocoder';

const FIXTURE: unknown = [
  {
    place_id: 273664388,
    licence: 'Data © OpenStreetMap contributors, ODbL 1.0. http://osm.org/copyright',
    osm_type: 'relation',
    osm_id: 6047801,
    lat: '55.6785261',
    lon: '-1.7936781',
    category: 'place',
    type: 'island',
    place_rank: 17,
    importance: 0.5190227986592623,
    addresstype: 'island',
    name: 'Holy Island of Lindisfarne',
    display_name:
      'Holy Island of Lindisfarne, Holy Island, Northumberland, North East, England, United Kingdom',
    boundingbox: ['55.6677028', '55.6893113', '-1.8547609', '-1.7784524'],
  },
];

describe('parseNominatim', () => {
  it('extracts name, display name and a numeric centre', () => {
    const [place] = parseNominatim(FIXTURE);
    expect(place).toEqual({
      name: 'Holy Island of Lindisfarne',
      displayName:
        'Holy Island of Lindisfarne, Holy Island, Northumberland, North East, England, United Kingdom',
      center: { lat: 55.6785261, lon: -1.7936781 },
    });
  });

  it('falls back to the first display_name segment when name is missing', () => {
    const [place] = parseNominatim([{ lat: '1', lon: '2', display_name: 'Somewhere, Region' }]);
    expect(place?.name).toBe('Somewhere');
  });

  it('skips malformed entries and returns an empty list for none', () => {
    expect(parseNominatim([])).toEqual([]);
    expect(parseNominatim([{ lat: 'x', lon: '2', display_name: 'a' }, null, 42])).toEqual([]);
  });

  it('rejects a non-array body', () => {
    expect(() => parseNominatim({ error: 'Unable to geocode' })).toThrow(TypeError);
  });
});

describe('RateLimiter', () => {
  it('lets the first call through immediately and spaces the rest', async () => {
    let clock = 0;
    const sleeps: number[] = [];
    const limiter = new RateLimiter(
      1000,
      () => clock,
      (ms) => {
        sleeps.push(ms);
        clock += ms;
        return Promise.resolve();
      },
    );

    await limiter.acquire();
    expect(sleeps).toEqual([]);

    clock += 300;
    await limiter.acquire();
    expect(sleeps).toEqual([700]);

    clock += 5000;
    await limiter.acquire();
    expect(sleeps).toEqual([700]);
  });

  it('serialises concurrent callers in order', async () => {
    let clock = 0;
    const order: number[] = [];
    const limiter = new RateLimiter(
      100,
      () => clock,
      (ms) => {
        clock += ms;
        return Promise.resolve();
      },
    );
    await Promise.all([
      limiter.acquire().then(() => order.push(1)),
      limiter.acquire().then(() => order.push(2)),
      limiter.acquire().then(() => order.push(3)),
    ]);
    expect(order).toEqual([1, 2, 3]);
    expect(clock).toBe(200);
  });
});
