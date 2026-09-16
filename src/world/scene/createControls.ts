// WHAT: Configures OrbitControls for looking at a board.
// HOW:  Orbits around the board centre, with damping; distance limits scale
//       with board width; the polar angle is capped just above the horizon so
//       the camera can never go under the board. Left drag orbits, right drag
//       (or two fingers) slides the board, scroll zooms.
// WHY:  Unbounded orbit controls let the player end up staring at the
//       underside of the terrain. The limits are the only thing preventing
//       that, so they live in one place. Panning stays in the board's own
//       plane rather than the screen's, so sliding the board never lifts it
//       towards the camera; WorldStage keeps the target from wandering off it.

import type { PerspectiveCamera } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import type { BoardBounds } from '@domain/board/types';

import { boardCentre } from './createCamera';

/** ~85°: shallow enough to read relief, never below the platform tops. */
const MAX_POLAR = Math.PI * 0.47;
/**
 * ~72° for a finger. The shallower the view, the more foreshortened the far
 * rank is — at 85° a cell near the horizon is a few pixels tall, and a
 * fingertip covering eight of them cannot help but choose the cell behind the
 * one it is aimed at. Keeping the camera higher is the only fix that works on
 * the geometry rather than apologising for it afterwards.
 */
const MAX_POLAR_COARSE = Math.PI * 0.4;

export interface ControlOptions {
  /** True where the pointer is a fingertip rather than a cursor. */
  readonly coarsePointer?: boolean;
}

export function createControls(
  camera: PerspectiveCamera,
  canvas: HTMLElement,
  bounds: BoardBounds,
  options: ControlOptions = {},
): OrbitControls {
  const width = bounds.maxX - bounds.minX;
  const controls = new OrbitControls(camera, canvas);

  controls.target.copy(boardCentre(bounds));
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  // Pan across the ground, not across the screen: dragging slides the board
  // rather than lifting it. Bound to right-drag and two-finger drag.
  controls.enablePan = true;
  controls.screenSpacePanning = false;
  controls.minDistance = width * 0.25;
  // A portrait screen starts further back so the board fits across it; the
  // ceiling has to clear wherever createCamera actually put the camera, or the
  // first frame is already clamped and the board jumps.
  controls.maxDistance = Math.max(width * 3, camera.position.distanceTo(controls.target) * 1.25);
  controls.maxPolarAngle = options.coarsePointer === true ? MAX_POLAR_COARSE : MAX_POLAR;
  controls.update();

  return controls;
}
