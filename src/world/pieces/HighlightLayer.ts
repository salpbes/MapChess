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

import { BufferAttribute, BufferGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial } from 'three';

import type { IBoardLayout } from '@domain/board/IBoardLayout';
import type { Square } from '@domain/board/Square';
import type { Cell } from '@domain/board/types';

export type HighlightRole = 'selected' | 'move' | 'capture' | 'check' | 'hint' | 'last';

export interface HighlightSet {
  readonly selected?: Square;
  readonly moves?: readonly Square[];
  readonly captures?: readonly Square[];
  readonly check?: Square;
  readonly hint?: readonly Square[];
  /** The two squares of the move just played. */
  readonly last?: readonly Square[];
}

/**
 * The marks that carry the move/capture distinction without using hue.
 *
 * Green against red is the pair deuteranopia confuses most, and until now it
 * was the ONLY thing separating "you may go here" from "you may take this".
 * A filled centre against an outlined edge survives any colour vision, a
 * greyscale screenshot and a bright screen outdoors — and it is the pairing
 * players already know from every online board, so it costs no learning.
 */
type MarkRole = 'moveDot' | 'captureRing';

const MARK: Readonly<Record<MarkRole, { color: number; opacity: number }>> = {
  moveDot: { color: 0xecffe9, opacity: 0.92 },
  captureRing: { color: 0xffd9c9, opacity: 0.95 },
};

/** The keyboard cursor: a thin outline at the cell's edge, no fill. */
const CURSOR = { color: 0xffffff, opacity: 0.85 };
/** Thin, so it is never mistaken for a capture's heavy band. */
const CURSOR_FRACTION = 0.07;

/** Disc radius, as a fraction of the cell's own radius. */
const DOT_FRACTION = 0.34;
/** Ring band width, as a fraction of the cell's own radius. */
const RING_FRACTION = 0.2;
/** Facets in a highlight disc. Twenty reads as round at every zoom the camera allows. */
const DISC_SEGMENTS = 20;

const STYLE: Readonly<Record<HighlightRole, { color: number; opacity: number }>> = {
  selected: { color: 0xffd447, opacity: 0.6 },
  /*
    Lighter than the ground, where capture is darker: the second channel is
    shape, but value backs it up, so the two never rely on hue alone even where
    the mark itself is hidden under a piece.
  */
  move: { color: 0x8ff0b0, opacity: 0.34 },
  capture: { color: 0x7a1f16, opacity: 0.5 },
  check: { color: 0xff3b30, opacity: 0.65 },
  /*
    Violet. Every other hue on screen is claimed: the rules speak in amber,
    green and red, and the land speaks in green, blue and sand. Blue was the
    first choice and it disappeared the moment a hint landed on a sea square,
    which is exactly where a beginner most needs to see one.
  */
  hint: { color: 0xb45cff, opacity: 0.55 },
  /*
    The selection colour, faded. The move just played and the piece in your
    hand are the same kind of fact — "this is what is happening" — so they are
    the same colour, and the weaker one is the one already over with.
  */
  last: { color: 0xffd447, opacity: 0.2 },
};

/** The hint fades between these, twice per PULSE_SECONDS. */
const PULSE_MIN = 0.28;
const PULSE_MAX = 0.75;
const PULSE_SECONDS = 1.6;

export class HighlightLayer {
  public readonly group = new Group();
  /**
   * Where the keyboard is pointing, drawn separately from everything else.
   *
   * `show()` rebuilds the whole set on every selection change, and the cursor
   * belongs to the input rather than to the position — it has to survive a
   * move being played, a selection being cleared, and the board being rebuilt.
   */
  private readonly cursorGroup = new Group();
  private readonly materials: Readonly<Record<HighlightRole, MeshBasicMaterial>>;
  private readonly marks: Readonly<Record<MarkRole, MeshBasicMaterial>>;
  private readonly cursorMaterial: MeshBasicMaterial;
  private cursorSquare: Square | null = null;
  private layout: IBoardLayout;
  private lift: number;
  private pulseTime = 0;
  private pulsing = false;

  public constructor(layout: IBoardLayout) {
    this.layout = layout;
    this.group.name = 'highlights';
    this.cursorGroup.name = 'keyboard-cursor';
    this.group.add(this.cursorGroup);
    this.lift = liftFor(layout);
    this.materials = {
      selected: makeMaterial('selected'),
      move: makeMaterial('move'),
      capture: makeMaterial('capture'),
      check: makeMaterial('check'),
      hint: makeMaterial('hint'),
      last: makeMaterial('last'),
    };
    this.cursorMaterial = new MeshBasicMaterial({
      color: CURSOR.color,
      opacity: CURSOR.opacity,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });
    this.marks = {
      moveDot: makeMarkMaterial('moveDot'),
      captureRing: makeMarkMaterial('captureRing'),
    };
  }

