// WHAT: The theming layer's vocabulary — inputs it scores and identities it produces.
// HOW:  Plain types. `CellFacts` is what the adapter in mapdata/theme builds
//       for each square; `CellIdentity` and `PieceIdentity` are what the game
//       and UI read. Feature kinds are a small closed list the scorer cares
//       about, not the full mapdata list.
// WHY:  domain/ cannot import mapdata/. Giving the theme its own vocabulary
//       keeps it pure and testable with hand-written facts, and makes "what
//       makes a rook a rook" readable in one place.

import type { Square } from '@domain/board/Square';
import type { Color, PieceType } from '@domain/chess/types';

export type ThemeFeatureKind =
  | 'peak'
  | 'saddle'
  | 'ridge'
  | 'ford'
  | 'place'
  | 'historic'
  | 'worship'
  | 'waterway'
  | 'water'
  | 'coastline'
  | 'wood'
  | 'scrub';

export interface ThemeNames {
  readonly name?: string;
  readonly oldName?: string;
  readonly historicName?: string;
  readonly altName?: string;
}

export interface ThemeFeature {
  readonly kind: ThemeFeatureKind;
  /** OSM value: 'village', 'river', 'monastery', 'christian'… or null. */
  readonly subtype: string | null;
  readonly names: ThemeNames;
  /** Metres from the cell centroid; 0 for features inside the cell. */
  readonly distanceMeters: number;
  readonly elevationMeters: number | null;
}

export type CoverName = 'grass' | 'wood' | 'scrub' | 'water' | 'sand';

export interface CellFacts {
  readonly square: Square;
  /** Real metres above sea level of the platform. */
  readonly heightMeters: number;
  readonly cover: CoverName;
  /** Features inside the cell (distance 0) and named features nearby, nearest first. */
  readonly features: readonly ThemeFeature[];
  /** True when the board edge here is open sea. */
  readonly coastal: boolean;
}

export type NameSource = 'old_name' | 'historic' | 'name' | 'nearby' | 'generated';

export interface CellIdentity {
  readonly square: Square;
  readonly name: string;
  readonly source: NameSource;
  /** Short description of the ground: "peak, 412 m", "wooded slope", "tidal sands". */
  readonly ground: string;
  readonly heightMeters: number;
}

export interface PieceIdentity {
  readonly color: Color;
  readonly type: PieceType;
  /** Where the piece starts; its identity travels with it. */
  readonly homeSquare: Square;
  /** The cell whose name and story the piece carries. */
  readonly cell: CellIdentity;
  /** One sentence: why this place is this piece. */
  readonly reason: string;
}

export interface BoardTheme {
  readonly cells: ReadonlyMap<Square, CellIdentity>;
  readonly pieces: readonly PieceIdentity[];
}
