// WHAT: Water: rivers and streams as ribbons, lakes as filled polygons, a
//       translucent surface over any cell that is itself under the sea, and a
//       sea plane on coastal boards.
// HOW:  Ribbons follow each waterway polyline at a width by type, lying on
//       whichever platform (or terrain, outside the board) the point is over,
//       lifted slightly. Lakes are ShapeGeometry (earcut) at the platform of
//       their centre. Cells whose cover is water get a translucent sheet just
//       above their own platform, so the square reads as submerged and the
//       piece on it as standing in the shallows. The outer sea is a plane at
//       sea level, clamped below the board's lowest platform. All ribbons are
//       one mesh; all lakes one mesh; all shallows one mesh; the sea one plane.
// WHY:  After the warp, rivers run along cell edges; drawing them as water is
//       what makes that visible and the valley recognisable. The shallows are
//       how a board with a bay in the corner tells the truth about it: the
//       square stays playable, because the rules need 64 of them, but it is
//       plainly sea rather than a beach the board invented.

import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Shape,
  ShapeGeometry,
  Vector2,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import { centroid, containsPoint } from '@domain/board/polygon';
import type { BoardPoint } from '@domain/board/types';
import type { MapFeature } from '@mapdata/model/MapFeature';
import { sampleHeight } from '@mapdata/model/HeightField';

import { LAKE, RIVER, SEA } from './palette';
import { heightToY } from './WorldModel';
import type { WorldModel } from './WorldModel';

const RIBBON_WIDTH: Readonly<Record<string, number>> = {
  river: 14,
  canal: 10,
  stream: 6,
  drain: 3,
  ditch: 2.5,
};
const LIFT = 0.6;
/** How far the shallows float over a submerged platform: ankle-deep on a piece. */
const SHALLOW_LIFT = 3.5;
/** Ribbons and lakes are drawn only this far outside the board. */
const MARGIN = 220;

export class WaterBuilder {
  public build(model: WorldModel, features: readonly MapFeature[]): Group {
    const group = new Group();
    group.name = 'water';
    const surface = surfaceHeight(model);

    const ribbons: BufferGeometry[] = [];
    const lakes: BufferGeometry[] = [];
    for (const f of features) {
      if (f.kind === 'waterway' && f.geometry.type === 'line') {
        const width = RIBBON_WIDTH[f.subtype ?? ''] ?? 4;
        const g = ribbon(clip(f.geometry.points, model), width, surface);
        if (g !== null) ribbons.push(g);
      } else if (f.kind === 'water' && f.geometry.type === 'polygon') {
        const g = lake(f.geometry.ring, model, surface);
        if (g !== null) lakes.push(g);
      }
    }

    if (ribbons.length > 0) {
      const mesh = new Mesh(merge(ribbons), waterMaterial(RIVER));
      mesh.name = 'rivers';
      group.add(mesh);
    }
    if (lakes.length > 0) {
      const mesh = new Mesh(merge(lakes), waterMaterial(LAKE));
      mesh.name = 'lakes';
      group.add(mesh);
    }
    const shallows = shallowCells(model);
    if (shallows !== null) {
      const mesh = new Mesh(shallows, shallowMaterial());
      mesh.name = 'shallows';
      // Over the platform it covers, and over the pieces' plinths.
      mesh.renderOrder = 1;
      group.add(mesh);
    }
    if (features.some((f) => f.kind === 'coastline') && model.heights !== null) {
      group.add(sea(model));
    }
    return group;
  }
}

/**
 * One sheet per water-covered cell, a hair above its platform. Translucent, so
 * the blue platform and the foot of any piece standing there both show through.
 */
function shallowCells(model: WorldModel): BufferGeometry | null {
  const cover = model.cover;
  if (cover === null) return null;

  const parts: BufferGeometry[] = [];
  for (const cell of model.layout.cells) {
    if (cover.get(cell.square) !== 'water') continue;
    const shape = new Shape(cell.polygon.map((p) => new Vector2(p.x, -p.z)));
    const g = new ShapeGeometry(shape).toNonIndexed();
    g.rotateX(-Math.PI / 2);
    g.translate(0, cell.platformY + SHALLOW_LIFT, 0);
    parts.push(g);
  }
  return parts.length === 0 ? null : merge(parts);
}

