// WHAT: Tests for the procedural piece geometry.
// HOW:  Builds each of the six pieces and measures the result — triangle
//       counts, bounding boxes, footprint. Lathe and extrude are pure maths in
//       three.js, needing no WebGL and no DOM, so they run in the same node
//       environment as everything else.
// WHY:  This is the one corner of world/ that can be tested (BUILD_PLAN §3
//       exempts the scene, not the arithmetic behind it), and it is worth it:
//       the pieces are told apart by their silhouettes alone, and a profile is
//       a list of numbers that no compiler checks. A pawn creeping up to a
//       bishop's height, or an extruded outline quietly failing to triangulate,
//       would otherwise only show up by eye — which is how the pawn and the
//       bishop came to look alike in the first place.

import { describe, expect, it } from 'vitest';
import { Box3, BufferAttribute, Vector3 } from 'three';
import type { BufferGeometry } from 'three';

import type { PieceType } from '@domain/chess/types';
import { createPieceGeometry } from '@world/pieces/PieceGeometry';

const UNIT = 100;
const TYPES: readonly PieceType[] = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'];

function build(type: PieceType): {
  geometry: BufferGeometry;
  positions: BufferAttribute;
  box: Box3;
} {
  const geometry = createPieceGeometry(type, UNIT);
  const positions = geometry.getAttribute('position');
  if (!(positions instanceof BufferAttribute)) {
    throw new Error(`${type} has interleaved positions; the builders produce plain ones.`);
  }
  return { geometry, positions, box: new Box3().setFromBufferAttribute(positions) };
}

/** Height in cell units, which is how the profiles are written. */
function heightOf(type: PieceType): number {
  return build(type).box.max.y / UNIT;
}

describe('createPieceGeometry', () => {
  it('builds solid, finite geometry for every piece', () => {
    for (const type of TYPES) {
      const { positions: position } = build(type);
      expect(position.count, type).toBeGreaterThan(0);
      // Non-indexed triangles: three vertices each, or the merge went wrong.
      expect(position.count % 3, type).toBe(0);
      const values = Array.from(position.array);
      expect(
        values.every((v) => Number.isFinite(v)),
        type,
      ).toBe(true);
    }
  });

  it('stands every piece on the board, not through it', () => {
    for (const type of TYPES) {
      const { box } = build(type);
      expect(box.min.y, type).toBeCloseTo(0, 5);
      expect(box.max.y, type).toBeGreaterThan(0);
    }
  });

  it('keeps every footprint inside the plinth the lattice reserves', () => {
    // latticeWarp guarantees a minimum inradius on the assumption of 0.30 cells.
    for (const type of TYPES) {
      const { box } = build(type);
      for (const extent of [box.max.x, -box.min.x, box.max.z, -box.min.z]) {
        expect(extent / UNIT, type).toBeLessThanOrEqual(0.3 + 1e-6);
      }
    }
  });

  it('orders the pieces by height, pawn shortest and king tallest', () => {
    const byHeight = [...TYPES].sort((a, b) => heightOf(a) - heightOf(b));
    expect(byHeight[0]).toBe('pawn');
    // The king's lathe stops below the queen's; its cross is what puts it on top.
    expect(byHeight[byHeight.length - 1]).toBe('king');
  });

  it('leaves a wide gap between the pawn and the bishop', () => {
    // They were confused for each other when the ratio was 1.45; shape carries
    // most of the distinction now, but height must not quietly close up again.
    expect(heightOf('bishop') / heightOf('pawn')).toBeGreaterThan(1.55);
  });

  it('keeps the bishop below the royals', () => {
    expect(heightOf('bishop')).toBeLessThan(heightOf('king'));
    expect(heightOf('bishop')).toBeLessThan(heightOf('queen'));
  });

  it('gives the bishop and the knight a facing, and the turned pieces none', () => {
    // A solid of revolution is as deep as it is wide; an extruded silhouette is
    // not, and that asymmetry is what stops the bishop reading as another blob.
    // Measured over the top quarter only. Lower down every piece is round —
    // the plinth is a shared disc and the bishop's brim is a turned flare — so
    // a whole-piece bounding box reports the same square footprint for all six.
    // Orientation-agnostic: the extruded heads are turned to face −Z, so which
    // axis carries the width depends on that rotation and is not the point.
    const headAsymmetry = (type: PieceType): number => {
      const { positions: position, box } = build(type);
      const head = new Box3();
      const vertex = new Vector3();
      for (let i = 0; i < position.count; i += 1) {
        vertex.fromBufferAttribute(position, i);
        if (vertex.y > box.max.y * 0.75) head.expandByPoint(vertex);
      }
      const width = head.max.x - head.min.x;
      const depth = head.max.z - head.min.z;
      return Math.max(width, depth) / Math.min(width, depth);
    };
    expect(headAsymmetry('bishop')).toBeGreaterThan(1.25);
    expect(headAsymmetry('knight')).toBeGreaterThan(1.25);
    for (const turned of ['pawn', 'rook', 'queen', 'king'] as const) {
      expect(headAsymmetry(turned), turned).toBeCloseTo(1, 5);
    }
  });
});
