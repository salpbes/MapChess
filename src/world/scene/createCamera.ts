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

export function createCamera(bounds: BoardBounds, aspect: number): PerspectiveCamera {
  const width = bounds.maxX - bounds.minX;
  const camera = new PerspectiveCamera(FOV_DEGREES, aspect, width * 0.01, width * 20);

  const target = boardCentre(bounds);
  camera.position.set(target.x, bounds.maxY + width * RISE, bounds.maxZ + width * PULL_BACK);
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
