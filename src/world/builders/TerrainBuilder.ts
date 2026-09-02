// WHAT: The landscape around the board, as one mesh from the HeightField.
// HOW:  A regular grid over the field's extent, exaggerated with the same
//       scale the terraces used, coloured per vertex by height (green → earth →
//       stone). Triangles whose centre falls inside the board footprint are
//       dropped: inside the board the terraces are the ground, and a second
//       surface there would poke through platforms. Flat-shaded, one draw call.
// WHY:  BUILD_PLAN Phase 9 — a real river valley must be recognisable. The
//       margin of true terrain is what tells you the board is a piece of the
//       world rather than a floating slab.

import { BufferAttribute, BufferGeometry, Color, Mesh, MeshStandardMaterial } from 'three';

import type { BoardBounds } from '@domain/board/types';
import type { HeightField } from '@mapdata/model/HeightField';

import { TERRAIN_HIGH, TERRAIN_LOW, TERRAIN_PEAK } from './palette';
import { heightToY } from './WorldModel';
import type { WorldModel } from './WorldModel';

/** Every n-th sample; 2 turns a 241² field into ~29k triangles, plenty for a margin. */
const STRIDE = 2;

export class TerrainBuilder {
  public build(model: WorldModel, heights: HeightField): Mesh {
    const bounds = model.layout.bounds;
    const step = heights.stepMeters * STRIDE;
    const cols = Math.floor((heights.cols - 1) / STRIDE) + 1;
    const rows = Math.floor((heights.rows - 1) / STRIDE) + 1;

    const yAt = (c: number, r: number): number =>
      heightToY(model, heights.data[r * STRIDE * heights.cols + c * STRIDE] ?? 0);
    const xAt = (c: number): number => heights.originX + c * step;
    const zAt = (r: number): number => heights.originZ + r * step;

    const low = new Color(TERRAIN_LOW);
    const high = new Color(TERRAIN_HIGH);
    const peak = new Color(TERRAIN_PEAK);
    const yMin = heightToY(model, heights.minMeters);
    const yMax = heightToY(model, heights.maxMeters);
    const colorAt = (y: number): Color => {
      const t = yMax > yMin ? (y - yMin) / (yMax - yMin) : 0;
      return t < 0.6 ? low.clone().lerp(high, t / 0.6) : high.clone().lerp(peak, (t - 0.6) / 0.4);
    };

    const positions: number[] = [];
    const colors: number[] = [];
    const inset = step * 0.25;
    const insideBoard = (x: number, z: number): boolean =>
      x > bounds.minX + inset &&
      x < bounds.maxX - inset &&
      z > bounds.minZ + inset &&
      z < bounds.maxZ - inset;

    const pushTri = (
      a: [number, number, number],
      b: [number, number, number],
      c: [number, number, number],
    ): void => {
      const cx = (a[0] + b[0] + c[0]) / 3;
      const cz = (a[2] + b[2] + c[2]) / 3;
      if (insideBoard(cx, cz)) return;
      positions.push(...a, ...b, ...c);
      const col = colorAt((a[1] + b[1] + c[1]) / 3);
      for (let i = 0; i < 3; i += 1) colors.push(col.r, col.g, col.b);
    };

    for (let r = 0; r + 1 < rows; r += 1) {
      for (let c = 0; c + 1 < cols; c += 1) {
        const p00: [number, number, number] = [xAt(c), yAt(c, r), zAt(r)];
        const p10: [number, number, number] = [xAt(c + 1), yAt(c + 1, r), zAt(r)];
        const p01: [number, number, number] = [xAt(c), yAt(c, r + 1), zAt(r + 1)];
        const p11: [number, number, number] = [xAt(c + 1), yAt(c + 1, r + 1), zAt(r + 1)];
        // Wound so the face normal points up (+Y): viewed from above, north (−Z) up, CCW.
        pushTri(p00, p01, p11);
        pushTri(p00, p11, p10);
      }
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
    geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
    geometry.computeVertexNormals();

    const mesh = new Mesh(
      geometry,
      new MeshStandardMaterial({
        vertexColors: true,
        roughness: 1,
        metalness: 0,
        flatShading: true,
      }),
    );
    mesh.name = 'terrain';
    mesh.receiveShadow = true;
    return mesh;
  }
}

/** Depth the cell skirts need so they reach below the surrounding ground everywhere. */
export function skirtDepthFor(model: WorldModel, bounds: BoardBounds): number {
  const width = bounds.maxX - bounds.minX;
  const terrainMin =
    model.heights === null ? bounds.minY : heightToY(model, model.heights.minMeters);
  return Math.max(width * 0.02, bounds.minY - terrainMin + width * 0.01);
}
