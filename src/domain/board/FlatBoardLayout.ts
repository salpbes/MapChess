// WHAT: The plain chessboard — 64 equal squares on a level plane.
// HOW:  Divides a boardSize×boardSize metre square, centred on the origin, into
//       an 8×8 grid. a1 is the south-west corner (min X, max Z) per D-007, and
//       is dark, as on every real chessboard. All platforms sit at Y = 0.
// WHY:  First implementation of IBoardLayout. It gives Phases 1–4 something to
//       play on and is the reference the warped layout must stay compatible with.

import type { IBoardLayout } from './IBoardLayout';
import { centroid } from './polygon';
import { ALL_SQUARES, BOARD_SIZE, fileIndex, rankIndex } from './Square';
import type { Square } from './Square';
import type { BoardBounds, BoardPoint, Cell, CellShade } from './types';

export interface FlatBoardLayoutOptions {
  /** Side length of the whole board in metres. */
  readonly boardSizeMeters: number;
}

export class FlatBoardLayout implements IBoardLayout {
  public readonly cells: readonly Cell[];
  public readonly bounds: BoardBounds;

  private readonly bySquare: ReadonlyMap<Square, Cell>;

  public constructor(options: FlatBoardLayoutOptions) {
    const size = options.boardSizeMeters;
    if (!(size > 0)) {
      throw new RangeError(`boardSizeMeters must be positive, got ${String(size)}.`);
    }
    const half = size / 2;
    const cellSize = size / BOARD_SIZE;

    this.cells = ALL_SQUARES.map((square) => buildCell(square, cellSize, half));
    this.bySquare = new Map(this.cells.map((c) => [c.square, c]));
    this.bounds = { minX: -half, maxX: half, minZ: -half, maxZ: half, minY: 0, maxY: 0 };
  }

  public cell(square: Square): Cell {
    const found = this.bySquare.get(square);
    if (found === undefined) {
      throw new RangeError(`Unknown square ${square}.`);
    }
    return found;
  }
}

function buildCell(square: Square, cellSize: number, half: number): Cell {
  const f = fileIndex(square);
  const r = rankIndex(square);

  const west = -half + f * cellSize;
  const east = west + cellSize;
  // Rank 1 is the south edge (+Z); rank 8 is north (−Z).
  const south = half - r * cellSize;
  const north = south - cellSize;

  // CCW viewed from above with north up: SW → SE → NE → NW.
  const polygon: readonly BoardPoint[] = [
    { x: west, z: south },
    { x: east, z: south },
    { x: east, z: north },
    { x: west, z: north },
  ];

  const shade: CellShade = (f + r) % 2 === 0 ? 'dark' : 'light';

  return { square, polygon, centroid: centroid(polygon), platformY: 0, shade };
}
