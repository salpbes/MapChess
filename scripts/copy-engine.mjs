// WHAT: Copies the single-threaded Stockfish build from node_modules into
//       public/engine/ so Vite serves it as static files.
// HOW:  Runs on `npm install` (postinstall) and before dev/build. Copies the
//       JS glue, the .wasm it loads from its own directory, and the licence.
//       public/engine/ is git-ignored; this script is the source of truth.
// WHY:  The Emscripten glue resolves its .wasm as a sibling of its own URL, so
//       both files must sit next to each other with stable names. Importing
//       through Vite would hash the JS filename and break that lookup. A 7 MB
//       binary also has no business in git history.

import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'node_modules', 'stockfish');
const target = join(root, 'public', 'engine');

const files = [
  ['bin/stockfish-18-lite-single.js', 'stockfish-18-lite-single.js'],
  ['bin/stockfish-18-lite-single.wasm', 'stockfish-18-lite-single.wasm'],
  ['Copying.txt', 'LICENSE-stockfish.txt'],
];

if (!existsSync(source)) {
  console.error('copy-engine: node_modules/stockfish not found. Run `npm install` first.');
  process.exit(1);
}

mkdirSync(target, { recursive: true });
for (const [from, to] of files) {
  copyFileSync(join(source, from), join(target, to));
}
console.info(`copy-engine: ${String(files.length)} files → public/engine/`);
