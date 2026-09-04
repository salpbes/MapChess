// WHAT: Draws translucent overlays on cells: the selected piece, its legal
//       destinations, capturable targets, and a king in check.
// HOW:  For each highlighted square, a flat fan-triangulated copy of the cell
//       polygon floats a hair above the platform. Materials are shared per
//       role; geometries are rebuilt on every `show` (at most ~30 cells, so
//       cheap) and disposed on `clear`.
//       The hint pair breathes: its opacity is driven from `update(dt)`.
// WHY:  Legal-move feedback is what makes an irregular board playable — the
//       player must never guess whether a click is allowed. Using the cell's
//       real polygon means the warped board is highlighted correctly for free.
//       A hint is the one overlay the player is looking *for* rather than at,
//       and a still translucent square on a busy landscape is easy to miss —
//       so it is the one that moves. Nothing else does, which is what makes it
//       findable.

import { BufferAttribute, BufferGeometry, Group, Mesh, MeshBasicMaterial } from 'three';

import type { IBoardLayout } from '@domain/board/IBoardLayout';
import type { Square } from '@domain/board/Square';
import type { Cell } from '@domain/board/types';

export type HighlightRole = 'selected' | 'move' | 'capture' | 'check' | 'hint';

export interface HighlightSet {
  readonly selected?: Square;
  readonly moves?: readonly Square[];
  readonly captures?: readonly Square[];
  readonly check?: Square;
  readonly hint?: readonly Square[];
}

const STYLE: Readonly<Record<HighlightRole, { color: number; opacity: number }>> = {
  selected: { color: 0xffd447, opacity: 0.6 },
  move: { color: 0x4fd37a, opacity: 0.5 },
  capture: { color: 0xe05a4f, opacity: 0.6 },
  check: { color: 0xff3b30, opacity: 0.65 },
  /*
    Violet. Every other hue on screen is claimed: the rules speak in amber,
    green and red, and the land speaks in green, blue and sand. Blue was the
    first choice and it disappeared the moment a hint landed on a sea square,
    which is exactly where a beginner most needs to see one.
  */
  hint: { color: 0xb45cff, opacity: 0.55 },
};

/** The hint fades between these, twice per PULSE_SECONDS. */
const PULSE_MIN = 0.28;
const PULSE_MAX = 0.75;
const PULSE_SECONDS = 1.6;

export class HighlightLayer {
  public readonly group = new Group();
  private readonly materials: Readonly<Record<HighlightRole, MeshBasicMaterial>>;
  private layout: IBoardLayout;
  private lift: number;
  private pulseTime = 0;
  private pulsing = false;

  public constructor(layout: IBoardLayout) {
    this.layout = layout;
    this.group.name = 'highlights';
    this.lift = liftFor(layout);
    this.materials = {
      selected: makeMaterial('selected'),
      move: makeMaterial('move'),
      capture: makeMaterial('capture'),
      check: makeMaterial('check'),
      hint: makeMaterial('hint'),
    };
  }

  public setLayout(layout: IBoardLayout): void {
    this.layout = layout;
    this.lift = liftFor(layout);
    this.clear();
  }

  /** Drives the hint pulse. Cheap enough to call every frame; a no-op with no hint. */
  public update(dt: number): void {
    if (!this.pulsing) return;
    this.pulseTime += dt;
    const phase = (Math.sin((this.pulseTime / PULSE_SECONDS) * Math.PI * 2) + 1) / 2;
    this.materials.hint.opacity = PULSE_MIN + (PULSE_MAX - PULSE_MIN) * phase;
  }

  public show(set: HighlightSet): void {
    this.clear();
    // Restart from the bright end so a new hint announces itself.
    this.pulsing = (set.hint ?? []).length > 0;
    this.pulseTime = PULSE_SECONDS / 4;
    // Drawn first, so a selection or a legal-move dot paints over the advice.
    for (const sq of set.hint ?? []) this.add(sq, 'hint');
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

function liftFor(layout: IBoardLayout): number {
  return (layout.bounds.maxX - layout.bounds.minX) * 0.0015;
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
