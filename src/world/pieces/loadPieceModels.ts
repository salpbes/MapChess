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
 * How tall an unadjusted piece stands, in cell widths.
 *
 * The set is modelled height-normalised — every piece is exactly 2.00 units
 * tall — so the models carry no proportions of their own and this is what
 * decides the scale. A pawn takes no adjustment, so this is the pawn.
 */
const PIECE_HEIGHT = 0.74;

/**
 * How much of a cell the widest piece may occupy, as a fraction of cell width.
 *
 * latticeWarp guarantees every cell an inradius of 0.30 cells, which is what
 * the procedural plinth is built to. This is deliberately a little over that:
 * pieces sized strictly to the guarantee read as small on a board whose cells
 * are mostly bigger than the tightest one, so the widest model is allowed to
 * overhang the very narrowest squares slightly. Only a ceiling now — height
 * decides the scale unless a model is wide enough to foul its square.
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
 * These carry the whole of the set's proportions, not a correction to them.
 * Every model is exactly 2.00 units tall, so left alone the king would stand
 * level with a pawn; the scale decides how big a piece is and this decides
 * which piece.
 *
 * `scale` grows the whole piece; `width` grows only its plan, for a piece that
 * is tall enough but reads thin.
 *
 * The order they produce is a chess set's: pawn, rook, knight, bishop, queen,
 * king. The pawn takes none by definition — PIECE_HEIGHT is the pawn.
 *
 * Width multipliers do not climb with rank the way heights do, because the
 * models do not start equally broad: a horse head and a castle are wider in
 * the file than a robed figure, so they need less help.
 */
interface SizeAdjust {
  /** Uniform multiplier on the shared scale. */
  readonly scale?: number;
  /** Extra multiplier on x and z only. */
  readonly width?: number;
}

const SIZE_ADJUST: Readonly<Partial<Record<PieceType, SizeAdjust>>> = {
  rook: { scale: 1.12 },
  bishop: { scale: 1.3, width: 1.25 },
  knight: { scale: 1.22, width: 1.12 },
  queen: { scale: 1.4, width: 1.25 },
  king: { scale: 1.45, width: 1.25 },
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
    One scale for the whole set, taken from height.

    The set arrived height-normalised: every model is exactly 2.00 units tall,
    so there are no modelled proportions left to follow and every difference in
    rank has to come from SIZE_ADJUST. Scaling from the widest model — which is
    what this did while the rooks were 2.70 on a 0.98 base — now means the
    rook's waistline decides how big a king is, and the day the rooks were
    remade slimmer it would have grown the whole set by 40%.

    So height sets the scale and width only caps it: a model broad enough to
    foul the narrowest square still pulls the set down to fit, adjustments
    included, which is the guarantee the lattice makes and the one thing here
    that is not a matter of taste.
  */
  const tallest = Math.max(...loaded.map(({ box }) => box.max.y - box.min.y), Number.EPSILON);
  const byHeight = (PIECE_HEIGHT * unit) / tallest;

  const widest = Math.max(
    ...loaded.map(({ key, box }) => {
      const adjust = SIZE_ADJUST[key.split('-')[1] as PieceType] ?? {};
      const size = new Vector3();
      box.getSize(size);
      const half = Math.max(size.x, size.z) / 2;
      return half * (adjust.scale ?? 1) * (adjust.width ?? 1);
    }),
    Number.EPSILON,
  );
  const byWidth = (FOOTPRINT * unit) / widest;

  const scale = Math.min(byHeight, byWidth);

  const models = new Map<ModelKey, Object3D>();
  for (const { key, scene, box } of loaded) {
    const adjust = SIZE_ADJUST[key.split('-')[1] as PieceType] ?? {};
    const up = scale * (adjust.scale ?? 1);
    models.set(key, stand(scene, box, up, up * (adjust.width ?? 1)));
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
function stand(scene: Object3D, box: Box3, up: number, across: number): Object3D {
  const centre = new Vector3();
  box.getCenter(centre);

  // Height and plan scale separately, so the offsets that centre the model and
  // stand it on the ground have to use the axis they belong to.
  scene.scale.set(across, up, across);
  scene.position.set(-centre.x * across, -box.min.y * up, -centre.z * across);
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
