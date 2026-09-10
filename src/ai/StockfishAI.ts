// WHAT: IChessAI backed by single-threaded Stockfish running in a Web Worker.
// HOW:  Spawns the Emscripten glue as a classic worker (it fetches its .wasm
//       from the same directory). Speaks UCI over postMessage: handshake once,
//       push options on difficulty change, and for each request send
//       `position fen … / go movetime …` and wait for `bestmove`. Every wait
//       has a timeout; the worker is never touched from anywhere else. Every
//       request goes through one queue, because the engine searches one
//       position at a time and there are three callers now: the opponent's
//       move, a hint, and the running assessment.
// WHY:  Search runs entirely off the render thread, so the board stays at full
//       frame rate while the engine thinks (BUILD_PLAN Phase 4). Single-threaded
//       so it deploys on any static host without COOP/COEP headers (§3).
//
//       The queue replaced a "refuse if busy" guard that worked while the
//       opponent was the only caller. Each entry point checked that nothing was
//       pending and then awaited before claiming the slot — and that await is
//       long enough for a second caller to pass the same check, so the later
//       search overwrote the earlier one's promise. The orphan never resolved,
//       its watchdog fired, and the opponent fell back to a near-random move.
//       Waiting a turn is always better than refusing.

import type { MoveRequest } from '@domain/chess/types';

import {
  ADVICE_SETTINGS,
  ANALYSIS_SETTINGS,
  DIFFICULTY_SETTINGS,
  goCommand,
  optionCommands,
} from './difficulty';
import type { EngineSettings } from './difficulty';
import { EngineError } from './errors';
import type { Difficulty, IChessAI } from './IChessAI';
import { isReadyOk, isUciOk, parseBestMove, parseInfoScore, parseOptionName } from './uci';
import type { EngineScore } from './uci';

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
  /** Every request to the engine, one at a time and in the order asked. */
  private chain: Promise<unknown> = Promise.resolve();
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

  public chooseMove(fen: string): Promise<MoveRequest> {
    if (this.disposed) throw new EngineError('disposed');
    return this.enqueue(() => this.searchForMove(fen));
  }

  private async searchForMove(fen: string): Promise<MoveRequest> {
    if (this.disposed) throw new EngineError('disposed');
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
  public hint(fen: string): Promise<MoveRequest> {
    if (this.disposed) throw new EngineError('disposed');
    return this.enqueue(() => this.searchForHint(fen));
  }

  private async searchForHint(fen: string): Promise<MoveRequest> {
    await this.readyPromise;

    for (const command of optionCommands(ADVICE_SETTINGS, this.supported)) this.send(command);
    try {
      return await this.search(fen, ADVICE_SETTINGS);
    } finally {
      this.applySettings();
    }
  }

  /**
   * How the engine rates the position, from the side to move's point of view.
   * Resolves null rather than rejecting: this drives a display the game does
   * not need, and an outage should empty it rather than break anything.
   */
  public evaluate(fen: string): Promise<EngineScore | null> {
    if (this.disposed) return Promise.resolve(null);
    return this.enqueue(() => this.searchForScore(fen));
  }

  private async searchForScore(fen: string): Promise<EngineScore | null> {
    try {
      await this.readyPromise;
    } catch {
      return null;
    }

    // The last score before `bestmove` is the deepest one the search reached.
    let best: EngineScore | null = null;
    const listen = (line: string): void => {
      const score = parseInfoScore(line);
      if (score !== null && (best === null || score.depth >= best.depth)) best = score;
    };
    this.lineListeners.add(listen);

    for (const command of optionCommands(ANALYSIS_SETTINGS, this.supported)) this.send(command);
    try {
      await this.search(fen, ANALYSIS_SETTINGS);
      return best;
    } catch (error: unknown) {
      console.warn('Position evaluation failed.', error);
      return null;
    } finally {
      this.lineListeners.delete(listen);
      this.applySettings();
    }
  }

  /**
   * Runs `work` once everything asked for before it has finished, whether that
   * finished well or badly. Nothing else may touch the engine in between.
   */
  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const run = this.chain.then(work, work);
    // The chain must survive a rejected caller, or the queue stops for good.
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  /** One `position` + `go`, resolved by the next `bestmove` or abandoned. */
  private search(fen: string, settings: EngineSettings): Promise<MoveRequest> {
    // The queue is what guarantees this; if it ever does not, fail loudly
    // rather than silently orphan the search already running.
    if (this.pending !== null) return Promise.reject(new EngineError('busy'));
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
