// WHAT: The scene's lighting rig.
// HOW:  A hemisphere light for soft sky/ground fill, one directional "sun" from
//       the south-west that casts shadows, and a dimmer shadowless fill from the
//       opposite side. The shadow camera is an orthographic box sized from the
//       board bounds so every cell is covered and no texel is wasted outside it.
// WHY:  Low-poly flat shading (D-002) lives or dies on a single strong key
//       light. But a board is walked around, and with only a key light the
//       north-east faces fell to the hemisphere's ground colour alone and read
//       as black once the camera came round to them. The fill lifts those faces
//       without casting a second set of shadows or flattening the key's
//       modelling; the sun stays put so the shadows do not swing as you orbit.

import { DirectionalLight, Group, HemisphereLight } from 'three';

import type { BoardBounds } from '@domain/board/types';

const SHADOW_MAP_SIZE = 2048;

export function createLights(bounds: BoardBounds): Group {
  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;
  const rig = new Group();
  rig.name = 'lights';

  const sky = new HemisphereLight(0xdfe8f5, 0x6b6355, 1.05);
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

  // Opposite the sun and well below its intensity: enough that a face turned
  // away from the key light still shows its shape, not so much that the board
  // loses its direction of light.
  const fill = new DirectionalLight(0xcfe0f5, 0.75);
  fill.position.set(
    bounds.maxX + width * 0.4,
    bounds.maxY + width * 0.5,
    bounds.minZ - depth * 0.4,
  );
  fill.target.position.copy(sun.target.position);
  rig.add(fill, fill.target);

  return rig;
}
