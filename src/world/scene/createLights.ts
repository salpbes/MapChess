// WHAT: The scene's lighting rig.
// HOW:  A hemisphere light for soft sky/ground fill plus one directional "sun"
//       from the south-west, so cell sides and (later) piece silhouettes read.
// WHY:  Low-poly flat shading (D-002) lives or dies on a single strong key
//       light with a cool fill. Shadows are deliberately off until pieces exist
//       in Phase 3; enabling them on an empty board only costs frame time.

import { DirectionalLight, Group, HemisphereLight } from 'three';

import type { BoardBounds } from '@domain/board/types';

export function createLights(bounds: BoardBounds): Group {
  const width = bounds.maxX - bounds.minX;
  const rig = new Group();
  rig.name = 'lights';

  const sky = new HemisphereLight(0xdfe8f5, 0x5a5348, 0.9);
  rig.add(sky);

  const sun = new DirectionalLight(0xfff4e0, 2.2);
  sun.position.set(bounds.minX - width * 0.3, bounds.maxY + width * 0.8, bounds.maxZ + width * 0.4);
  sun.target.position.set(
    (bounds.minX + bounds.maxX) / 2,
    bounds.minY,
    (bounds.minZ + bounds.maxZ) / 2,
  );
  rig.add(sun, sun.target);

  return rig;
}
