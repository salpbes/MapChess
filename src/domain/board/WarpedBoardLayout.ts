// WHAT: The terrain-shaped chessboard — second implementation of IBoardLayout.
// HOW:  Warps the 9×9 lattice with warpLattice() (cell units), scales it to
//       board metres centred on the origin, builds 64 convex quads in
//       ALL_SQUARES order with a1 south-west, samples heights inside each and
//       terraces them. Also exposes the lattice and the terrace scale so the
//       debug overlay and the terrain mesh can use the same numbers.
// WHY:  Everything downstream reads IBoardLayout; swapping this in for
//       FlatBoardLayout is one line in app/ (BUILD_PLAN §5). Deterministic:
//       same TerrainInputs → identical cells.

import type { IBoardLayout } from './IBoardLayout';
import { DEFAULT_LATTICE_PARAMS, LATTICE_N, quadCorners, warpLattice } from './latticeWarp';
import type { Lattice, LatticeParams } from './latticeWarp';
import { centroid } from './polygon';
import { ALL_SQUARES, fileIndex, rankIndex } from './Square';
import type { Square } from './Square';
import { DEFAULT_TERRACE_PARAMS, terrace } from './terrace';
import type { TerraceParams, TerraceResult } from './terrace';
import type { LineAttractor, PointAttractor, TerrainInputs } from './TerrainInputs';
import type { BoardBounds, BoardPoint, Cell } from './types';

export interface WarpedBoardLayoutOptions {
  readonly lattice?: Partial<LatticeParams>;
  readonly terrace?: Partial<TerraceParams>;
}

export class WarpedBoardLayout implements IBoardLayout {
  public readonly cells: readonly Cell[];
  public readonly bounds: BoardBounds;
  /** Corner vertices in board metres, [row][col]; row 0 is the north (rank 8) edge. */
  public readonly lattice: Lattice;
  public readonly terraceInfo: TerraceResult;
  public readonly latticeParams: LatticeParams;

  private readonly bySquare: ReadonlyMap<Square, Cell>;

  public constructor(inputs: TerrainInputs, options: WarpedBoardLayoutOptions = {}) {
    const size = inputs.boardSizeMeters;
    if (!(size > 0)) throw new RangeError(`boardSizeMeters must be positive, got ${String(size)}.`);
    const cellSize = size / LATTICE_N;
    const half = size / 2;
    this.latticeParams = { ...DEFAULT_LATTICE_PARAMS, ...options.lattice };
    const terraceParams = { ...DEFAULT_TERRACE_PARAMS, ...options.terrace };

    // Board metres → cell units for the attractors; the lattice works in cell units.
    const toCell = (p: BoardPoint): BoardPoint => ({
      x: (p.x + half) / cellSize,
      z: (p.z + half) / cellSize,
    });
    const toBoard = (p: BoardPoint): BoardPoint => ({
      x: p.x * cellSize - half,
      z: p.z * cellSize - half,
    });

    const lines: LineAttractor[] = inputs.lines.map((l) => ({
      ...l,
      points: l.points.map(toCell),
    }));
    const points: PointAttractor[] = inputs.points.map((p) => ({ ...p, point: toCell(p.point) }));

    const warped = warpLattice({ lines, points }, this.latticeParams);
    this.lattice = warped.map((row) => row.map(toBoard));

    // Rank r (0 = rank 1, south) is lattice row N-1-r; file f is column f.
    const polygons = ALL_SQUARES.map((square) =>
      quadCorners(this.lattice, LATTICE_N - 1 - rankIndex(square), fileIndex(square)),
    );
    const stats = polygons.map((poly) => inputs.heights.stats(poly));
    this.terraceInfo = terrace(stats, size, terraceParams);

    this.cells = ALL_SQUARES.map((square, i) => {
      const polygon = polygons[i];
      const platformY = this.terraceInfo.platformY[i];
      if (polygon === undefined || platformY === undefined) throw new Error('cell/height mismatch');
      const f = fileIndex(square);
      const r = rankIndex(square);
      return {
        square,
        polygon,
        centroid: centroid(polygon),
        platformY,
        shade: (f + r) % 2 === 0 ? 'dark' : 'light',
      };
    });
    this.bySquare = new Map(this.cells.map((c) => [c.square, c]));

    const ys = this.cells.map((c) => c.platformY);
    this.bounds = {
      minX: -half,
      maxX: half,
      minZ: -half,
      maxZ: half,
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
    };
  }

  public cell(square: Square): Cell {
    const found = this.bySquare.get(square);
    if (found === undefined) throw new RangeError(`Unknown square ${square}.`);
    return found;
  }
}