  public setLayout(layout: IBoardLayout): void {
    this.layout = layout;
    this.lift = liftFor(layout);
    this.clear();
    // The cell it sat on is a different shape now; redraw it on the new one.
    this.setCursor(this.cursorSquare);
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
    // Faintest first: everything else paints over the move already played.
    for (const sq of set.last ?? []) this.add(sq, 'last');
    // Then the advice, so a selection or a legal-move dot paints over it.
    for (const sq of set.hint ?? []) this.add(sq, 'hint');
    if (set.check !== undefined) this.add(set.check, 'check');
    for (const sq of set.moves ?? []) this.add(sq, 'move');
    for (const sq of set.captures ?? []) this.add(sq, 'capture');
    if (set.selected !== undefined) this.add(set.selected, 'selected');
  }

  /** Moves the keyboard cursor, or takes it off the board with null. */
  public setCursor(square: Square | null): void {
    this.cursorSquare = square;
    for (const child of [...this.cursorGroup.children]) {
      if (child instanceof Mesh) (child.geometry as BufferGeometry).dispose();
      this.cursorGroup.remove(child);
    }
    if (square === null) return;

    const cell = this.layout.cell(square);
    const y = cell.platformY + this.lift * 2;
    const mesh = new Mesh(ringGeometry(cell, y, CURSOR_FRACTION), this.cursorMaterial);
    mesh.name = `cursor-${square}`;
    this.cursorGroup.add(mesh);
  }

  public clear(): void {
    for (const child of [...this.group.children]) {
      // The cursor is the input's, not the position's: it outlives a rebuild.
      if (child === this.cursorGroup) continue;
      if (child instanceof Mesh) {
        (child.geometry as BufferGeometry).dispose();
      }
      this.group.remove(child);
    }
  }

  public dispose(): void {
    this.clear();
    for (const m of Object.values(this.materials)) m.dispose();
    for (const m of Object.values(this.marks)) m.dispose();
    this.cursorMaterial.dispose();
  }

  private add(square: Square, role: HighlightRole): void {
    const cell = this.layout.cell(square);
    const y = cell.platformY + this.lift;
    const mesh = new Mesh(fanGeometry(cell, y), this.materials[role]);
    mesh.name = `highlight-${role}-${square}`;
    this.group.add(mesh);

    // The mark sits a hair above its own tint so the two never z-fight.
    const markY = y + this.lift * 0.5;
    if (role === 'move') {
      const dot = new Mesh(discGeometry(cell, markY, DOT_FRACTION), this.marks.moveDot);
      dot.name = `highlight-move-dot-${square}`;
      this.group.add(dot);
    } else if (role === 'capture') {
      const ring = new Mesh(ringGeometry(cell, markY, RING_FRACTION), this.marks.captureRing);
      ring.name = `highlight-capture-ring-${square}`;
      this.group.add(ring);
    }
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

function makeMarkMaterial(role: MarkRole): MeshBasicMaterial {
  const { color, opacity } = MARK[role];
  return new MeshBasicMaterial({
    color,
    opacity,
    transparent: true,
    depthWrite: false,
    // Flat overlays with no inside: drawing both faces saves caring which way
    // a generated ring or disc happens to wind.
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
}

/** Mean distance from the centroid to the corners: a warped cell's "size". */
function cellRadius(cell: Cell): number {
  const { polygon, centroid } = cell;
  if (polygon.length === 0) return 0;
  let total = 0;
  for (const p of polygon) total += Math.hypot(p.x - centroid.x, p.z - centroid.z);
  return total / polygon.length;
}

/** A filled disc at the cell's centre: "you may move here". */
function discGeometry(cell: Cell, y: number, fraction: number): BufferGeometry {
  const { centroid } = cell;
  const r = cellRadius(cell) * fraction;
  const positions = new Float32Array(DISC_SEGMENTS * 9);
  let o = 0;
  for (let i = 0; i < DISC_SEGMENTS; i += 1) {
    const a = (i / DISC_SEGMENTS) * Math.PI * 2;
    const b = ((i + 1) / DISC_SEGMENTS) * Math.PI * 2;
    positions.set(
      [
        centroid.x,
        y,
        centroid.z,
        centroid.x + Math.cos(a) * r,
        y,
        centroid.z + Math.sin(a) * r,
        centroid.x + Math.cos(b) * r,
        y,
        centroid.z + Math.sin(b) * r,
      ],
      o,
    );
    o += 9;
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(positions, 3));
  return g;
}

/**
 * A band just inside the cell's own edge: "you may take this".
 *
 * The inner edge is the polygon scaled toward its centroid, which is a valid
 * simple polygon because Phase 8 guarantees every cell is convex.
 */
function ringGeometry(cell: Cell, y: number, fraction: number): BufferGeometry {
  const { polygon, centroid } = cell;
  const n = polygon.length;
  const k = 1 - fraction;
  const positions = new Float32Array(n * 18);
  let o = 0;
  for (let i = 0; i < n; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % n];
    if (a === undefined || b === undefined) continue;
    const aix = centroid.x + (a.x - centroid.x) * k;
    const aiz = centroid.z + (a.z - centroid.z) * k;
    const bix = centroid.x + (b.x - centroid.x) * k;
    const biz = centroid.z + (b.z - centroid.z) * k;
    positions.set(
      [a.x, y, a.z, b.x, y, b.z, bix, y, biz, a.x, y, a.z, bix, y, biz, aix, y, aiz],
      o,
    );
    o += 18;
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(positions, 3));
  return g;
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
