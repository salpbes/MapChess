// WHAT: A real-world map feature, normalised and in board-local metres.
// HOW:  One `kind` from a closed list, an optional `subtype` (the OSM value,
//       e.g. 'village', 'stream'), geometry as point / line / polygon in
//       BoardPoints, and every name variant OSM offered. No raw tags.
// WHY:  Phase 8 warps cell corners onto waterways and around peaks; Phase 10
//       assigns piece identities from kinds and names. Both read this and
//       only this. Raw Overpass JSON never leaves mapdata/features/.

import type { BoardPoint } from '@domain/board/types';

export type FeatureKind =
  | 'waterway' // river, stream, canal, drain, ditch — line
  | 'water' // lake, pond, reservoir — polygon
  | 'coastline' // line, land on the left in OSM's direction
  | 'wood' // forest — polygon
  | 'scrub' // scrub, heath, moor, wetland, grassland — polygon
  | 'peak' // point
  | 'saddle' // pass — point
  | 'ridge' // ridge, arete, cliff — line
  | 'ford' // crossing — point or line
  | 'place' // settlement or named locality — point
  | 'historic' // castle, abbey, ruin, monument… — point (polygons reduced to centroid)
  | 'worship'; // church, chapel — point (religious names for Phase 10)

export type FeatureGeometry =
  | { readonly type: 'point'; readonly point: BoardPoint }
  | { readonly type: 'line'; readonly points: readonly BoardPoint[] }
  | { readonly type: 'polygon'; readonly ring: readonly BoardPoint[] };

export interface FeatureNames {
  readonly name?: string;
  readonly oldName?: string;
  /** `historic:name` or, for Gaelic/Welsh areas, the native-language name. */
  readonly historicName?: string;
  readonly altName?: string;
  readonly etymology?: string;
}

export interface MapFeature {
  /** "node/123", "way/456", "relation/789" — stable across fetches. */
  readonly id: string;
  readonly kind: FeatureKind;
  readonly subtype: string | null;
  readonly geometry: FeatureGeometry;
  readonly names: FeatureNames;
  readonly elevationMeters: number | null;
}

export const FEATURE_KINDS: readonly FeatureKind[] = [
  'waterway',
  'water',
  'coastline',
  'wood',
  'scrub',
  'peak',
  'saddle',
  'ridge',
  'ford',
  'place',
  'historic',
  'worship',
];

export function hasAnyName(f: MapFeature): boolean {
  const n = f.names;
  return (
    n.name !== undefined ||
    n.oldName !== undefined ||
    n.historicName !== undefined ||
    n.altName !== undefined
  );
}
