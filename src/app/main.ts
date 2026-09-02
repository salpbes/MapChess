// WHAT: Application entry point.
// HOW:  Vite loads this from index.html. Finds the DOM containers, calls
//       `bootstrap()`, and registers a Vite HMR dispose hook so a code change
//       tears the old scene down instead of stacking a second canvas.
// WHY:  Kept deliberately tiny. Everything with behaviour lives in a module
//       with one responsibility; main.ts only locates the DOM and delegates.

import { bootstrap } from './bootstrap';
import { APP_CONFIG } from './config';

function requireElement(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (el === null) {
    throw new Error(`index.html is missing the required #${id} container.`);
  }
  return el;
}

const worldContainer = requireElement('world');
requireElement('ui');

const app = bootstrap(APP_CONFIG, worldContainer);

console.info(
  `MapChess ${APP_CONFIG.version} — ${String(app.layout.cells.length)} cells, board ${String(APP_CONFIG.boardSizeMeters)} m.`,
);

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    app.dispose();
  });
}
