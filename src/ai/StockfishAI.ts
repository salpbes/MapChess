// WHAT: IChessAI backed by single-threaded Stockfish running in a Web Worker.
// HOW:  Spawns the Emscripten glue as a classic worker (it fetches its .wasm
//       from the same directory). Speaks UCI over postMessage: handshake once,
//       push options on difficulty change, and for each request send
//       `position fen … / go movetime …` and wait for `bestmove`. Every wait
//       has a timeout; the worker is never touched from anywhere else.
// WHY:  Search runs entirely off the render thread, so the board stays at full
//       frame rate while the engine thinks (BUILD_PLAN Phase 4). Single-threaded
//       so it deploys on any static host without COOP/COEP headers (§3).

import type { MoveRequest } from '@domain/chess/types';

import { ADVICE_SETTINGS, DIFFICULTY_SETTINGS, goCommand, optionCommands } from './difficulty';
import type { EngineSettings } from './difficulty';
import { EngineError } from './errors';
import type { Difficulty, IChessAI } from './IChessAI';
import { isReadyOk, isUciOk, parseBestMove, parseOptionName } from './uci';

interface Pending {
  readonly resolve: (move: MoveRequest) => void;
  readonly reject: (error: EngineError) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

export interface StockfishAIOptions {
  /** URL of the engine glue script, served with its .wasm alongside. */
  readonly workerUrl: string;
  readonly difficulty?: Difficulty;
  /** How long past the requested think time to wait before giving up. */
  readonly graceMs?: number;
  /** Upper bound for the load + UCI handshake. */
  readonly handshakeTimeoutMs?: number;
}

const DEFAULT_GRACE_MS = 4000;
const DEFAULT_HANDSHAKE_MS = 30000;

export class StockfishAI implements IChessAI {
  private readonly worker: Worker;
  private readonly readyPromise: Promise<void>;
  private readonly graceMs: number;
  private readonly lineListeners = new Set<(line: string) => void>();
  /** Option names this build advertised during the handshake. */
  private readonly supported = new Set<string>();
  private settings: EngineSettings;
  private pending: Pending | null = null;
  private disposed = false;

  public constructor(options: StockfishAIOptions) {
    this.settings = DIFFICULTY_SETTINGS[options.difficulty ?? 'club'];
    this.graceMs = options.graceMs ?? DEFAULT_GRACE_MS;
    this.worker = new Worker(options.workerUrl);
    this.worker.onmessage = (e: MessageEvent<unknown>) => {
      if (typeof e.data === 'string') this.onLine(e.data);
    };
    this.worker.onerror = (e: ErrorEvent) => {
      this.failPending(new EngineError('crashed', e.message));
    };
    this.readyPromise = this.handshake(options.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_MS);
  }

  public ready(): Promise<void> {
    return this.readyPromise;
  }

  public setDifficulty(level: Difficulty): void {
    this.settings = DIFFICULTY_SETTINGS[level];
    this.readyPromise.then(
      () => {
        this.applySettings();
      },
      // A failed handshake is reported through ready(); nothing more to do here.
      () => undefined,
    );
  }

  public async chooseMove(fen: string): Promise<MoveRequest> {
    if (this.disposed) throw new EngineError('disposed');
    if (this.pending !== null) throw new EngineError('busy');
    await this.readyPromise;

    const settings = this.settings;
    const started = Date.now();
    const move = await this.search(fen, settings);

    // A shallow search answers instantly; pausing makes the easy levels read as
    // an opponent thinking rather than as the board glitching.
    const owed = settings.minThinkMs - (Date.now() - started);
    if (owed > 0) await new Promise((resolve) => setTimeout(resolve, owed));
    return move;
  }

  /**
   * A suggestion for whoever is to move, searched at full strength no matter
   * how weak the opponent is set to. The level's own options are put back
   * afterwards, including when the search fails: they persist in the engine,
   * so leaving them raised would silently turn a Learner into a Strong.
   */
  public async hint(fen: string): Promise<MoveRequest> {
    if (this.disposed) throw new EngineError('disposed');
    if (this.pending !== null) throw new EngineError('busy');
    await this.readyPromise;

    for (const command of optionCommands(ADVICE_SETTINGS, this.supported)) this.send(command);
    try {
      return await this.search(fen, ADVICE_SETTINGS);
    } finally {
      this.applySettings();
    }
  }

  /** One `position` + `go`, resolved by the next `bestmove` or abandoned. */
  private search(fen: string, settings: EngineSettings): Promise<MoveRequest> {
    return new Promise<MoveRequest>((resolve, reject) => {
      const timeout = settings.budgetMs + this.graceMs;
      const timer = setTimeout(() => {
        this.pending = null;
        this.send('stop');
        reject(new EngineError('timeout', `no bestmove within ${String(timeout)} ms`));
      }, timeout);
      this.pending = { resolve, reject, timer };

      this.send(`position fen ${fen}`);
      this.send(goCommand(settings));
    });
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.failPending(new EngineError('disposed'));
    this.send('quit');
    this.worker.terminate();
    this.lineListeners.clear();
  }

  private async handshake(timeoutMs: number): Promise<void> {
    this.send('uci');
    // Every `option name …` line up to `uciok` fills `supported`, so the
    // settings that follow are only the ones this build actually understands.
    await this.waitFor(isUciOk, timeoutMs, 'uciok');
    this.send('ucinewgame');
    this.applySettings();
    await this.waitFor(isReadyOk, timeoutMs, 'readyok');
  }

  private applySettings(): void {
    for (const command of optionCommands(this.settings, this.supported)) this.send(command);
    this.send('isready');
  }

  private onLine(line: string): void {
    const option = parseOptionName(line);
    if (option !== null) this.supported.add(option);
    for (const listener of [...this.lineListeners]) listener(line);

    const pending = this.pending;
    if (pending === null) return;
    if (!line.startsWith('bestmove')) return;

    clearTimeout(pending.timer);
    this.pending = null;
    const move = parseBestMove(line);
    if (move === null) {
      pending.reject(new EngineError('no-move', line));
      return;
    }
    pending.resolve(move);
  }

  /** Resolves when a line matching the predicate arrives; rejects on timeout. */
  private waitFor(
    match: (line: string) => boolean,
    timeoutMs: number,
    what: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.lineListeners.delete(listener);
        reject(new EngineError('timeout', `no ${what} within ${String(timeoutMs)} ms`));
      }, timeoutMs);
      const listener = (line: string): void => {
        if (!match(line)) return;
        clearTimeout(timer);
        this.lineListeners.delete(listener);
        resolve();
      };
      this.lineListeners.add(listener);
    });
  }

  private failPending(error: EngineError): void {
    const pending = this.pending;
    if (pending === null) return;
    clearTimeout(pending.timer);
    this.pending = null;
    pending.reject(error);
  }

  private send(command: string): void {
    if (this.disposed && command !== 'quit') return;
    this.worker.postMessage(command);
  }
}
