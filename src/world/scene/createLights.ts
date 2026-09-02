// WHAT: The scene's lighting rig.
// HOW:  A hemisphere light for soft sky/ground fill plus one directional "sun"
//       from the south-west that casts shadows. The shadow camera is an
//       orthographic box sized from the board bounds so every cell is covered
//       and no texel is wasted outside the board.
// WHY:  Low-poly flat shading (D-002) lives or dies on a single strong key
//       light with a cool fill. Shadows are what anchor upright pieces to
//       their platforms; without them they float.

import { DirectionalLight, Group, HemisphereLight } from 'three';

import type { BoardBounds } from '@domain/board/types';

const SHADOW_MAP_SIZE = 2048;

export function createLights(bounds: BoardBounds): Group {
  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;
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

  sun.castShadow = true;
  sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
  // Half-diagonal of the board plus headroom for tall pieces at the edge.
  const reach = Math.hypot(width, depth) * 0.6;
  sun.shadow.camera.left = -reach;
  sun.shadow.camera.right = reach;
  sun.shadow.camera.top = reach;
  sun.shadow.camera.bottom = -reach;
  sun.shadow.camera.near = width * 0.1;
  sun.shadow.camera.far = width * 3;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = width * 0.0005;

  rig.add(sun, sun.target);

  return rig;
}
