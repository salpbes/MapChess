# `src/ai/` — the computer opponent

**Belongs here:** `IChessAI` and its Stockfish adapter: the Web Worker wrapper, UCI message parsing, and the difficulty mapping (skill level + think time → beginner / club / strong).

**Hard rules:**

- **Single-threaded** Stockfish WASM build only. The multi-threaded build needs `SharedArrayBuffer` and COOP/COEP headers that static hosts do not set.
- Never block the render thread. All engine work happens in the worker.
- The AI must always return a move that `IChessEngine` accepts as legal.

**Built in:** Phase 4.
