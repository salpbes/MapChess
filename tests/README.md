# `tests/` — Vitest unit tests

**Belongs here:** tests for `src/domain/` only. Chess rules (Phase 2), board layout invariants (Phase 8), theming (Phase 10), and any pure helper in `shared/`.

**Does not belong here:** anything that needs a WebGL context, a DOM, or the network. The 3D scene is verified by eye and by frame-rate measurement, not by unit tests.

**Layout:** mirror `src/` — `tests/domain/chess/ChessEngine.test.ts` tests `src/domain/chess/ChessEngine.ts`.

**Run:** `npm run test` (once) or `npm run test:watch`.
