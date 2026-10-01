// WHAT: Trees, wherever the map says there is a wood — on the board's squares
//       and on the land around it — broadleaf or conifer as the map records.
// HOW:  A jittered grid inside every wood outline, each point kept only if it is
//       off the middle of its square, then two instanced meshes per shape (crown
//       and trunk), so two thousand trees cost four draw calls. On a square a
//       tree stands on that square's platform; off the board it stands on the
//       terrain at the same exaggeration the landscape is drawn with. Placement
//       is a pure function of the map, so the same board grows the same wood
//       every time it is loaded.
// WHY:  The woods were already downloaded and only ever tinted a square green.
//       A prototype at Rievaulx put two thousand trees on the board and turned
//       it from a coloured grid into a wooded valley, which is the whole point
//       of playing on real ground.
//
//       The trees are not to scale and are not meant to be: a piece stands about
//       two hundred metres tall on this map, and a thirty-metre tree beside it is
//       a symbol of a wood, the way the pieces are symbols of armies. They never
//       take a click — the picker tests only squares and pieces — and they stay
//       off the middle of every square, where a piece stands.

import {
  ConeGeometry,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
  Quaternion,
  Vector3,
} from 'three';
import type { BufferGeometry } from 'three';

import { containsPoint } from '@domain/board/polygon';
import type { BoardPoint, Cell } from '@domain/board/types';
import type { MapFeature } from '@mapdata/model/MapFeature';

export type TreeShape = 'broadleaf' | 'conifer';

export interface TreeSpot {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly scale: number;
  readonly shape: TreeShape;
}

export interface TreeInputs {
  readonly features: readonly MapFeature[];
  readonly cells: readonly Cell[];
  readonly bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** Height of the ground off the board, or null where there is none to stand on. */
  readonly groundAt: (x: number, z: number) => number | null;
  /** Squares with no trees on them, whatever the outline says — water, chiefly. */
  readonly bare?: (cell: Cell) => boolean;
  /** Most trees in total. Thinned evenly past it, never cut off at one edge. */
  readonly cap: number;
}

/** A square's width. Every distance below is a fraction of it. */
const CELL = 250;
/** Clear ground round the middle of every square: that is where a piece stands. */
const CLEAR = 0.3 * CELL;
/** Grid pitch inside a wood, before jitter. */
const SPACING = 30;
/** How far past the board's edge the wood is drawn — the landscape's own margin. */
const MARGIN = 220;
/**
 * 0.11 of a square, about thirty metres. Chosen by eye against 0.16 at
 * Rievaulx: smaller trees read as woodland rather than as single trees, let the
 * slopes and the terraces show through, and leave the pieces the tallest
 * things on the board.
 */
export const TREE_HEIGHT = 0.11 * CELL;

/** A stable pseudo-random number in [0, 1) for a position. */
function hash(x: number, z: number): number {
  const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

/** Even-odd ray test: a wood is any shape, unlike the convex squares. */
export function insideOutline(ring: readonly BoardPoint[], p: BoardPoint): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i];
    const b = ring[j];
    if (a === undefined || b === undefined) continue;
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) {
      hit = !hit;
    }
  }
  return hit;
}

/**
 * What the map says grows in a wood. OSM's `leaf_type`: broadleaved,
 * needleleaved, mixed, or — as often as not — nothing, which is drawn mixed.
 */
function shapeFor(leafType: string | null, x: number, z: number): TreeShape {
  if (leafType === 'broadleaved') return 'broadleaf';
  if (leafType === 'needleleaved') return 'conifer';
  return hash(x * 5.1, z * 3.7) < 0.5 ? 'broadleaf' : 'conifer';
}

