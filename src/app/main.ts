// WHAT: Application entry point.
// HOW:  Vite loads this from index.html. Finds the DOM containers, calls
//       `bootstrap()`, and registers a Vite HMR dispose hook so a code change
//       tears the old scene down instead of stacking a second canvas.
// WHY:  Kept deliberately tiny. Everything with behaviour lives in a module
//       with one responsibility; main.ts only locates the DOM and delegates.

import { bootstrap } from './bootstrap';
import type { AppHandle } from './bootstrap';
import { APP_CONFIG } from './config';

function requireElement(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (el === null) {
    throw new Error(`index.html is missing the required #${id} container.`);
  }
  return el;
}

const worldContainer = requireElement('world');
const uiContainer = requireElement('ui');

/*
  Built and shown straight away, on the drawn pieces. The models are fetched
  by the app itself, set by set, once it knows which board it is building —
  see "Pieces, by set" in bootstrap.ts.
*/
const app = bootstrap(APP_CONFIG, worldContainer, uiContainer);

/*
  The one seam the journeys need. A square's place on screen is a projection
  through the live camera, so a test that wants to click e2 has to ask the
  running app where e2 is — the alternative is hard-coded pixel coordinates
  that break the first time the default camera moves. AppHandle already
  exposes the layout and the stage; this only makes the handle reachable.
  Deliberately not behind `?debug`, which would change the layout under test
  by turning on the debug panels.
*/
declare global {
  interface Window {
    __mapchess?: AppHandle;
  }
}
window.__mapchess = app;

console.info(
  `MapChess ${APP_CONFIG.version} — ${String(app.layout().cells.length)} cells, board ${String(APP_CONFIG.boardSizeMeters)} m.`,
);

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    app.dispose();
  });
}
