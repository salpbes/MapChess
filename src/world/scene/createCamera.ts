// WHAT: Creates the perspective camera and frames the board.
// HOW:  Places the camera south of the board (+Z, White's side per D-007),
//       raised and pulled back proportionally to the board's width so any
//       board size fills the view the same way. Near/far are derived from the
//       same width so depth precision is not wasted.
// WHY:  Framing is a function of board bounds, not magic numbers — the warped
//       board in Phase 8 will have a different height range and must still
//       land in view without touching this file.

import { PerspectiveCamera, Vector3 } from 'three';

import type { BoardBounds } from '@domain/board/types';

const FOV_DEGREES = 45;
/** Camera distance behind White's back rank, as a fraction of board width. */
const PULL_BACK = 0.55;
/** Camera height above the board's top surface, as a fraction of board width. */
const RISE = 0.95;

/** Leaves a little air around the board rather than fitting it to the pixel. */
const FIT_MARGIN = 1.12;

/**
 * How much further back the camera must sit for the whole board to fit across
 * a screen of this shape. 1 on any landscape screen, so desktop framing is
 * exactly what it always was.
 *
 * three.js reads `fov` VERTICALLY, so a tall narrow screen sees a much
 * narrower slice of the world horizontally — at 390x844 the outer files fell
 * outside the frustum altogether, which on a phone means the a-file cannot be
 * tapped at all.
 */
export function widthFitScale(aspect: number): number {
  const halfVertical = ((FOV_DEGREES / 2) * Math.PI) / 180;
  const halfHorizontal = Math.atan(Math.tan(halfVertical) * aspect);
  // Both in board widths, so the ratio is the scale.
  const needed = FIT_MARGIN / 2 / Math.tan(halfHorizontal);
  const current = Math.hypot(RISE, PULL_BACK);
  return Math.max(1, needed / current);
}

/**
 * How far above the board the camera must sit to see all of it straight down.
 *
 * Both fits matter and the binding one changes with the screen: a wide window
 * runs out of height first, a phone held upright runs out of width.
 */
export function topDownDistance(width: number, aspect: number): number {
  const halfVertical = ((FOV_DEGREES / 2) * Math.PI) / 180;
  const halfHorizontal = Math.atan(Math.tan(halfVertical) * aspect);
  const reach = (width / 2) * FIT_MARGIN;
  return Math.max(reach / Math.tan(halfVertical), reach / Math.tan(halfHorizontal));
}

export function createCamera(bounds: BoardBounds, aspect: number): PerspectiveCamera {
  const width = bounds.maxX - bounds.minX;
  const camera = new PerspectiveCamera(FOV_DEGREES, aspect, width * 0.01, width * 20);
  const fit = widthFitScale(aspect);

  const target = boardCentre(bounds);
  camera.position.set(
    target.x,
    bounds.maxY + width * RISE * fit,
    bounds.maxZ + width * PULL_BACK * fit,
  );
  camera.lookAt(target);
  return camera;
}

export function boardCentre(bounds: BoardBounds): Vector3 {
  return new Vector3(
    (bounds.minX + bounds.maxX) / 2,
    (bounds.minY + bounds.maxY) / 2,
    (bounds.minZ + bounds.maxZ) / 2,
  );
}
