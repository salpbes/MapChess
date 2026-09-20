// WHAT: Fetches whatever GLB piece models are present in `src/chesspieces/` and
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
 * How much of a cell the widest piece may occupy, as a fraction of cell width.
 *
 * latticeWarp guarantees every cell an inradius of 0.30 cells, which is what
 * the procedural plinth is built to. This is deliberately a little over that:
 * pieces sized strictly to the guarantee read as small on a board whose cells
 * are mostly bigger than the tightest one, so the widest model is allowed to
 * overhang the very narrowest squares slightly. One number, tune it here.
 */
const FOOTPRINT = 0.36;

/**
 * Which way the models face, in radians about Y, before the board turns them.
 *
 * PieceLayer yaws White to −Z and Black to +Z, so a model is expected to face
 * −Z at rest. These face +Z — seen from above, every shield and spear pointed
 * back toward its own side rather than at the enemy — so the set is given a
 * half-turn on the way in. One number: if a later export faces −Z, this goes
 * to 0 and nothing else changes.
 */
const MODEL_FACING = Math.PI;

/**
 * Per-type nudges to the shared scale, set by eye.
 *
 * The set's own proportions are the modeller's and are followed by default —
 * that is the whole point of one shared scale. This is the exception: a piece
 * whose modelled height does not read right on the board next to the others,
 * adjusted deliberately rather than derived from anything.
 *
 * The bishop is modelled only 12% taller than the pawn, where a chess set
 * usually puts it closer to 40% above one, and it read as a tall pawn.
 *
 * Anything not listed is 1. Fix a model in Blender by preference; this is for
 * when the art is right and only its size on this board is not.
 */
const SIZE_ADJUST: Readonly<Partial<Record<PieceType, number>>> = {
  bishop: 1.15,
};

/**
 * Every GLB in `src/chesspieces/`, found at build time by its filename.
 *
 * Vite resolves this glob when it bundles, so adding a piece is adding a file:
 * drop `knight_white.glb` in beside the rooks and it is loaded, hashed and
 * served with no code change here. A name that does not match the convention
 * is ignored rather than guessed at.
 */
const FILES: Readonly<Record<string, string>> = import.meta.glob('../../chesspieces/*.glb', {
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

  const found = Object.entries(FILES)
    .map(([path, url]) => ({ key: modelKeyFor(path), url, path }))
    .filter((entry): entry is { key: ModelKey; url: string; path: string } => entry.key !== null);

  const loaded: { key: ModelKey; scene: Object3D; box: Box3 }[] = [];
  await Promise.all(
    found.map(async ({ key, url, path }) => {
      try {
        const gltf = await loader.loadAsync(url);
        faceForward(gltf.scene, path);
        loaded.push({ key, scene: gltf.scene, box: new Box3().setFromObject(gltf.scene) });
      } catch (error: unknown) {
        // Not fatal: the board falls back to the piece it already had.
        console.warn(`Could not load ${path}; using the procedural piece.`, error);
      }
    }),
  );

  /*
    One scale for the whole set, not one per model.

    Scaling each piece to fill the plinth would hand the narrowest base the
    biggest multiplier: these pawns are 1.91 units tall on a 0.63 half-width
    and the rooks 2.67 on 0.98, so per-model normalising made the pawn 0.91
    cells tall against the rook's 0.82 — a pawn towering over a castle. The
    models are a matched set and already carry the proportions they should,
    so the only question is how much of a cell the WIDEST of them may fill.
  */
  const widest = Math.max(
    ...loaded.map(({ box }) => {
      const size = new Vector3();
      box.getSize(size);
      return Math.max(size.x, size.z) / 2;
    }),
    Number.EPSILON,
  );
  const scale = (FOOTPRINT * unit) / widest;

  const models = new Map<ModelKey, Object3D>();
  for (const { key, scene, box } of loaded) {
    const type = key.split('-')[1] as PieceType;
    models.set(key, stand(scene, box, scale * (SIZE_ADJUST[type] ?? 1)));
  }
  return models;
}

/**
 * Points the model the way the board expects, ignoring any turn the exporter
 * happened to bake into it.
 *
 * Which way a piece faces is the board's to say — PieceLayer yaws White to
 * −Z and Black to +Z — so a yaw sitting in the file is an accident of
 * authoring rather than information, and it fights the game for control of
 * the same axis. These pawns arrived with exactly 45 degrees on their root
 * node, from a rotation that was never applied before export, and stood on
 * the board facing the corners.
 *
 * Only a turn about Y is removed. A model exported lying on its side has a
 * rotation that means something, and guessing at it would be worse than
 * leaving it and saying so.
 */
function faceForward(scene: Object3D, path: string): void {
  for (const child of scene.children) {
    const { x, z } = child.rotation;
    if (Math.abs(x) > 1e-6 || Math.abs(z) > 1e-6) {
      console.warn(`${path} is rotated off the upright; leaving it as exported.`);
      continue;
    }
    child.rotation.y = MODEL_FACING;
  }
}

/**
 * Applies the set's scale and stands the model on its own feet.
 *
 * Wrapped in a group so the returned object's origin IS the feet, whatever the
 * exporter did with the model's own.
 */
function stand(scene: Object3D, box: Box3, scale: number): Object3D {
  const centre = new Vector3();
  box.getCenter(centre);

  scene.scale.setScalar(scale);
  scene.position.set(-centre.x * scale, -box.min.y * scale, -centre.z * scale);
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
