// WHAT: Turns IBoardLayout cells into terraced platform meshes.
// HOW:  Each cell becomes a prism: its polygon as a flat top at platformY
//       (fan-triangulated from the centroid, valid because cells are convex by
//       contract) plus a skirt of quads down to a common base. All cells of one
//       shade are merged into a single mesh, so the whole board is two draw
//       calls regardless of how many vertices the warped layout produces.
// WHY:  This file knows nothing about squares, 8×8, or ranks. It renders
//       whatever polygons it is given, which is exactly what lets the warped
//       board in Phase 8 slot in with zero changes here.

import { BufferAttribute, BufferGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import type { IBoardLayout } from '@domain/board/IBoardLayout';
import type { Cell, CellShade } from '@domain/board/types';

export interface CellBuilderOptions {
  /** How far cell sides extend below the lowest platform, in metres. */
  readonly skirtDepthMeters: number;
  readonly colors: Readonly<Record<CellShade, number>>;
}

const DEFAULT_COLORS: Readonly<Record<CellShade, number>> = {
  light: 0x9d9d9d,
  dark: 0x4f4f4f,
};

export class CellBuilder {
  private readonly options: CellBuilderOptions;

  public constructor(options?: Partial<CellBuilderOptions>) {
    this.options = {
      skirtDepthMeters: options?.skirtDepthMeters ?? 0,
      colors: options?.colors ?? DEFAULT_COLORS,
    };
  }

  public build(layout: IBoardLayout): Group {
    const group = new Group();
    group.name = 'cells';

    const baseY = layout.bounds.minY - this.options.skirtDepthMeters;
    const byShade: Record<CellShade, BufferGeometry[]> = { light: [], dark: [] };
    for (const cell of layout.cells) {
      byShade[cell.shade].push(buildPrism(cell, baseY));
    }

    for (const shade of ['light', 'dark'] as const) {
      const parts = byShade[shade];
      if (parts.length === 0) continue;
      const merged = mergeGeometries(parts);
      for (const p of parts) p.dispose();
      merged.computeVertexNormals();

      const material = new MeshStandardMaterial({
        color: this.options.colors[shade],
        roughness: 0.95,
        metalness: 0,
        flatShading: true,
      });
      const mesh = new Mesh(merged, material);
      mesh.name = `cells-${shade}`;
      mesh.receiveShadow = true;
      group.add(mesh);
    }

    return group;
  }
}

/** Non-indexed triangles so every face keeps its own normal (flat shading). */
function buildPrism(cell: Cell, baseY: number): BufferGeometry {
  const { polygon, centroid, platformY } = cell;
  const n = polygon.length;
  // Top: n triangles. Sides: n quads = 2n triangles. 3 vertices × 3 floats each.
  const positions = new Float32Array((n + 2 * n) * 9);
  let o = 0;

  const push = (x: number, y: number, z: number): void => {
    positions[o] = x;
    positions[o + 1] = y;
    positions[o + 2] = z;
    o += 3;
  };

  for (let i = 0; i < n; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % n];
    if (a === undefined || b === undefined) continue;

    // Top face, CCW from above → normal points up.
    push(centroid.x, platformY, centroid.z);
    push(a.x, platformY, a.z);
    push(b.x, platformY, b.z);

    // Side quad, wound CCW when viewed from outside → normal points outward.
    push(a.x, platformY, a.z);
    push(a.x, baseY, a.z);
    push(b.x, baseY, b.z);

    push(a.x, platformY, a.z);
    push(b.x, baseY, b.z);
    push(b.x, platformY, b.z);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  return geometry;
}
