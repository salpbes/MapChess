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

  it('notches the rook and points the queen, so neither is a turned blob', () => {
    /*
      Players told each other apart badly exactly where the piece was still
      only a lathe: a rook read as a fat pawn, a queen as the king. The two
      fixes fail differently and so are measured differently — a battlement is
      a GAP in the outline, a coronet is material standing PROUD of the stem.
    */
    const inBand = (type: PieceType, from: number, to: number): Vector3[] => {
      const { positions: position, box } = build(type);
      const out: Vector3[] = [];
      for (let i = 0; i < position.count; i += 1) {
        const vertex = new Vector3().fromBufferAttribute(position, i);
        const height = vertex.y / box.max.y;
        if (height >= from && height <= to) out.push(vertex);
      }
      return out;
    };
    const widest = (points: Vector3[]): number =>
      Math.max(...points.map((p) => Math.hypot(p.x, p.z)));

    /*
      The widest angular gap in the outline. A twelve-segment lathe leaves 30
      degrees between vertices however round it looks, so anything past 40 is a
      real notch rather than faceting — and measuring the gap avoids picking
      sector boundaries that happen to land on the merlons.
    */
    const widestGap = (points: Vector3[]): number => {
      const angles = points.map((p) => Math.atan2(p.z, p.x)).sort((a, b) => a - b);
      let gap = 0;
      for (let i = 0; i < angles.length; i += 1) {
        const here = angles[i] ?? 0;
        const next = i + 1 < angles.length ? (angles[i + 1] ?? 0) : (angles[0] ?? 0) + Math.PI * 2;
        gap = Math.max(gap, next - here);
      }
      return (gap * 180) / Math.PI;
    };

    // Above the rim there is merlon at four points of the compass and nothing
    // in between. A turned top would leave no gap wider than its faceting.
    expect(widestGap(inBand('rook', 0.93, 1)), 'the rook has no gaps').toBeGreaterThan(40);

    // The coronet stands out past the stem, which is inside 0.18 cells here.
    expect(widest(inBand('queen', 0.85, 0.96)) / UNIT, 'the queen has no points').toBeGreaterThan(
      0.19,
    );

    // And the pawn is still a turned blob, which is right for a pawn: a closed
    // ring at the top, with nothing standing out of it.
    const pawnTop = inBand('pawn', 0.8, 1);
    expect(widestGap(pawnTop), 'the pawn is notched').toBeLessThan(35);
    expect(widest(pawnTop) / UNIT, 'the pawn has grown a crown').toBeLessThan(0.19);
  });

  it('gives the king a cross broad enough to see from across the board', () => {
    // It is the whole of what separates him from the queen.
    const { positions: position, box } = build('king');
    const vertex = new Vector3();
    let widest = 0;
    for (let i = 0; i < position.count; i += 1) {
      vertex.fromBufferAttribute(position, i);
      if (vertex.y > box.max.y * 0.93) widest = Math.max(widest, Math.abs(vertex.x));
    }
    // Wider than a fifth of a cell: the old cross was half this and read as a speck.
    expect(widest / UNIT).toBeGreaterThan(0.09);
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