export function treeSpots(input: TreeInputs): TreeSpot[] {
  const { minX, maxX, minZ, maxZ } = input.bounds;
  const onBoard = (p: BoardPoint): boolean =>
    p.x >= minX && p.x <= maxX && p.z >= minZ && p.z <= maxZ;
  const nearBoard = (p: BoardPoint): boolean =>
    p.x >= minX - MARGIN && p.x <= maxX + MARGIN && p.z >= minZ - MARGIN && p.z <= maxZ + MARGIN;

  const spots: TreeSpot[] = [];
  for (const f of input.features) {
    if (f.kind !== 'wood' || f.geometry.type !== 'polygon') continue;
    const ring = f.geometry.ring;
    const xs = ring.map((q) => q.x);
    const zs = ring.map((q) => q.z);
    // Start the grid on a fixed lattice, not the outline's corner, so two
    // overlapping woods do not plant two trees in one spot.
    const x0 = Math.floor(Math.max(Math.min(...xs), minX - MARGIN) / SPACING) * SPACING;
    const z0 = Math.floor(Math.max(Math.min(...zs), minZ - MARGIN) / SPACING) * SPACING;
    const x1 = Math.min(Math.max(...xs), maxX + MARGIN);
    const z1 = Math.min(Math.max(...zs), maxZ + MARGIN);
    for (let gx = x0; gx <= x1; gx += SPACING) {
      for (let gz = z0; gz <= z1; gz += SPACING) {
        const p = {
          x: gx + (hash(gx, gz) - 0.5) * SPACING * 0.8,
          z: gz + (hash(gz, gx) - 0.5) * SPACING * 0.8,
        };
        if (!nearBoard(p) || !insideOutline(ring, p)) continue;
        let y: number | null;
        if (onBoard(p)) {
          const cell = input.cells.find((c) => containsPoint(c.polygon, p));
          if (cell === undefined || input.bare?.(cell) === true) continue;
          if (Math.hypot(p.x - cell.centroid.x, p.z - cell.centroid.z) < CLEAR) continue;
          y = cell.platformY;
        } else {
          y = input.groundAt(p.x, p.z);
        }
        if (y === null) continue;
        spots.push({
          x: p.x,
          y,
          z: p.z,
          scale: 0.75 + hash(p.x * 3, p.z * 7) * 0.5,
          shape: shapeFor(f.subtype, p.x, p.z),
        });
      }
    }
  }

  if (spots.length <= input.cap) return spots;
  /*
    Thinned by a stable score rather than truncated: dropping the end of the
    list would clear whichever woods happened to come last, and a forest with
    one bare half reads as a bug. Keeping the lowest-scoring spots keeps every
    wood, just sparser.
  */
  return spots
    .map((s) => ({ s, k: hash(s.x * 1.7, s.z * 2.3) }))
    .sort((a, b) => a.k - b.k)
    .slice(0, input.cap)
    .map(({ s }) => s);
}

const CROWN: Readonly<Record<TreeShape, string>> = { broadleaf: '#3f6b2e', conifer: '#2a4f2a' };
const TRUNK = '#5a4030';

function crownGeometry(shape: TreeShape): BufferGeometry {
  const h = TREE_HEIGHT;
  if (shape === 'conifer') {
    return new ConeGeometry(h * 0.3, h * 0.8, 6).translate(0, h * 0.6, 0);
  }
  // A rounded, slightly squat crown: a low-poly broadleaf reads as a ball.
  return new IcosahedronGeometry(h * 0.36, 0).scale(1, 0.9, 1).translate(0, h * 0.6, 0);
}

export function buildTrees(spots: readonly TreeSpot[]): Group {
  const group = new Group();
  group.name = 'trees';
  const trunk = new CylinderGeometry(
    TREE_HEIGHT * 0.05,
    TREE_HEIGHT * 0.06,
    TREE_HEIGHT * 0.3,
    5,
  ).translate(0, TREE_HEIGHT * 0.15, 0);
  const matrix = new Matrix4();
  const turn = new Quaternion();
  const up = new Vector3(0, 1, 0);

  for (const shape of ['broadleaf', 'conifer'] as const) {
    const mine = spots.filter((s) => s.shape === shape);
    if (mine.length === 0) continue;
    const crowns = new InstancedMesh(
      crownGeometry(shape),
      new MeshLambertMaterial({ color: CROWN[shape], flatShading: true }),
      mine.length,
    );
    const trunks = new InstancedMesh(
      shape === 'broadleaf' ? trunk : trunk.clone(),
      new MeshLambertMaterial({ color: TRUNK, flatShading: true }),
      mine.length,
    );
    mine.forEach((s, i) => {
      // Each turned a little, so the faceted crowns do not all catch the light alike.
      turn.setFromAxisAngle(up, (s.x * 0.37 + s.z * 0.61) % (Math.PI * 2));
      matrix.compose(new Vector3(s.x, s.y, s.z), turn, new Vector3(s.scale, s.scale, s.scale));
      crowns.setMatrixAt(i, matrix);
      trunks.setMatrixAt(i, matrix);
    });
    crowns.castShadow = true;
    crowns.name = `trees-${shape}`;
    group.add(crowns, trunks);
  }
  return group;
}
