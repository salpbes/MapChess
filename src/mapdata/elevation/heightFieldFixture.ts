// WHAT: Serialisation of a HeightField to and from a compact JSON fixture.
// HOW:  Heights are stored as Int16 decimetres (±3276 m, 0.1 m precision)
//       base64-encoded, alongside the grid geometry and the SelectedArea the
//       field was built for. Pure functions; no Node or browser APIs beyond
//       base64, which is provided by the caller for portability.
// WHY:  Three offline fixture areas (BUILD_PLAN Phase 6) must load with no
//       network and be small enough to ship in the bundle. A 2.4 km field at
//       10 m is ~58k samples: 116 KB as Int16 vs 232 KB as Float32.

import { createHeightField } from '@mapdata/model/HeightField';
import type { HeightField } from '@mapdata/model/HeightField';
import type { SelectedArea } from '@mapdata/model/SelectedArea';

export interface HeightFieldFixture {
  readonly format: 'mapchess-heightfield-v1';
  readonly name: string;
  readonly description: string;
  readonly area: SelectedArea;
  readonly originX: number;
  readonly originZ: number;
  readonly stepMeters: number;
  readonly cols: number;
  readonly rows: number;
  /** Int16 little-endian decimetres, base64. */
  readonly data: string;
  readonly source: string;
}

export interface Base64Codec {
  encode(bytes: Uint8Array): string;
  decode(text: string): Uint8Array;
}

const DECIMETRES = 10;

export function fieldToFixture(
  field: HeightField,
  area: SelectedArea,
  meta: { name: string; description: string; source: string },
  b64: Base64Codec,
): HeightFieldFixture {
  const ints = new Int16Array(field.data.length);
  for (let i = 0; i < field.data.length; i += 1) {
    const dm = Math.round((field.data[i] ?? 0) * DECIMETRES);
    ints[i] = Math.max(-32768, Math.min(32767, dm));
  }
  return {
    format: 'mapchess-heightfield-v1',
    ...meta,
    area,
    originX: field.originX,
    originZ: field.originZ,
    stepMeters: field.stepMeters,
    cols: field.cols,
    rows: field.rows,
    data: b64.encode(new Uint8Array(ints.buffer)),
  };
}

export function fixtureToField(fixture: HeightFieldFixture, b64: Base64Codec): HeightField {
  // Fixtures arrive from JSON; the cast at the import site is not a guarantee.
  const format: unknown = fixture.format;
  if (format !== 'mapchess-heightfield-v1') {
    throw new TypeError(`Unknown fixture format ${String(format)}`);
  }
  const bytes = b64.decode(fixture.data);
  const ints = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
  const data = new Float32Array(ints.length);
  for (let i = 0; i < ints.length; i += 1) data[i] = (ints[i] ?? 0) / DECIMETRES;
  return createHeightField(
    fixture.originX,
    fixture.originZ,
    fixture.stepMeters,
    fixture.cols,
    fixture.rows,
    data,
  );
}

/** True if two areas describe the same board to within a few metres and a degree. */
export function sameArea(a: SelectedArea, b: SelectedArea): boolean {
  return (
    Math.abs(a.centerLat - b.centerLat) < 1e-5 &&
    Math.abs(a.centerLon - b.centerLon) < 1e-5 &&
    Math.abs(a.sizeMeters - b.sizeMeters) < 1 &&
    Math.abs(((a.rotationDeg - b.rotationDeg + 540) % 360) - 180) < 0.5
  );
}
