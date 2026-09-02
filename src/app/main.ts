// WHAT: Application entry point.
// HOW:  Vite loads this from index.html. In Phase 0 it only verifies the
//       toolchain: confirms the DOM containers exist and logs the build config.
//       Later phases replace the body with `bootstrap()` wiring from app/.
// WHY:  Kept deliberately tiny. Everything with behaviour lives in a module
//       with one responsibility; main.ts only composes them.

import { APP_CONFIG } from './config';

function requireElement(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (el === null) {
    throw new Error(`index.html is missing the required #${id} container.`);
  }
  return el;
}

requireElement('world');
requireElement('ui');

console.info(
  `MapChess ${APP_CONFIG.version} — Phase 0 scaffold. Board area ${String(APP_CONFIG.boardSizeMeters)} m.`,
);
