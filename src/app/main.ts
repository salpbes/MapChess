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
  The board opens on the drawn pieces and adopts the GLB set when it arrives.

  Awaiting the models here was simpler — the board was built once, with
  everything already present — and it was right while the set was two small
  files. It stopped being right at twelve: the set is 37 MB, about 95% of it
  baked 2048x2048 texture, and every byte of it stood between the player and
  their first frame. On a phone that is a long blank screen. In the browser
  suite it was long enough to push four journeys past their timeouts, which is
  how a rendering decision ended up blocking the deploy.

  So the game starts on the procedural set, which needs no network at all, and
  upgrades itself when the models land. A model that never arrives is a piece
  that stays drawn — exactly what a failed load already meant.

  Deliberately the whole set at once, not one piece at a time: the loader takes
  a single scale from the tallest model it has, so adopting them piecemeal
  would resize the pieces already standing every time another one landed.
*/
const app = bootstrap(APP_CONFIG, worldContainer, uiContainer);

void loadPieceModels(APP_CONFIG.boardSizeMeters / APP_CONFIG.filesAndRanks)
  .then((models) => {
    app.usePieceModels(models);
  })
  .catch((error: unknown) => {
    // The drawn pieces are already on the board; this only records why they stayed.
    console.warn('Piece models could not be loaded; the drawn set stays.', error);
  });

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
