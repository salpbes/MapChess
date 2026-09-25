// WHAT: Compresses the hand-made GLB pieces in `src/chesspieces/` into the
//       web-ready set in `src/chesspieces/compressed/`, which is what the game
//       actually loads.
// HOW:  One pass per model. The baked 2048x2048 JPEG is decoded to raw RGBA by
//       sharp and re-encoded as ETC1S in a KTX2 container, with mipmaps built
//       during encoding. Filenames are preserved, because the loader reads the
//       piece and its colour out of them.
// WHY:  The set is twelve models and about 95% of every file is that one
//       texture. As JPEG it was 37 MB, and all of it had to arrive and be
//       decoded on the main thread before a player saw their pieces — enough
//       to time three journeys out of the deploy gate.
//
//       The texture stays 2048x2048. What changes is the encoding: ETC1S is
//       read by the GPU in its compressed form, so it costs a third of the
//       bytes to fetch and skips the JPEG decode and the runtime mipmap build
//       entirely. UASTC was measured too and came out LARGER than the JPEG
//       (5.05 MB against 3.39), which is the trade it is meant to make —
//       quality over size — and the wrong one here.
//
// USAGE: `npm run pieces` after adding or replacing anything in a set folder
//        under `src/chesspieces/` (medieval/, ww1/, …). The output is committed, so a build and CI never
//        need an encoder. Nothing runs this automatically: if you change a
//        master and skip this, the game keeps serving the previous compression.

import { existsSync, readdirSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { ktx2 } from 'ktx2-encoder/gltf-transform';
import sharp from 'sharp';

const SOURCE = 'src/chesspieces';
const OUT = join(SOURCE, 'compressed');

/**
 * ETC1S at full quality.
 *
 * `qualityLevel` is the size/quality dial and 255 is its top. A cheaper 128
 * was measured at 0.80 MB against 0.97 — a fifth less for visible banding on
 * pieces the player looks at all game, which is not a trade worth taking when
 * the expensive setting already cuts the set by two thirds.
 *
 * Every texture in this set is a baked sRGB albedo, so the perceptual flags are
 * right for all of them; a normal or roughness map arriving later would need
 * them off and a `slots` pattern to separate it.
 */
const OPTIONS = {
  isUASTC: false,
  qualityLevel: 255,
  compressionLevel: 2,
  // Compressed textures cannot be mipmapped by three at runtime the way a JPEG
  // is, so they are built here or the pieces alias badly when the camera pulls back.
  generateMipmap: true,
  isPerceptual: true,
  isSetKTX2SRGBTransferFunc: true,
  isKTX2File: true,
  imageDecoder: async (buffer) => {
    const { data, info } = await sharp(Buffer.from(buffer))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return { width: info.width, height: info.height, data: new Uint8Array(data) };
  },
};

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const force = process.argv.includes('--force');

/*
  One folder per piece set — medieval/, ww1/, ww2/ — each compressed into the
  same name under compressed/. A set is a folder rather than a filename prefix
  so a set can be added, replaced or deleted as a unit, and so the loader can
  fetch one set without the others ever leaving the server.
*/
const sets = readdirSync(SOURCE, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name !== 'compressed' && !d.name.startsWith('.'))
  .map((d) => d.name)
  .sort();

const stray = readdirSync(SOURCE).filter((n) => n.endsWith('.glb'));
if (stray.length > 0) {
  console.warn(
    `Ignoring ${String(stray.length)} .glb file(s) directly in ${SOURCE}: pieces now live in a set folder, e.g. ${SOURCE}/medieval/.`,
  );
}

let before = 0;
let after = 0;
let skipped = 0;
for (const set of sets) {
  const files = readdirSync(join(SOURCE, set))
    .filter((n) => n.endsWith('.glb'))
    .sort();
  if (files.length === 0) continue;
  mkdirSync(join(OUT, set), { recursive: true });

  for (const name of files) {
    const from = join(SOURCE, set, name);
    const to = join(OUT, set, name);

    /*
      Up to date means the compressed copy is newer than its master. Encoding
      takes about nine seconds a model, and the collection is heading for
      several sets of twelve; re-encoding every one on every run would make the
      script something people avoid running — which is exactly how a changed
      master ends up serving its old compression. --force re-encodes anyway.
    */
    if (!force && existsSync(to) && statSync(to).mtimeMs >= statSync(from).mtimeMs) {
      skipped += 1;
      continue;
    }

    const started = Date.now();
    const doc = await io.read(from);
    await doc.transform(ktx2(OPTIONS));
    await io.write(to, doc);

    const wasSize = statSync(from).size;
    const isSize = statSync(to).size;
    before += wasSize;
    after += isSize;
    console.info(
      `${`${set}/${name}`.padEnd(28)} ${(wasSize / 1048576).toFixed(2)} MB -> ${(isSize / 1048576).toFixed(2)} MB` +
        `  (${((Date.now() - started) / 1000).toFixed(1)}s)`,
    );
  }
}

if (skipped > 0) console.info(`${String(skipped)} already up to date (use --force to re-encode).`);
if (before === 0) {
  console.info('Nothing to compress.');
  process.exit(0);
}
console.info(
  `\nSet: ${(before / 1048576).toFixed(1)} MB -> ${(after / 1048576).toFixed(1)} MB ` +
    `(${(before / after).toFixed(1)}x smaller)`,
);
