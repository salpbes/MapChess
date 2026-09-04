// WHAT: Turns IBoardLayout cells into terraced platform meshes.
// HOW:  Each cell becomes a prism: its polygon as a flat top at platformY
//       (fan-triangulated from the centroid, valid because cells are convex by
//       contract) plus a skirt of quads down to a common base. Tops are merged
//       by (land cover, checker shade); every skirt goes into one "cut earth"
//       mesh; every top outline goes into one LineSegments. A board is therefore
//       at most 10 + 1 + 1 draw calls however many vertices it has.
// WHY:  This file knows nothing about squares, 8×8, or ranks. It renders
//       whatever polygons it is given, and asks a callback what each cell is
//       made of, so the warped board and the land-cover theme cost it nothing.

import {
  BufferAttribute,
  BufferGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import type { IBoardLayout } from '@domain/board/IBoardLayout';
import type { Square } from '@domain/board/Square';
import type { Cell, CellShade } from '@domain/board/types';
import type { CoverKind } from '@mapdata/board/classifyCellCover';

import { CELL_EDGE, CELL_TOP, RISER } from './palette';

export interface CellBuilderOptions {
  /** How far cell sides extend below the lowest platform, in metres. */
  readonly skirtDepthMeters: number;
  /** Land cover per square; cells not listed are grass. */
  readonly coverOf?: (square: Square) => CoverKind;
  /** Override the top colours (Phase 1's grey board uses this). */
  readonly topColors?: Readonly<Record<CellShade, number>>;
}

export class CellBuilder {
  public constructor(private readonly options: CellBuilderOptions) {}

  public build(layout: IBoardLayout): Group {
    const group = new Group();
    group.name = 'cells';

    const baseY = layout.bounds.minY - this.options.skirtDepthMeters;
    const tops = new Map<string, { color: number; parts: BufferGeometry[] }>();
    const skirts: BufferGeometry[] = [];
    const edges: number[] = [];

    for (const cell of layout.cells) {
      const cover = this.options.coverOf?.(cell.square) ?? 'grass';
      const color = this.options.topColors?.[cell.shade] ?? CELL_TOP[cover][cell.shade];
      const key = `${cover}-${cell.shade}`;
      let bucket = tops.get(key);
      if (bucket === undefined) {
        bucket = { color, parts: [] };
        tops.set(key, bucket);
      }
      bucket.parts.push(buildTop(cell));
      skirts.push(buildSkirt(cell, baseY));
      pushOutline(edges, cell);
    }
    pushVerticalEdges(edges, layout.cells, baseY);

    for (const [key, { color, parts }] of tops) {
      const mesh = new Mesh(merge(parts), topMaterial(color));
      mesh.name = `cells-${key}`;
      mesh.receiveShadow = true;
      group.add(mesh);
    }

    const riser = new Mesh(
      merge(skirts),
      new MeshStandardMaterial({ color: RISER, roughness: 1, metalness: 0, flatShading: true }),
    );
    riser.name = 'cells-riser';
    riser.receiveShadow = true;
    group.add(riser);

    const edgeGeometry = new BufferGeometry();
    edgeGeometry.setAttribute('position', new BufferAttribute(new Float32Array(edges), 3));
    const lines = new LineSegments(
      edgeGeometry,
      new LineBasicMaterial({ color: CELL_EDGE, transparent: true, opacity: 0.75 }),
    );
    lines.name = 'cells-edges';
    group.add(lines);

    return group;
  }
}

function topMaterial(color: number): MeshStandardMaterial {
  return new MeshStandardMaterial({ color, roughness: 0.95, metalness: 0, flatShading: true });
}

function merge(parts: BufferGeometry[]): BufferGeometry {
  const merged = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  merged.computeVertexNormals();
  return merged;
}

/** Top face as a fan from the centroid; non-indexed so flat shading keeps hard facets. */
function buildTop(cell: Cell): BufferGeometry {
  const { polygon, centroid, platformY } = cell;
  const n = polygon.length;
  const positions = new Float32Array(n * 9);
  let o = 0;
  for (let i = 0; i < n; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % n];
    if (a === undefined || b === undefined) continue;
    positions.set([centroid.x, platformY, centroid.z, a.x, platformY, a.z, b.x, platformY, b.z], o);
    o += 9;
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(positions, 3));
  return g;
}

/** Side quads wound CCW from outside so normals point outward. */
function buildSkirt(cell: Cell, baseY: number): BufferGeometry {
  const { polygon, platformY } = cell;
  const n = polygon.length;
  const positions = new Float32Array(n * 18);
  let o = 0;
  for (let i = 0; i < n; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % n];
    if (a === undefined || b === undefined) continue;
    positions.set(
      [
        a.x,
        platformY,
        a.z,
        a.x,
        baseY,
        a.z,
        b.x,
        baseY,
        b.z,
        a.x,
        platformY,
        a.z,
        b.x,
        baseY,
        b.z,
        b.x,
        platformY,
        b.z,
      ],
      o,
    );
    o += 18;
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(positions, 3));
  return g;
}

function pushOutline(out: number[], cell: Cell): void {
  const { polygon, platformY } = cell;
  // A hair above the top so the line is not z-fought by the face it outlines.
  const y = platformY + EDGE_LIFT;
  const n = polygon.length;
  for (let i = 0; i < n; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % n];
    if (a === undefined || b === undefined) continue;
    out.push(a.x, y, a.z, b.x, y, b.z);
  }
}

const EDGE_LIFT = 0.3;
/** Corners shared by fewer cells than this lie on the board rim. */
const INTERIOR_SHARE = 4;

/**
 * Vertical lines at every corner where platforms differ in height, so a
 * terrace reads as a box, not a floating plate. Interior corners run from the
 * highest platform meeting there down to the lowest; rim corners run down to
 * the base of the skirt.
 */
function pushVerticalEdges(out: number[], cells: readonly Cell[], baseY: number): void {
  const corners = new Map<string, { x: number; z: number; ys: number[] }>();
  for (const cell of cells) {
    for (const p of cell.polygon) {
      const key = `${p.x.toFixed(3)}|${p.z.toFixed(3)}`;
      const entry = corners.get(key);
      if (entry === undefined) corners.set(key, { x: p.x, z: p.z, ys: [cell.platformY] });
      else entry.ys.push(cell.platformY);
    }
  }
  for (const { x, z, ys } of corners.values()) {
    const top = Math.max(...ys) + EDGE_LIFT;
    const bottom = ys.length < INTERIOR_SHARE ? baseY : Math.min(...ys) + EDGE_LIFT;
    if (top - bottom < 0.5) continue;
    out.push(x, top, z, x, bottom, z);
  }
}
