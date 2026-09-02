// WHAT: Warps a 9×9 lattice of corner vertices toward terrain features while
//       keeping every one of the 64 quads a valid, piece-sized, convex cell.
// HOW:  Works in cell units (a flat cell is 1×1). Rounds of: pull vertices
//       onto nearby line attractors (rivers, coast) → push the corners of a
//       cell containing a point attractor (peak, village) outward → Laplacian
//       relax interior vertices → cap displacement and pin the boundary.
//       Then a repair loop: any quad that is non-convex, too small, or too
//       thin for a piece has its corners blended back toward their original
//       positions until every quad passes. The original grid is valid, so this
//       always terminates. No randomness anywhere: same input, same output.
// WHY:  BUILD_PLAN §2 — "warp the lattice, don't abandon it". Chess adjacency
//       lives in the indices; only positions change. This file is pure maths
//       so the Phase 8 invariants can be tested across the fixture areas.

import { nearestOnPolyline, isConvex } from './geometry';
import { centroid, containsPoint, signedArea } from './polygon';
import type { LineAttractor, PointAttractor } from './TerrainInputs';
import type { BoardPoint } from './types';

export const LATTICE_N = 8;

export interface LatticeParams {
  /** Max displacement of any vertex from its grid position, in cell widths. */
  readonly maxMove: number;
  /** Vertices closer than this (cell widths) to a line are pulled toward it. */
  readonly linePullRadius: number;
  /** How far a point attractor pushes its cell's corners, in cell widths. */
  readonly pointPush: number;
  /** Fraction of the centroid→feature offset the whole cell slides by, per round. */
  readonly pointCentre: number;
  /** Rounds of attract → relax. */
  readonly rounds: number;
  /** Laplacian blend per round, 0 = none. */
  readonly relax: number;
  /** Smallest acceptable cell area, in cell widths². */
  readonly minArea: number;
  /** Smallest acceptable centroid-to-edge distance, in cell widths (a piece plinth must fit). */
  readonly minInradius: number;
}

export const DEFAULT_LATTICE_PARAMS: LatticeParams = {
  maxMove: 0.35,
  // Half a cell: only the nearer of two lattice lines reaches a feature, so cells are never squeezed from both sides.
  linePullRadius: 0.5,
  pointPush: 0.18,
  pointCentre: 0.5,
  rounds: 3,
  relax: 0.12,
  minArea: 0.5,
  // The plinth radius is 0.30 cells (PieceGeometry); a full-cap pull leaves ~0.32.
  minInradius: 0.3,
};

export interface LatticeInputs {
  readonly lines: readonly LineAttractor[];
  readonly points: readonly PointAttractor[];
}

/** Vertex positions in cell units, indexed [row][col]; row 0 is the north edge, col 0 the west. */
export type Lattice = readonly (readonly BoardPoint[])[];
type MutableLattice = BoardPoint[][];

function get(v: Lattice, r: number, c: number): BoardPoint {
  const p = v[r]?.[c];
  if (p === undefined) throw new RangeError(`No lattice vertex at ${String(r)},${String(c)}.`);
  return p;
}

function set(v: MutableLattice, r: number, c: number, p: BoardPoint): void {
  const row = v[r];
  if (row === undefined || c < 0 || c > LATTICE_N)
    throw new RangeError(`No lattice vertex at ${String(r)},${String(c)}.`);
  row[c] = p;
}

const CELL_CORNER_OFFSETS: readonly (readonly [number, number])[] = [
  [0, 0],
  [0, 1],
  [1, 0],
  [1, 1],
];

/** Corners of the quad at (row, col), CCW viewed from above with north up: SW → SE → NE → NW. */
export function quadCorners(lattice: Lattice, row: number, col: number): BoardPoint[] {
  const nw = lattice[row]?.[col];
  const ne = lattice[row]?.[col + 1];
  const se = lattice[row + 1]?.[col + 1];
  const sw = lattice[row + 1]?.[col];
  if (nw === undefined || ne === undefined || se === undefined || sw === undefined) {
    throw new RangeError(`No quad at row ${String(row)}, col ${String(col)}.`);
  }
  return [sw, se, ne, nw];
}

