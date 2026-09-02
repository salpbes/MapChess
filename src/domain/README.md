# `src/domain/` — pure game logic

**The one rule:** nothing in here imports three.js, touches the DOM, or calls `fetch`. If the chess game cannot run headless in a terminal, this layer has leaked. ESLint enforces this (`eslint.config.js`, domain block).

**Belongs here:** everything that is _true about the game_ regardless of how it is drawn.

| Subfolder | Responsibility                                                       |
| --------- | -------------------------------------------------------------------- |
| `chess/`  | `IChessEngine` + chess.js wrapper. Legal moves, make/undo, game end. |
| `board/`  | `IBoardLayout` + 9×9 lattice, warping, cell polygons, terracing.     |
| `theme/`  | Terrain + names → piece and cell identity (Phase 10).                |

**May import from:** `domain/` itself and `@shared/` only.

**Tested by:** everything in `tests/`. This is the only layer with unit tests.
