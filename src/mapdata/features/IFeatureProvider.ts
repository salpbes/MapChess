// WHAT: The feature seam.
// HOW:  One method: give me the map features for this area, in board metres.
//       Implementations decide the source (Overpass, a cache, a fixture).
// WHY:  Phase 8 and Phase 10 consume MapFeature[]; they must not know that
//       Overpass exists. If the source changes (a self-hosted instance, a
//       vector-tile extract), one implementation changes.

import type { MapArea } from '@mapdata/model/MapArea';
import type { MapFeature } from '@mapdata/model/MapFeature';

export interface FeatureRequestOptions {
  readonly signal?: AbortSignal;
}

export interface FeatureResult {
  readonly features: readonly MapFeature[];
  readonly source: 'network' | 'cache' | 'fixture';
  readonly elapsedMs: number;
}

export interface IFeatureProvider {
  getFeatures(area: MapArea, options?: FeatureRequestOptions): Promise<FeatureResult>;
}
