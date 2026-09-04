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

export function createControls(
  camera: PerspectiveCamera,
  canvas: HTMLElement,
  bounds: BoardBounds,
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
  controls.maxDistance = width * 3;
  // ~85°: shallow enough to read relief, never below the platform tops.
  controls.maxPolarAngle = Math.PI * 0.47;
  controls.update();

  return controls;
}
