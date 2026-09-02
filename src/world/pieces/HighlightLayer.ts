// WHAT: Draws translucent overlays on cells: the selected piece, its legal
//       destinations, capturable targets, and a king in check.
// HOW:  For each highlighted square, a flat fan-triangulated copy of the cell
//       polygon floats a hair above the platform. Materials are shared per
//       role; geometries are rebuilt on every `show` (at most ~30 cells, so
//       cheap) and disposed on `clear`.
// WHY:  Legal-move feedback is what makes an irregular board playable — the
//       player must never guess whether a click is allowed. Using the cell's
//       real polygon means the warped board is highlighted correctly for free.

import { BufferAttribute, BufferGeometry, Group, Mesh, MeshBasicMaterial } from 'three';

import type { IBoardLayout } from '@domain/board/IBoardLayout';
import type { Square } from '@domain/board/Square';
import type { Cell } from '@domain/board/types';

export type HighlightRole = 'selected' | 'move' | 'capture' | 'check';

export interface HighlightSet {
  readonly selected?: Square;
  readonly moves?: readonly Square[];
  readonly captures?: readonly Square[];
  readonly check?: Square;
}

const STYLE: Readonly<Record<HighlightRole, { color: number; opacity: number }>> = {
  selected: { color: 0xffd447, opacity: 0.6 },
  move: { color: 0x4fd37a, opacity: 0.5 },
  capture: { color: 0xe05a4f, opacity: 0.6 },
  check: { color: 0xff3b30, opacity: 0.65 },
};

export class HighlightLayer {
  public readonly group = new Group();
  private readonly materials: Readonly<Record<HighlightRole, MeshBasicMaterial>>;
  private readonly lift: number;

  public constructor(private readonly layout: IBoardLayout) {
    this.group.name = 'highlights';
    const width = layout.bounds.maxX - layout.bounds.minX;
    this.lift = width * 0.0015;
    this.materials = {
      selected: makeMaterial('selected'),
      move: makeMaterial('move'),
      capture: makeMaterial('capture'),
      check: makeMaterial('check'),
    };
  }

  public show(set: HighlightSet): void {
    this.clear();
    if (set.check !== undefined) this.add(set.check, 'check');
    for (const sq of set.moves ?? []) this.add(sq, 'move');
    for (const sq of set.captures ?? []) this.add(sq, 'capture');
    if (set.selected !== undefined) this.add(set.selected, 'selected');
  }

  public clear(): void {
    for (const child of [...this.group.children]) {
      if (child instanceof Mesh) {
        (child.geometry as BufferGeometry).dispose();
      }
      this.group.remove(child);
    }
  }

  public dispose(): void {
    this.clear();
    for (const m of Object.values(this.materials)) m.dispose();
  }

  private add(square: Square, role: HighlightRole): void {
    const cell = this.layout.cell(square);
    const mesh = new Mesh(fanGeometry(cell, cell.platformY + this.lift), this.materials[role]);
    mesh.name = `highlight-${role}-${square}`;
    this.group.add(mesh);
  }
}

function makeMaterial(role: HighlightRole): MeshBasicMaterial {
  const { color, opacity } = STYLE[role];
  return new MeshBasicMaterial({
    color,
    opacity,
    transparent: true,
    depthWrite: false,
    // Nudges the overlay toward the camera so it never z-fights the platform.
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
}

function fanGeometry(cell: Cell, y: number): BufferGeometry {
  const { polygon, centroid } = cell;
  const n = polygon.length;
  const positions = new Float32Array(n * 9);
  let o = 0;
  for (let i = 0; i < n; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % n];
    if (a === undefined || b === undefined) continue;
    positions.set([centroid.x, y, centroid.z, a.x, y, a.z, b.x, y, b.z], o);
    o += 9;
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(positions, 3));
  return g;
}