export function warpLattice(
  inputs: LatticeInputs,
  params: LatticeParams = DEFAULT_LATTICE_PARAMS,
): Lattice {
  const original = flatLattice();
  const v: MutableLattice = original.map((row) => row.map((p) => ({ ...p })));
  const lines = inputs.lines.filter((l) => l.points.length >= 2 && l.weight > 0);

  for (let round = 0; round < params.rounds; round += 1) {
    // Later rounds pull less, so relaxation wins and kinks settle.
    const strength = 1 / (round + 1);
    pullTowardLines(v, lines, params, strength);
    pushFromPoints(v, inputs.points, params, strength);
    // No relaxation after the last pull, so vertices finish on the features rather than drifting off.
    if (round < params.rounds - 1) relaxInterior(v, params.relax);
    capAndPin(v, original, params.maxMove);
  }

  repair(v, original, params);
  return v;
}

// --------------------------------------------------------------- attractors

function pullTowardLines(
  v: MutableLattice,
  lines: readonly LineAttractor[],
  p: LatticeParams,
  strength: number,
): void {
  if (lines.length === 0) return;
  for (let r = 0; r <= LATTICE_N; r += 1) {
    for (let c = 0; c <= LATTICE_N; c += 1) {
      const vert = get(v, r, c);
      let best: { point: BoardPoint; score: number } | null = null;
      for (const line of lines) {
        const near = nearestOnPolyline(line.points, vert);
        if (near === null || near.distance >= p.linePullRadius) continue;
        // Full snap when the feature is within reach of the cap; fade out toward the radius.
        const reach = p.maxMove;
        const fade =
          near.distance <= reach || p.linePullRadius <= reach
            ? 1
            : (p.linePullRadius - near.distance) / (p.linePullRadius - reach);
        // Edges can only follow a line that runs roughly along a lattice axis; a 45° river
        // pulled onto vertices just becomes a staircase, so diagonal segments pull nothing.
        const score = line.weight * fade * axisAlignment(line.points, near.segment);
        if (score <= 0) continue;
        if (best === null || score > best.score) best = { point: near.point, score };
      }
      if (best === null) continue;
      const f = Math.min(1, best.score * strength);
      set(v, r, c, {
        x: vert.x + (best.point.x - vert.x) * f,
        z: vert.z + (best.point.z - vert.z) * f,
      });
    }
  }
}

/**
 * 1 for a segment along a lattice axis, 0 at 45°, linear in between.
 * Uses the segment's direction, so a meandering river scores per bend.
 */
function axisAlignment(points: readonly BoardPoint[], segment: number): number {
  const a = points[segment];
  const b = points[segment + 1];
  if (a === undefined || b === undefined) return 0;
  const dx = Math.abs(b.x - a.x);
  const dz = Math.abs(b.z - a.z);
  const len = Math.hypot(dx, dz);
  if (len === 0) return 0;
  // cos of the angle to the nearest axis: 1 on-axis, √½ at 45°.
  const c = Math.max(dx, dz) / len;
  return Math.max(0, (c - Math.SQRT1_2) / (1 - Math.SQRT1_2));
}

function pushFromPoints(
  v: MutableLattice,
  points: readonly PointAttractor[],
  p: LatticeParams,
  strength: number,
): void {
  // One attractor per cell: the highest priority wins; ties go to the first listed (deterministic).
  const chosen = new Map<string, { row: number; col: number; pt: PointAttractor }>();
  for (const pt of points) {
    const cell = cellContaining(v, pt.point);
    if (cell === null) continue;
    const key = `${String(cell.row)}:${String(cell.col)}`;
    const existing = chosen.get(key);
    if (existing === undefined || pt.priority > existing.pt.priority)
      chosen.set(key, { ...cell, pt });
  }
  for (const { row, col, pt } of chosen.values()) {
    // First slide the whole cell so its centre approaches the feature, then push its
    // corners outward so the feature has room. Radial push alone leaves a feature that
    // sits on an edge exactly where it was: on the edge.
    const corners = quadCorners(v, row, col);
    const c = centroid(corners);
    const shiftX = (pt.point.x - c.x) * p.pointCentre * strength;
    const shiftZ = (pt.point.z - c.z) * p.pointCentre * strength;
    for (const [dr, dc] of CELL_CORNER_OFFSETS) {
      const vert = get(v, row + dr, col + dc);
      const dx = vert.x - pt.point.x;
      const dz = vert.z - pt.point.z;
      const len = Math.hypot(dx, dz) || 1;
      const push = p.pointPush * strength;
      set(v, row + dr, col + dc, {
        x: vert.x + shiftX + (dx / len) * push,
        z: vert.z + shiftZ + (dz / len) * push,
      });
    }
  }
}

export function cellContaining(v: Lattice, pt: BoardPoint): { row: number; col: number } | null {
  // Try the grid guess first, then its neighbours; warping never moves a point more than one cell.
  const gc = Math.floor(pt.x);
  const gr = Math.floor(pt.z);
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      const row = gr + dr;
      const col = gc + dc;
      if (row < 0 || col < 0 || row >= LATTICE_N || col >= LATTICE_N) continue;
      if (containsPoint(quadCorners(v, row, col), pt)) return { row, col };
    }
  }
  return null;
}

