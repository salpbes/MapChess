# `src/game/` — the turn loop

**Belongs here:** `GameLoop` — the orchestrator that turns input into a move, asks `IChessEngine` whether it is legal, applies it, tells the renderer to animate it, and hands the turn to `IChessAI` when it is the computer's move.

**Does not belong here:** chess rules (domain), meshes (world), Stockfish (ai), or menus (ui). `game/` only coordinates, via constructor-injected interfaces and the event bus.

**Built in:** Phase 3 (hot-seat), extended in Phase 4 (AI opponent).
