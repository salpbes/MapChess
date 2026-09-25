// WHAT: The naming convention that turns a file in src/models/ into a piece.
// WHY:  Dropping a GLB in that folder is the whole of "add a piece", so the
//       filename IS the wiring. A name that does not parse is skipped silently
//       — which looks identical to a model that failed to load — so the rule
//       is worth pinning down where it can be read.

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PIECE_SET,
  isCompleteSet,
  modelKeyFor,
  pieceSetOf,
  piecesInSet,
} from '@world/pieces/loadPieceModels';
import { PIECE_SETS } from '@world/pieces/pieceSets';

describe('modelKeyFor', () => {
  it('reads type and colour out of the filename', () => {
    expect(modelKeyFor('../../models/rook_white.glb')).toBe('white-rook');
    expect(modelKeyFor('../../models/knight_black.glb')).toBe('black-knight');
  });

  it('accepts every piece type and both colours', () => {
    for (const type of ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king']) {
      for (const color of ['white', 'black']) {
        expect(modelKeyFor(`/models/${type}_${color}.glb`), `${type}_${color}`).toBe(
          `${color}-${type}`,
        );
      }
    }
  });

  it('does not care how the file was capitalised', () => {
    expect(modelKeyFor('/models/Rook_White.GLB')).toBe('white-rook');
  });

  it('skips anything that is not a piece, rather than guessing', () => {
    for (const odd of ['/models/rook.glb', '/models/rook_red.glb', '/models/castle_white.glb']) {
      expect(modelKeyFor(odd), odd).toBeNull();
    }
  });
});

describe('pieceSetOf', () => {
  it('reads the set from the folder a model sits in', () => {
    expect(pieceSetOf('../../chesspieces/compressed/medieval/rook_white.glb')).toBe('medieval');
    expect(pieceSetOf('../../chesspieces/compressed/ww1/anzac_pawn.glb')).toBe('ww1');
  });

  it('defaults to the set the original pieces were filed under', () => {
    // Every board that is not a named battle uses this, so it must be a folder
    // that actually has all twelve in it.
    expect(DEFAULT_PIECE_SET).toBe('medieval');
  });
});

describe('army-named pieces', () => {
  const ww1 = PIECE_SETS.ww1;
  if (ww1 === undefined) throw new Error('no ww1 set');

  it('reads the army as the colour its set gives it', () => {
    expect(modelKeyFor('/ww1/anzac_pawn.glb', ww1)).toBe('white-pawn');
    expect(modelKeyFor('/ww1/ottoman_pawn.glb', ww1)).toBe('black-pawn');
  });

  it('takes the two words either way round', () => {
    expect(modelKeyFor('/ww1/pawn_anzac.glb', ww1)).toBe('white-pawn');
    expect(modelKeyFor('/medieval/rook_white.glb')).toBe('white-rook');
  });

  it('skips an army the set does not field', () => {
    // A French pawn in the Gallipoli set is a file in the wrong folder, and a
    // silent guess at its colour would be worse than leaving it out.
    expect(modelKeyFor('/ww1/french_pawn.glb', ww1)).toBeNull();
  });
});

describe('complete sets', () => {
  const files = (names: readonly string[]) =>
    Object.fromEntries(
      names.map((n) => [`../../chesspieces/compressed/ww1/${n}.glb`, `/${n}.glb`]),
    );
  const types = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'];

  it('counts what a set has without loading any of it', () => {
    const two = files(['anzac_pawn', 'ottoman_pawn']);
    expect([...piecesInSet('ww1', two)].sort()).toEqual(['black-pawn', 'white-pawn']);
    expect(isCompleteSet('ww1', two)).toBe(false);
  });

  it('calls a set complete at all twelve', () => {
    const all = files(types.flatMap((t) => [`anzac_${t}`, `ottoman_${t}`]));
    expect(isCompleteSet('ww1', all)).toBe(true);
  });
});
