// WHAT: The colour palette of the landscape.
// HOW:  One hex per role; cell tops have a light and a dark variant so the
//       chess checkerboard survives whatever the land cover is.
// WHY:  Low-poly (D-002) lives on a small, deliberate palette. Every colour in
//       one file makes "the board reads badly" a five-minute fix.

import type { CoverKind } from '@mapdata/board/classifyCellCover';

export interface Shaded {
  readonly light: number;
  readonly dark: number;
}

export const CELL_TOP: Readonly<Record<CoverKind, Shaded>> = {
  grass: { light: 0x8fb56a, dark: 0x6f955a },
  wood: { light: 0x4e7a48, dark: 0x3b6238 },
  scrub: { light: 0xa8a56c, dark: 0x8a8858 },
  water: { light: 0x4b8bc6, dark: 0x3d78b0 },
  sand: { light: 0xdccfa6, dark: 0xc9bb90 },
};

/** The vertical faces between terraces: cut earth. */
export const RISER = 0x6b5847;
/** Thin line along every platform edge, so cells read even where covers match. */
export const CELL_EDGE = 0x2b2a26;

export const TERRAIN_LOW = 0x7d9d5e;
export const TERRAIN_HIGH = 0x8c7f6a;
export const TERRAIN_PEAK = 0xb9b4aa;

export const RIVER = 0x4f95d6;
export const LAKE = 0x3f7fbe;
export const SEA = 0x2f6ba6;

export const LABEL_TEXT = '#f4efe4';
export const LABEL_BACK = 'rgba(28, 30, 34, 0.72)';
