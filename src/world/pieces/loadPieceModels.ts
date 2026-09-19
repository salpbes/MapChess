// WHAT: Fetches whatever GLB piece models are present in `src/models/` and
//       hands back the ones that arrived, normalised and ready to clone.
// HOW:  One GLTFLoader pass. Each model is measured, scaled so its footprint
//       fills the plinth the lattice reserves, and shifted so its feet sit at
//       y = 0 and its centre on the axis — the board places pieces by centroid
//       and platform height, so anything else stands off its square or sinks
//       into it. Models that fail to load are left out rather than throwing:
//       a missing file means the procedural piece is used, not a blank board.
// WHY:  BUILD_PLAN §2 — "exported GLB pieces often have their origin at the
//       model centre, not the feet. Measure the bounding box in the loader and
//       offset once, never per-piece magic numbers." This is that loader.

import { Box3, Group, Mesh, Vector3 } from 'three';
import type { Object3D } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import type { Color, PieceType } from '@domain/chess/types';

/** `${color}-${type}`, the key a factory looks a model up by. */
export type ModelKey = `${Color}-${PieceType}`;

/**
 * How much of a cell a piece may occupy, as a fraction of cell width.
 *
 * latticeWarp guarantees every cell an inradius of 0.30 cells, and the
 * procedural plinth is built to exactly that. A model scaled past it would
 * overhang the narrowest cell on a warped board.
 */
const FOOTPRINT = 0.3;

/**
 * Every GLB in `src/models/`, found at build time by its filename.
 *
 * Vite resolves this glob when it bundles, so adding a piece is adding a file:
 * drop `knight_white.glb` in beside the rooks and it is loaded, hashed and
 * served with no code change here. A name that does not match the convention
 * is ignored rather than guessed at.
 */
const FILES: Readonly<Record<string, string>> = import.meta.glob('../../models/*.glb', {
  eager: true,
  query: '?url',
  import: 'default',
});

const TYPES: readonly PieceType[] = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'];
const COLORS: readonly Color[] = ['white', 'black'];

/**
 * `<type>_<colour>.glb`, e.g. `rook_white.glb`. Anything else is skipped.
 *
 * Exported so the convention is testable without a browser: it is the whole
 * contract for adding a piece, and a silent mismatch would look exactly like a
 * model that failed to load.
 */
export function modelKeyFor(path: string): ModelKey | null {
  const name =
    path
      .split('/')
      .pop()
      ?.replace(/\.glb$/i, '')
      .toLowerCase() ?? '';
  const [type, color] = name.split('_');
  if (!TYPES.includes(type as PieceType)) return null;
  if (!COLORS.includes(color as Color)) return null;
  return `${color as Color}-${type as PieceType}`;
}

export type PieceModels = ReadonlyMap<ModelKey, Object3D>;

export async function loadPieceModels(unit: number): Promise<PieceModels> {
  const loader = new GLTFLoader();
  const models = new Map<ModelKey, Object3D>();

  const found = Object.entries(FILES)
    .map(([path, url]) => ({ key: modelKeyFor(path), url, path }))
    .filter((entry): entry is { key: ModelKey; url: string; path: string } => entry.key !== null);

  await Promise.all(
    found.map(async ({ key, url, path }) => {
      try {
        const gltf = await loader.loadAsync(url);
        models.set(key, normalise(gltf.scene, unit));
      } catch (error: unknown) {
        // Not fatal: the board falls back to the piece it already had.
        console.warn(`Could not load ${path}; using the procedural piece.`, error);
      }
    }),
  );

  return models;
}

/**
 * Scales a model to the board's units and stands it on its own feet.
 *
 * Wrapped in a group so the returned object's origin IS the feet, whatever the
 * exporter did with the model's own.
 */
function normalise(scene: Object3D, unit: number): Object3D {
  const box = new Box3().setFromObject(scene);
  const size = new Vector3();
  const centre = new Vector3();
  box.getSize(size);
  box.getCenter(centre);

  // The widest of the two ground axes decides the scale: a rook is square in
  // plan, but nothing here should assume that of the next model.
  const halfWidest = Math.max(size.x, size.z) / 2;
  const scale = halfWidest > 0 ? (FOOTPRINT * unit) / halfWidest : 1;

  scene.scale.setScalar(scale);
  scene.position.set(-centre.x * scale, -box.min.y * scale, -centre.z * scale);

  for (const child of scene.children) markShadows(child);
  markShadows(scene);

  const root = new Group();
  root.add(scene);
  return root;
}

function markShadows(object: Object3D): void {
  object.traverse((node) => {
    if (node instanceof Mesh) {
      node.castShadow = true;
      node.receiveShadow = true;
    }
  });
}
