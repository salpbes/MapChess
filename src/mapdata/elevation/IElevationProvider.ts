// WHAT: The elevation seam.
// HOW:  One method: give me the ground heights for this area, as a HeightField
//       already in board-local metres. Implementations decide where the data
//       comes from (network tiles, local fixtures, a cache).
// WHY:  The board builder (Phase 8) and the terrain mesh (Phase 9) must not
//       know about tiles, PNGs or S3. If Terrarium ever disappears, the swap
//       is one implementation behind this line.

import type { HeightField } from '@mapdata/model/HeightField';
import type { MapArea } from '@mapdata/model/MapArea';

export interface ElevationRequestOptions {
  readonly signal?: AbortSignal;
  /** Called as tiles arrive, for a progress indicator. */
  readonly onProgress?: (done: number, total: number) => void;
}

export interface ElevationResult {
  readonly field: HeightField;
  /** Where it came from — the debug view shows this to prove the cache works. */
  readonly source: 'network' | 'cache' | 'fixture';
  readonly tileCount: number;
  readonly zoom: number;
}

export interface IElevationProvider {
  getHeightField(area: MapArea, options?: ElevationRequestOptions): Promise<ElevationResult>;
}
