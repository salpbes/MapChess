// WHAT: Application entry point.
// HOW:  Vite loads this from index.html. Finds the DOM containers, calls
//       `bootstrap()`, and registers a Vite HMR dispose hook so a code change
//       tears the old scene down instead of stacking a second canvas.
// WHY:  Kept deliberately tiny. Everything with behaviour lives in a module
//       with one responsibility; main.ts only locates the DOM and delegates.

import { loadPieceModels } from '@world/pieces/loadPieceModels';

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
  Models first, so the board is built once with whatever arrived rather than
  built procedurally and then rebuilt. A model that fails to load is simply
  absent from the map and that piece stays procedural, so this never keeps the
  game from starting.

  KNOWN COST, parked deliberately: awaiting here means the page shows nothing
  until every model has downloaded and parsed. At four files (~1 MB) that is
  already a pause on a phone, and the set is heading for twelve. The fix is to
  start on the procedural pieces and swap each model in as it arrives —
  PieceLayer.sync already rebuilds from a position — and it is worth doing once
  the set is complete rather than twice while it grows.
*/
const models = await loadPieceModels(APP_CONFIG.boardSizeMeters / APP_CONFIG.filesAndRanks);
const app = bootstrap(APP_CONFIG, worldContainer, uiContainer, models);

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
