// WHAT: The naming convention that turns a file in src/models/ into a piece.
// WHY:  Dropping a GLB in that folder is the whole of "add a piece", so the
//       filename IS the wiring. A name that does not parse is skipped silently
//       — which looks identical to a model that failed to load — so the rule
//       is worth pinning down where it can be read.

import { describe, expect, it } from 'vitest';

import { modelKeyFor } from '@world/pieces/loadPieceModels';

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
