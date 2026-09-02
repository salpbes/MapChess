# `src/ai/` — the computer opponent

**Belongs here:** `IChessAI` and its Stockfish adapter.

| File             | Responsibility                                                                    |
| ---------------- | --------------------------------------------------------------------------------- |
| `IChessAI.ts`    | Seam: `ready()`, `setDifficulty()`, `chooseMove(fen) → MoveRequest`, `dispose()`. |
| `difficulty.ts`  | `beginner / club / strong` → UCI Skill Level, think time, hash.                   |
| `uci.ts`         | Pure parsers for `bestmove`, `uciok`, `readyok`. Unit-tested.                     |
| `errors.ts`      | `EngineError` with reason: timeout, crashed, busy, disposed, no-move.             |
| `StockfishAI.ts` | Worker plumbing: handshake, options, one request at a time, every wait timed out. |

**Engine files:** `public/engine/` is populated from `node_modules/stockfish` by `scripts/copy-engine.mjs` on install and before dev/build (D-017). It is git-ignored.

**Hard rules:**

- **Single-threaded** build only (`stockfish-18-lite-single`). The multi-threaded builds need `SharedArrayBuffer` and COOP/COEP headers that static hosts do not set.
- Never block the render thread. All engine work happens in the worker; the main thread only posts strings.
- The engine is trusted but verified: `GameLoop` checks every reply with `IChessEngine.isLegal` and plays a legal fallback if it fails. `ai/` itself never imports `chess.js`.
- Stockfish is **GPL-3.0**. `public/engine/LICENSE-stockfish.txt` ships with it; Phase 12 adds the visible credit.
