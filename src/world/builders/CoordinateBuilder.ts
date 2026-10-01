// WHAT: The board's coordinates — a to h along White's edge, 1 to 8 beside the
//       h-file — lying on the ground just outside the board, like the letters
//       printed on a real board's frame.
// HOW:  Sixteen flat labels, one per file and one per rank, each centred on the
//       straight stretch of border its square owns and set at that square's
//       own height. The warp moves every corner inside the board but leaves
//       the border straight and evenly divided, so a letter always sits
//       exactly under its file, whatever the ground does. Drawn over the scene
//       like the place names, so a ridge cannot hide one.
// WHY:  The game talks in coordinates already — "strong players usually play
//       e4, d4 or c4", "that square is…", the record of every move — and a
//       beginner had no way to find e4. A coordinate is also the first thing a
//       player learning chess has to learn, and it is learned fastest by
//       watching it light up: hovering or selecting a square brightens its
//       letter and its number.
//
//       Numbers beside the h-file rather than the a-file, which is where most
//       boards print them: on a desktop the left-hand panels sit over the
//       a-file edge, and a prototype lost the 1, the 2 and half the a there.

import { Color, DoubleSide, Group, Mesh, MeshBasicMaterial, PlaneGeometry } from 'three';

import type { IBoardLayout } from '@domain/board/IBoardLayout';
import type { Square } from '@domain/board/Square';

import { makeTextTexture } from './textSprite';

const FILES = 'abcdefgh';

/** Where one coordinate sits, before any sizing. Board frame, as everywhere. */
export interface CoordinateAnchor {
  readonly text: string;
  readonly axis: 'file' | 'rank';
  /** The middle of the border segment it labels. */
  readonly x: number;
  readonly z: number;
  /** The platform height of the edge square it labels. */
  readonly y: number;
  /** Unit vector pointing off the board, the way the label is pushed out. */
  readonly outX: number;
  readonly outZ: number;
}

/**
 * The sixteen anchors: files on White's edge (+Z), ranks on the h-file edge
 * (+X). Pure, so the placement is testable without a canvas.
 */
export function coordinateAnchors(layout: IBoardLayout): CoordinateAnchor[] {
  const { minX, maxX, minZ, maxZ } = layout.bounds;
  const fileWidth = (maxX - minX) / 8;
  const rankDepth = (maxZ - minZ) / 8;
  const out: CoordinateAnchor[] = [];
  for (let f = 0; f < 8; f += 1) {
    const letter = FILES.charAt(f);
    out.push({
      text: letter,
      axis: 'file',
      x: minX + (f + 0.5) * fileWidth,
      z: maxZ,
      y: layout.cell(`${letter}1` as Square).platformY,
      outX: 0,
      outZ: 1,
    });
  }
  for (let r = 1; r <= 8; r += 1) {
    out.push({
      text: String(r),
      axis: 'rank',
      x: maxX,
      // Rank 1 is White's, at +Z; rank 8 is Black's.
      z: maxZ - (r - 0.5) * rankDepth,
      y: layout.cell(`h${String(r)}` as Square).platformY,
      outX: 1,
      outZ: 0,
    });
  }
  return out;
}

/** Glyph height at scale 1, in metres: a little over a quarter of a square. */
export const COORDINATE_HEIGHT = 70;
/** Clear ground between the board's edge and the nearest edge of a glyph. */
const GAP = 22;
const LIFT = 1.5;
/** After the board, the pieces and the place names. */
const RENDER_ORDER = 11;

const RESTING_OPACITY = 0.82;
const LIT = new Color('#ffd447');
const PLAIN = new Color('#ffffff');

export class CoordinateLabels {
  public readonly group = new Group();
  private readonly labels: { mesh: Mesh; anchor: CoordinateAnchor }[] = [];
  private scale = 1;
  private lit: Square | null = null;

  public constructor(layout: IBoardLayout) {
    this.group.name = 'coordinates';
    for (const anchor of coordinateAnchors(layout)) {
      const { texture, aspect } = makeTextTexture(anchor.text, {
        heightMeters: COORDINATE_HEIGHT,
        outlined: true,
        color: '#f4efe0',
      });
      const geometry = new PlaneGeometry(COORDINATE_HEIGHT * aspect, COORDINATE_HEIGHT);
      // Face-up, reading along the ranks from White's side, like the place names.
      geometry.rotateX(-Math.PI / 2);
      const mesh = new Mesh(
        geometry,
        new MeshBasicMaterial({
          map: texture,
          transparent: true,
          opacity: RESTING_OPACITY,
          depthWrite: false,
          depthTest: false,
          // Read at a glance in any weather: mist may hide the far hills, not the 8.
          fog: false,
          side: DoubleSide,
        }),
      );
      mesh.renderOrder = RENDER_ORDER;
      mesh.userData.coordinate = anchor.text;
      this.labels.push({ mesh, anchor });
      this.group.add(mesh);
    }
    this.apply();
  }

  /**
   * Bigger on a phone. Labels are sized in metres, so they shrink with the
   * board, and on a 390 px screen the board is small: at desktop size the
   * prototype's letters could not be read.
   */
  public setScale(scale: number): void {
    this.scale = scale;
    this.apply();
  }

  /** Lights the file and rank of a square — the one hovered, or selected. */
  public light(square: Square | null): void {
    if (square === this.lit) return;
    this.lit = square;
    this.apply();
  }

  /** The coordinates currently lit, for tests and anyone debugging. */
  public get litCoordinates(): readonly string[] {
    return this.labels
      .filter(({ mesh }) => mesh.userData.lit === true)
      .map(({ anchor }) => anchor.text);
  }

  public dispose(): void {
    for (const { mesh } of this.labels) {
      mesh.geometry.dispose();
      const material = mesh.material as MeshBasicMaterial;
      material.map?.dispose();
      material.dispose();
    }
    this.group.removeFromParent();
  }

  private apply(): void {
    const file = this.lit?.charAt(0) ?? null;
    const rank = this.lit?.charAt(1) ?? null;
    for (const { mesh, anchor } of this.labels) {
      const lit = anchor.text === (anchor.axis === 'file' ? file : rank);
      const size = this.scale * (lit ? 1.2 : 1);
      mesh.scale.setScalar(size);
      // Pushed out by its own half-size plus the gap, so a bigger label never
      // creeps back over the edge of the board.
      const reach = GAP + (COORDINATE_HEIGHT * size) / 2;
      mesh.position.set(
        anchor.x + anchor.outX * reach,
        anchor.y + LIFT,
        anchor.z + anchor.outZ * reach,
      );
      const material = mesh.material as MeshBasicMaterial;
      material.color.copy(lit ? LIT : PLAIN);
      material.opacity = lit ? 1 : RESTING_OPACITY;
      mesh.userData.lit = lit;
    }
  }
}
