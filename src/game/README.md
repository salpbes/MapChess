# `src/game/` — the turn loop

**Belongs here:** `GameLoop` — the orchestrator that turns a square click into a move, asks `IChessEngine` whether it is legal, applies it, tells `IBoardView` to animate it, and publishes what happened on the `GameBus`. Plus the seams it depends on:

- `IBoardView.ts` — what the loop needs from the 3D board (show position, play move, highlights). Implemented in `world/pieces/BoardView.ts`.
- `IPromotionChooser.ts` — ask the player which piece a pawn becomes. Implemented in `ui/PromotionPrompt.ts`.
- `GameEvents.ts` — the typed event map: `status-changed`, `move-played`, `move-undone`, `history-changed`, `game-over`, `move-refused`, `selection-changed`, `ai-thinking`, `ai-error`.
- `GameOutcome.ts` — checkmate, draw or resignation as one value (D-033).
- `captures.ts` — the captured piles and the material balance, folded from the history.
- `PieceTracker.ts` / `ThemeTracker.ts` — which identity is on which square, through captures, castling, promotion and take-backs.
- `SavedGame.ts` / `SaveManager.ts` — the save record and its guard, and the autosave that keeps it current. Storage itself is a `JsonStore` injected from `app/`, so nothing here touches the browser (D-034).

**Does not belong here:** chess rules (domain), meshes (world), Stockfish (ai), or menus (ui). `game/` never imports three.js or touches the DOM; `tests/game/` proves it by running the loop with fakes.

**Built in:** Phase 3 (hot-seat), extended in Phase 4 (AI opponent) and Phase 11 (undo, resign, restore, save).