// --------------------------------------------------------------- relaxation

function relaxInterior(v: MutableLattice, factor: number): void {
  if (factor <= 0) return;
  const snapshot: Lattice = v.map((row) => row.map((p) => ({ ...p })));
  for (let r = 1; r < LATTICE_N; r += 1) {
    for (let c = 1; c < LATTICE_N; c += 1) {
      const cur = get(snapshot, r, c);
      const n = get(snapshot, r - 1, c);
      const s = get(snapshot, r + 1, c);
      const w = get(snapshot, r, c - 1);
      const e = get(snapshot, r, c + 1);
      const ax = (n.x + s.x + w.x + e.x) / 4;
      const az = (n.z + s.z + w.z + e.z) / 4;
      set(v, r, c, { x: cur.x + (ax - cur.x) * factor, z: cur.z + (az - cur.z) * factor });
    }
  }
}

function capAndPin(v: MutableLattice, original: Lattice, maxMove: number): void {
  for (let r = 0; r <= LATTICE_N; r += 1) {
    for (let c = 0; c <= LATTICE_N; c += 1) {
      const o = get(original, r, c);
      let { x, z } = get(v, r, c);
      const dx = x - o.x;
      const dz = z - o.z;
      const d = Math.hypot(dx, dz);
      if (d > maxMove) {
        x = o.x + (dx / d) * maxMove;
        z = o.z + (dz / d) * maxMove;
      }
      // Boundary vertices slide along their edge; corners stay put.
      if (r === 0 || r === LATTICE_N) z = o.z;
      if (c === 0 || c === LATTICE_N) x = o.x;
      set(v, r, c, { x, z });
    }
  }
}

// ------------------------------------------------------------------- repair

const MAX_REPAIR_PASSES = 40;
const REPAIR_BLEND = 0.5;

function repair(v: MutableLattice, original: Lattice, p: LatticeParams): void {
  for (let pass = 0; pass < MAX_REPAIR_PASSES; pass += 1) {
    const bad = badQuads(v, p);
    if (bad.length === 0) return;
    for (const { row, col } of bad) {
      for (const [dr, dc] of CELL_CORNER_OFFSETS) {
        const cur = get(v, row + dr, col + dc);
        const o = get(original, row + dr, col + dc);
        set(v, row + dr, col + dc, {
          x: cur.x + (o.x - cur.x) * REPAIR_BLEND,
          z: cur.z + (o.z - cur.z) * REPAIR_BLEND,
        });
      }
    }
  }
  // Exponential blending has not converged within tolerance: fall back to the flat grid for the offenders.
  for (const { row, col } of badQuads(v, p)) {
    for (const [dr, dc] of CELL_CORNER_OFFSETS) {
      set(v, row + dr, col + dc, { ...get(original, row + dr, col + dc) });
    }
  }
}

export function quadIsValid(corners: readonly BoardPoint[], p: LatticeParams): boolean {
  if (signedArea(corners) < p.minArea) return false; // negative area = flipped quad
  if (!isConvex(corners)) return false;
  return inradius(corners) >= p.minInradius;
}

function badQuads(v: Lattice, p: LatticeParams): { row: number; col: number }[] {
  const out: { row: number; col: number }[] = [];
  for (let row = 0; row < LATTICE_N; row += 1) {
    for (let col = 0; col < LATTICE_N; col += 1) {
      if (!quadIsValid(quadCorners(v, row, col), p)) out.push({ row, col });
    }
  }
  return out;
}

/** Smallest distance from the centroid to any edge: the radius of the largest plinth that fits. */
export function inradius(polygon: readonly BoardPoint[]): number {
  const c = centroid(polygon);
  let best = Number.POSITIVE_INFINITY;
  const n = polygon.length;
  for (let i = 0; i < n; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % n];
    if (a === undefined || b === undefined) continue;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len === 0) return 0;
    const d = Math.abs(dx * (c.z - a.z) - dz * (c.x - a.x)) / len;
    if (d < best) best = d;
  }
  return best;
}

export function flatLattice(): Lattice {
  const out: BoardPoint[][] = [];
  for (let r = 0; r <= LATTICE_N; r += 1) {
    const row: BoardPoint[] = [];
    for (let c = 0; c <= LATTICE_N; c += 1) row.push({ x: c, z: r });
    out.push(row);
  }
  return out;
}
