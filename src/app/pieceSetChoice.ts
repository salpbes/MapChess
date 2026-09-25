// WHAT: Which piece set a board is played with.
// HOW:  A preview asked for in the address wins; then a named battlefield whose
//       era has a finished set; then the original set, everywhere else.
// WHY:  "Play anywhere" is the game, and anywhere gets the original pieces. A
//       named battle is the one place the game knows enough to dress the board
//       for, and only once the set is whole — a Gallipoli pawn beside a
//       medieval knight is a work in progress, not a board. The preview is how
//       the person making the set sees it on real ground while it is half done,
//       without any player seeing it at all.
//
//       Pure, and handed its facts about the sets rather than reading them, so
//       the rule can be tested without a single model on disk.

import { DEFAULT_PIECE_SET } from '@world/pieces/loadPieceModels';
import type { SelectedArea } from '@mapdata/model/SelectedArea';

import { curatedPlaceAt } from './curatedPlaces';

export interface PieceSetFacts {
  /** A set this app knows the armies of. */
  readonly exists: (set: string) => boolean;
  /** All twelve pieces present. */
  readonly complete: (set: string) => boolean;
}

export function choosePieceSet(
  area: SelectedArea,
  preview: string | null,
  facts: PieceSetFacts,
): string {
  if (preview !== null && facts.exists(preview)) return preview;
  // Sets are named after the era they dress, so a WW1 battle looks for "ww1".
  const place = curatedPlaceAt(area);
  if (place !== null && facts.exists(place.era) && facts.complete(place.era)) return place.era;
  return DEFAULT_PIECE_SET;
}

/**
 * `?pieces=ww1` from the address, if it names a set this app knows. An unknown
 * name is ignored rather than failed on: a typo in a preview link should leave
 * the ordinary game, not a broken one.
 */
export function previewSetFrom(search: string, exists: (set: string) => boolean): string | null {
  const asked = new URLSearchParams(search).get('pieces');
  return asked !== null && exists(asked) ? asked : null;
}
