// WHAT: A chessboard drawn inside the picker's square — 64 squares and both
//       armies in their starting places — as GeoJSON for MapLibre to paint.
// HOW:  Every corner goes through the same AreaProjection the game builds its
//       board from, so each drawn square lies over exactly the ground that
//       square will be, and the whole thing turns with the rotation slider
//       because the rotation is inside the projection. Pieces are discs, not
//       glyphs: a symbol layer would need the chess characters in the map
//       style's font server, which serves Latin text and nothing so specific.
//       The kings carry a mark, so the e-file reads at a glance.
// WHY:  The picker used to show a yellow square with one bright edge and a
//       sentence explaining that the bright edge was White's. That asks the
//       player to hold a rule in their head and rotate it. A board with the
//       pieces on it needs no rule: you can see White's pawns sitting on the
//       ridge, and which way Black will be coming from, before you commit.

import type { Feature, FeatureCollection, Polygon } from 'geojson';

import { describeArea } from '@mapdata/model/MapArea';
import type { SelectedArea } from '@mapdata/model/SelectedArea';

type Position = [number, number];

/** The back rank from a to h, for both sides. */
const BACK_RANK = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'] as const;

/** Disc radii as a fraction of a square. The king largest, so it is found first. */
const RADIUS = { pawn: 0.2, piece: 0.29, king: 0.34, mark: 0.12 } as const;
/** Enough sides that a disc reads as round at every zoom the picker allows. */
const SIDES = 20;

export type OverlayKind = 'cell' | 'piece' | 'king-mark';

export interface OverlayProps {
  readonly kind: OverlayKind;
  /** Cells: a1 is dark, as on every chessboard since the rules said so. */
  readonly dark?: boolean;
  readonly side?: 'white' | 'black';
  /** Algebraic square, for tests and for anybody reading the source data. */
  readonly square: string;
}

/**
 * The board and its pieces for this area. Board frame, as everywhere: +X east
 * along the files a→h, +Z south toward White, a1 at (−half, +half).
 */
export function pickerBoard(area: SelectedArea): FeatureCollection<Polygon, OverlayProps> {
  const { projection } = describeArea(area);
  const half = area.sizeMeters / 2;
  const cell = area.sizeMeters / 8;
  const at = (x: number, z: number): Position => {
    const p = projection.fromBoard({ x, z });
    return [p.lon, p.lat];
  };

  const features: Feature<Polygon, OverlayProps>[] = [];

  for (let file = 0; file < 8; file += 1) {
    for (let rank = 0; rank < 8; rank += 1) {
      const x0 = -half + file * cell;
      const z0 = half - rank * cell;
      const x1 = x0 + cell;
      const z1 = z0 - cell;
      features.push({
        type: 'Feature',
        properties: { kind: 'cell', dark: (file + rank) % 2 === 0, square: square(file, rank) },
        geometry: {
          type: 'Polygon',
          coordinates: [[at(x0, z0), at(x1, z0), at(x1, z1), at(x0, z1), at(x0, z0)]],
        },
      });
    }
  }

  const disc = (file: number, rank: number, radius: number): Position[] => {
    const cx = -half + (file + 0.5) * cell;
    const cz = half - (rank + 0.5) * cell;
    const ring: Position[] = [];
    for (let i = 0; i <= SIDES; i += 1) {
      const a = (i / SIDES) * Math.PI * 2;
      ring.push(at(cx + Math.cos(a) * radius * cell, cz + Math.sin(a) * radius * cell));
    }
    return ring;
  };

  const army: readonly { side: 'white' | 'black'; back: number; pawns: number }[] = [
    { side: 'white', back: 0, pawns: 1 },
    { side: 'black', back: 7, pawns: 6 },
  ];
  for (const { side, back, pawns } of army) {
    for (let file = 0; file < 8; file += 1) {
      const piece = BACK_RANK[file];
      const radius = piece === 'k' ? RADIUS.king : RADIUS.piece;
      features.push(piecePolygon(disc(file, back, radius), side, square(file, back)));
      features.push(piecePolygon(disc(file, pawns, RADIUS.pawn), side, square(file, pawns)));
      if (piece === 'k') {
        features.push({
          type: 'Feature',
          properties: { kind: 'king-mark', side, square: square(file, back) },
          geometry: { type: 'Polygon', coordinates: [disc(file, back, RADIUS.mark)] },
        });
      }
    }
  }

  return { type: 'FeatureCollection', features };
}

function piecePolygon(
  ring: Position[],
  side: 'white' | 'black',
  sq: string,
): Feature<Polygon, OverlayProps> {
  return {
    type: 'Feature',
    properties: { kind: 'piece', side, square: sq },
    geometry: { type: 'Polygon', coordinates: [ring] },
  };
}

function square(file: number, rank: number): string {
  return `${'abcdefgh'.charAt(file)}${String(rank + 1)}`;
}