function shallowMaterial(): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color: SEA,
    roughness: 0.2,
    metalness: 0.05,
    flatShading: true,
    transparent: true,
    // Enough to read as water, clear enough to keep the checkerboard underneath.
    opacity: 0.62,
    depthWrite: false,
    side: DoubleSide,
  });
}

function waterMaterial(color: number): MeshStandardMaterial {
  // Lake rings arrive in either winding; double-sided saves caring.
  return new MeshStandardMaterial({
    color,
    roughness: 0.25,
    metalness: 0.05,
    flatShading: true,
    side: DoubleSide,
  });
}

function merge(parts: BufferGeometry[]): BufferGeometry {
  const merged = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  merged.computeVertexNormals();
  return merged;
}

/** Y of the ground under a point: the platform inside the board, exaggerated terrain outside. */
function surfaceHeight(model: WorldModel): (p: BoardPoint) => number {
  const cells = model.layout.cells;
  const b = model.layout.bounds;
  return (p) => {
    if (p.x >= b.minX && p.x <= b.maxX && p.z >= b.minZ && p.z <= b.maxZ) {
      for (const c of cells) if (containsPoint(c.polygon, p)) return c.platformY;
    }
    return model.heights === null
      ? b.minY
      : heightToY(model, sampleHeight(model.heights, p.x, p.z));
  };
}

function clip(points: readonly BoardPoint[], model: WorldModel): BoardPoint[] {
  const b = model.layout.bounds;
  return points.filter(
    (p) =>
      p.x >= b.minX - MARGIN &&
      p.x <= b.maxX + MARGIN &&
      p.z >= b.minZ - MARGIN &&
      p.z <= b.maxZ + MARGIN,
  );
}

/** A flat strip of quads centred on the polyline, mitred by averaging adjacent normals. */
function ribbon(
  points: readonly BoardPoint[],
  width: number,
  surface: (p: BoardPoint) => number,
): BufferGeometry | null {
  if (points.length < 2) return null;
  const half = width / 2;
  const left: [number, number, number][] = [];
  const right: [number, number, number][] = [];
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    const prev = points[i - 1] ?? p;
    const next = points[i + 1] ?? p;
    if (p === undefined || prev === undefined || next === undefined) continue;
    let dx = next.x - prev.x;
    let dz = next.z - prev.z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    const y = surface(p) + LIFT;
    left.push([p.x - dz * half, y, p.z + dx * half]);
    right.push([p.x + dz * half, y, p.z - dx * half]);
  }
  const positions: number[] = [];
  for (let i = 0; i + 1 < left.length; i += 1) {
    const l0 = left[i];
    const l1 = left[i + 1];
    const r0 = right[i];
    const r1 = right[i + 1];
    if (!l0 || !l1 || !r0 || !r1) continue;
    positions.push(...l0, ...r0, ...r1, ...l0, ...r1, ...l1);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  return g;
}

function lake(
  ring: readonly BoardPoint[],
  model: WorldModel,
  surface: (p: BoardPoint) => number,
): BufferGeometry | null {
  const inside = clip(ring, model);
  if (inside.length < 3 || inside.length < ring.length * 0.5) return null;
  // ShapeGeometry works in XY; use (x, −z) so the result is CCW when rotated flat.
  const shape = new Shape(ring.map((p) => new Vector2(p.x, -p.z)));
  const g = new ShapeGeometry(shape).toNonIndexed();
  const y = surface(centroid(ring)) + LIFT;
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  return g;
}

function sea(model: WorldModel): Mesh {
  const h = model.heights;
  const b = model.layout.bounds;
  if (h === null) throw new Error('sea() needs heights');
  const seaY = Math.min(heightToY(model, 0), b.minY - 2);
  const w = h.cols * h.stepMeters;
  const d = h.rows * h.stepMeters;
  const plane = new Mesh(new PlaneGeometry(w * 1.5, d * 1.5), waterMaterial(SEA));
  plane.rotateX(-Math.PI / 2);
  plane.position.set(h.originX + w / 2, seaY, h.originZ + d / 2);
  plane.name = 'sea';
  return plane;
}
