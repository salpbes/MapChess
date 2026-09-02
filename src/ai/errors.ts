// WHAT: Errors raised by the AI layer.
// HOW:  One class with a machine-readable `reason`.
// WHY:  The game loop needs to tell "engine took too long" from "engine
//       crashed" from "engine returned nonsense" — each gets a different
//       user-facing response and a different fallback.

export type EngineErrorReason = 'timeout' | 'crashed' | 'busy' | 'disposed' | 'no-move';

export class EngineError extends Error {
  public constructor(
    public readonly reason: EngineErrorReason,
    detail?: string,
  ) {
    super(`Chess engine error (${reason})${detail === undefined ? '' : `: ${detail}`}`);
    this.name = 'EngineError';
  }
}
