// WHAT: The player's chosen patch of the world, and the geographic primitives
//       around it.
// HOW:  Plain data. `SelectedArea` is exactly what the picker outputs and what
//       a saved game must store to rebuild its board. `rotationDeg` is the
//       compass bearing of the board's "north" (rank 8) edge, clockwise from
//       true north, so 0 means White sits at the geographic south.
// WHY:  Everything map-related keys off these four numbers. Keeping them free
//       of derived values means there is exactly one source of truth to save,
//       load and compare.

export interface LatLon {
  readonly lat: number;
  readonly lon: number;
}

export interface SelectedArea {
  readonly centerLat: number;
  readonly centerLon: number;
  /** Side length of the square, in metres. */
  readonly sizeMeters: number;
  /** Bearing of the board's north edge, clockwise from true north, in degrees. */
  readonly rotationDeg: number;
}

/** Throws RangeError on anything that cannot describe a real square on Earth. */
export function assertValidArea(area: SelectedArea): void {
  if (!Number.isFinite(area.centerLat) || Math.abs(area.centerLat) > 85) {
    throw new RangeError(`centerLat out of range: ${String(area.centerLat)}`);
  }
  if (!Number.isFinite(area.centerLon) || Math.abs(area.centerLon) > 180) {
    throw new RangeError(`centerLon out of range: ${String(area.centerLon)}`);
  }
  if (!(area.sizeMeters > 0) || !Number.isFinite(area.sizeMeters)) {
    throw new RangeError(`sizeMeters must be positive: ${String(area.sizeMeters)}`);
  }
  if (!Number.isFinite(area.rotationDeg)) {
    throw new RangeError(`rotationDeg must be finite: ${String(area.rotationDeg)}`);
  }
}

/** Normalises any angle to [0, 360). */
export function normaliseBearing(deg: number): number {
  const r = deg % 360;
  return r < 0 ? r + 360 : r;
}
