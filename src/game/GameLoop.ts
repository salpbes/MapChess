// WHAT: The turn loop — turns square clicks (or engine replies) into chess
//       moves and keeps the board view and the event bus informed.
// HOW:  A small state machine: nothing selected → a piece selected → (maybe
//       a promotion prompt) → animating → back to nothing selected. Every rule
//       question goes to IChessEngine; every visual goes to IBoardView. When
//       the side to move is assigned to the AI, the loop asks IChessAI instead
//       of waiting for clicks. Clicks are ignored while busy or on AI turns.
//       `undo` rewinds to the human's turn, `resign` ends the game outside the
//       rules, and `restore` replays a saved move list without animating it.
//       Castling is offered on the rook's square as well as the king's
//       destination, because that is where players click. `requestHint` asks
//       the engine what it would play and shows it without playing it.
// WHY:  This is the only place where input, rules, rendering and the opponent
//       meet, and it depends on interfaces for all four so it can run without
//       a browser.

import type { IChessAI } from '@ai/IChessAI';
import type { Square } from '@domain/board/Square';
import { IllegalMoveError } from '@domain/chess/errors';
import type { IChessEngine } from '@domain/chess/IChessEngine';
import type { Color, Move, MoveRequest } from '@domain/chess/types';

import { assess } from './assessment';
import { coach } from './coaching';
import { explainMove } from './explainMove';
import type { BlockedReason, GameBus } from './GameEvents';
import { outcomeOf } from './GameOutcome';
import type { GameOutcome } from './GameOutcome';
import type { IBoardView } from './IBoardView';
import type { IPromotionChooser } from './IPromotionChooser';

export type PlayerKind = 'human' | 'ai';
export type Players = Readonly<Record<Color, PlayerKind>>;

export const HOT_SEAT: Players = { white: 'human', black: 'human' };

export interface GameLoopDeps {
  readonly engine: IChessEngine;
  readonly view: IBoardView;
  readonly promotion: IPromotionChooser;
  readonly bus: GameBus;
  /** Optional: without it every seat is human regardless of `players`. */
  readonly ai?: IChessAI;
}

/** A game to pick up where it was left: the moves so far and how it was set up. */
export interface RestoredGame {
  readonly moves: readonly MoveRequest[];
  readonly players: Players;
  readonly resignedBy: Color | null;
}

export class GameLoop {
  private selected: Square | null = null;
  private busy = false;
  private players: Players = HOT_SEAT;
  private resignedBy: Color | null = null;
  /** A suggestion on screen, shown until the position changes under it. */
  private hint: Move | null = null;
  /** Whether the engine is asked to rate the position after every change. */
  private assessing = false;
  /** Watch mode, held by the player. Nothing else can pause: a human is never kept waiting. */
  private paused = false;
  /**
   * Held because the front door is open. Kept apart from `paused` so the pause
   * button keeps telling the truth about what the *player* asked for: opening
   * the menu must not make it read "paused", and closing it must not undo a
   * pause the player set themselves.
   */
  private atMenu = false;
  /** Whether the coach card is kept up to date. */
  private coaching = false;
  /** An evaluation in flight; the engine takes one search at a time. */
  private analysis: Promise<void> | null = null;
  /** Incremented on every new game so a stale engine reply can be ignored. */
  private generation = 0;

  public constructor(private readonly deps: GameLoopDeps) {}

  public start(players: Players = HOT_SEAT): void {
    this.players = this.deps.ai === undefined ? HOT_SEAT : players;
    this.generation += 1;
    this.selected = null;
    this.busy = false;
    this.resignedBy = null;
    this.hint = null;
    this.paused = false;
    this.deps.view.showPosition(this.deps.engine.pieces());
    this.deps.bus.emit('game-started', { players: this.players });
    this.refreshCoaching();
    this.refreshHighlights();
    this.publishStatus();
    this.publishHistory();
    this.publishOutcome();
    void this.maybePlayAi();
    this.requestAssessment();
  }

  /** Resets the engine and starts again with the given seating. */
  public newGame(players: Players): void {
    this.deps.engine.reset();
    this.start(players);
  }

  /**
   * Replays a saved game into the engine and publishes it as if it had just
   * been played, but without animating: the board jumps to the final position.
   * A move that no longer applies stops the replay rather than aborting it, so
   * a save damaged in storage still yields the game up to that point.
   */
  public restore(saved: RestoredGame): void {
    const { engine, view, bus } = this.deps;
    engine.reset();
    this.players = this.deps.ai === undefined ? HOT_SEAT : saved.players;
    this.generation += 1;
    this.selected = null;
    this.busy = false;
    this.resignedBy = null;
    this.hint = null;
    this.paused = false;
    bus.emit('game-started', { players: this.players });

    for (const request of saved.moves) {
      let move: Move;
      try {
        move = engine.move(request);
      } catch (error: unknown) {
        if (!(error instanceof IllegalMoveError)) throw error;
        console.error(`Saved game stops at ${request.from}→${request.to}: ${error.reason}.`);
        break;
      }
      bus.emit('move-played', move);
    }

    this.resignedBy = saved.resignedBy;
    view.showPosition(engine.pieces());
    this.refreshCoaching();
    this.refreshHighlights();
    this.publishStatus();
    this.publishHistory();
    this.publishOutcome();
    void this.maybePlayAi();
    this.requestAssessment();
  }

  public isHumanTurn(): boolean {
    return this.players[this.deps.engine.turn] === 'human';
  }

  /** True when both seats are the computer and there is nothing to wait for. */
  public isWatching(): boolean {
    return this.players.white === 'ai' && this.players.black === 'ai';
  }

  /** What the player asked for. The menu's hold is deliberately not part of it. */
  public get isPaused(): boolean {
    return this.paused;
  }

  /**
   * Holds a game the computer is playing against itself. The reply being
   * searched when this is called is discarded rather than played, so the board
   * stops on the move you were looking at; setting it going again re-asks.
   */
  public setPaused(paused: boolean): void {
    if (paused === this.paused) return;
    this.paused = paused;
    this.deps.bus.emit('paused-changed', { paused });
    if (!this.isHeld()) void this.maybePlayAi();
  }

  /**
   * The menu is a modal front door, and nothing plays behind it. Without this
   * a watched game reloaded from a save started playing itself under the menu:
   * the board was already running before the player had chosen anything.
   */
  public setAtMenu(atMenu: boolean): void {
    if (atMenu === this.atMenu) return;
    this.atMenu = atMenu;
    if (!this.isHeld()) void this.maybePlayAi();
  }

  /** Null while the game is playable. */
  public get outcome(): GameOutcome | null {
    return outcomeOf(this.deps.engine.status, this.resignedBy);
  }

  public async handleSquareClick(square: Square): Promise<void> {
    if (this.busy || !this.isHumanTurn() || this.outcome !== null) return;
    const { engine } = this.deps;

    if (this.selected === null) {
      this.trySelect(square);
      return;
    }

    if (square === this.selected) {
      this.select(null);
      return;
    }

    const legal = engine.legalMoves(this.selected);
    if (legal.some((m) => m.to === square)) {
      await this.playMove({ from: this.selected, to: square });
      return;
    }

    // Castling: with the king selected, clicking the rook castles with it.
    // The king's own destination is two files away and looks like empty board,
    // so nobody finds it; the rook is the piece players reach for.
    const castle = legal.find((m) => m.castle !== null && m.castle.rookFrom === square);
    if (castle !== undefined) {
      await this.playMove({ from: this.selected, to: castle.to });
      return;
    }

    // Clicking another own piece re-selects; anything else clears.
    this.trySelect(square);
  }

  /**
   * True when there is something to take back. A checkmate or a draw can be
   * undone — that is what "take that back" means — but a resignation cannot:
   * it was a decision, not a mistake in a position.
   */
  public canUndo(): boolean {
    if (this.busy || this.resignedBy !== null) return false;
    if (this.deps.engine.history.length === 0) return false;
    return this.players.white === 'human' || this.players.black === 'human';
  }

  /**
   * Takes back plies until it is a human's turn again — one in hot-seat, two
   * against the computer — so undo always hands the board back to the player.
   */
  public undo(): boolean {
    if (!this.canUndo()) return false;
    const { engine, view, bus } = this.deps;

    const undone: Move[] = [];
    do {
      const move = engine.undo();
      if (move === null) break;
      undone.push(move);
    } while (!this.isHumanTurn() && engine.history.length > 0);
    if (undone.length === 0) return false;

    // Newest first, so a listener holding a stack pops in the order it pushed.
    for (const move of undone) bus.emit('move-undone', move);

    this.selected = null;
    this.hint = null;
    view.showPosition(engine.pieces());
    bus.emit('selection-changed', { square: null, targets: [] });
    this.refreshCoaching();
    this.refreshHighlights();
    this.publishStatus();
    this.publishHistory();
    // Only reachable when the human undid the opening move of an AI's game.
    void this.maybePlayAi();
    this.requestAssessment();
    return true;
  }

  /** True when advice can be asked for right now. */
  public canHint(): boolean {
    return (
      this.deps.ai?.hint !== undefined &&
      !this.busy &&
      this.isHumanTurn() &&
      this.outcome === null &&
      this.deps.engine.legalMoves().length > 0
    );
  }

  /**
   * Asks the engine what it would play here and shows it, without playing it.
   * Blocks clicks while it searches — the alternative is a suggestion arriving
   * for a position the player has already left.
   */
  public async requestHint(): Promise<Move | null> {
    const { engine, ai, bus } = this.deps;
    if (!this.canHint() || ai?.hint === undefined) return null;

    this.busy = true;
    bus.emit('hint-thinking', {});
    let suggestion: MoveRequest;
    try {
      suggestion = await ai.hint(engine.fen);
    } catch (error: unknown) {
      bus.emit('hint-failed', { error });
      return null;
    } finally {
      this.busy = false;
    }

    // The engine is trusted but verified here too: an illegal suggestion would
    // highlight two squares the player cannot act on.
    const move = engine.legalMoves(suggestion.from).find((m) => m.to === suggestion.to) ?? null;
    if (move === null) {
      bus.emit('hint-failed', {
        error: new Error(`Engine suggested illegal move ${suggestion.from}→${suggestion.to}`),
      });
      return null;
    }

    this.hint = move;
    this.refreshHighlights();
    // Explained here, where the engine can still be asked about the position
    // the move applies to; ui/ only renders the sentences.
    bus.emit('hint-offered', { move, advice: explainMove(engine, move) });
    return move;
  }

  /** Whether to keep the coach card — opening name, one tip — up to date. */
  public setCoaching(on: boolean): void {
    this.coaching = on;
    this.refreshCoaching();
  }

  /**
   * Recomputed wherever the position settles, but never cleared while
   * the computer thinks: advice for a position the player cannot move in is
   * wrong, and a card that empties itself every other move is a flicker.
   */
  private refreshCoaching(): void {
    const { engine, bus } = this.deps;
    if (!this.coaching || this.outcome !== null) {
      bus.emit('coaching-changed', { coaching: null });
      return;
    }
    if (!this.isHumanTurn()) return;
    bus.emit('coaching-changed', { coaching: coach(engine, engine.turn) });
  }

  /**
   * Turns the running assessment on or off. Off by default and off by nature:
   * it costs a search after every move, and a beginner does not need to be
   * told continuously how badly it is going.
   */
  public setAssessing(on: boolean): void {
    this.assessing = on;
    if (on) this.requestAssessment();
    else this.deps.bus.emit('assessment-changed', { assessment: null });
  }

  /**
   * Asked only when the engine is otherwise idle, and never when it is about
   * to be asked for a move: it takes one search at a time, and a collision
   * would make the opponent fall back to a random legal move.
   */
  private requestAssessment(): void {
    const { engine, ai, bus } = this.deps;
    if (!this.assessing || ai?.evaluate === undefined) return;
    if (this.busy || this.outcome !== null) return;
    // One at a time: the engine queues them anyway, and a backlog of stale
    // positions would only be discarded on arrival.
    if (this.analysis !== null) return;

    const generation = this.generation;
    const fen = engine.fen;
    const turn = engine.turn;
    this.analysis = ai
      .evaluate(fen)
      .then((score) => {
        // The board has moved on; a stale opinion is worse than none.
        if (generation !== this.generation || fen !== this.deps.engine.fen) return;
        bus.emit('assessment-changed', { assessment: score === null ? null : assess(score, turn) });
      })
      .catch((error: unknown) => {
        console.warn('Could not rate the position.', error);
      })
      .finally(() => {
        this.analysis = null;
      });
  }

  /** Ends the game as a loss for `color`. Ignored once the game is already over. */
  public resign(color: Color): boolean {
    if (this.outcome !== null) return false;
    this.resignedBy = color;
    this.selected = null;
    this.deps.view.clearHighlights();
    this.deps.bus.emit('selection-changed', { square: null, targets: [] });
    this.publishStatus();
    this.publishOutcome();
    return true;
  }

  private trySelect(square: Square): void {
    const piece = this.deps.engine.pieceAt(square);
    const ownPiece = piece !== null && piece.color === this.deps.engine.turn;
    this.select(ownPiece ? square : null);
  }

  private select(square: Square | null): void {
    this.selected = square;
    this.refreshHighlights();
    const targets = square === null ? [] : this.deps.engine.legalMoves(square).map((m) => m.to);
    this.deps.bus.emit('selection-changed', { square, targets });
    if (square !== null && targets.length === 0) this.explainBlocked(square);
  }

  /** Says why a selected piece cannot move, so a silent board is never the answer. */
  private explainBlocked(square: Square): void {
    const { engine, bus } = this.deps;
    const piece = engine.pieceAt(square);
    if (piece === null) return;
    const status = engine.status;
    const reason: BlockedReason =
      status.kind === 'playing' && status.inCheck
        ? 'in-check'
        : engine.isPinned(square)
          ? 'pinned'
          : 'no-moves';
    bus.emit('selection-blocked', { square, piece: piece.type, reason });
  }

  private async playMove(request: MoveRequest): Promise<void> {
    const { engine, promotion } = this.deps;

    let full: MoveRequest = request;
    if (engine.requiresPromotion(request.from, request.to)) {
      this.busy = true;
      const choice = await promotion.choose(engine.turn);
      this.busy = false;
      if (choice === null) return;
      full = { ...request, promotion: choice };
    }

    await this.commit(full);
  }

  /** Applies a fully specified request to the engine and the view, then hands over the turn. */
  private async commit(request: MoveRequest): Promise<boolean> {
    const { engine, view, bus } = this.deps;

    let move: Move;
    try {
      move = engine.move(request);
    } catch (error: unknown) {
      if (error instanceof IllegalMoveError) {
        bus.emit('move-refused', error);
        return false;
      }
      throw error;
    }

    this.busy = true;
    this.selected = null;
    this.hint = null;
    view.clearHighlights();
    try {
      await view.playMove(move);
    } finally {
      this.busy = false;
    }

    bus.emit('move-played', move);
    bus.emit('selection-changed', { square: null, targets: [] });
    this.refreshCoaching();
    this.refreshHighlights();
    this.publishStatus();
    this.publishHistory();
    this.publishOutcome();
    void this.maybePlayAi();
    this.requestAssessment();
    return true;
  }

  private async maybePlayAi(): Promise<void> {
    const { engine, ai, bus } = this.deps;
    if (ai === undefined || this.isHumanTurn() || this.outcome !== null) return;
    if (this.busy || this.isHeld()) return;

    const generation = this.generation;
    const color = engine.turn;
    this.busy = true;
    bus.emit('ai-thinking', { color });

    let request: MoveRequest;
    try {
      request = await ai.chooseMove(engine.fen);
    } catch (error: unknown) {
      request = this.fallbackMove();
      bus.emit('ai-error', { error, fallback: request });
    } finally {
      this.busy = false;
    }

    // A new game started, or the player resigned or took the move back, while
    // the engine was thinking: drop the stale reply. Asked through a method so
    // the answer is re-read rather than remembered from before the await.
    if (generation !== this.generation) return;
    // Paused while it was thinking: throw the reply away rather than play it,
    // so the board stops on the position the watcher was looking at. Asked
    // through a method so the answer is re-read rather than remembered from
    // before the await.
    if (this.isHeld()) return;
    if (!this.isPlayable() || this.isHumanTurn()) return;

    // The engine is trusted but verified; a bad reply must never break the game.
    if (!engine.isLegal(request)) {
      const fallback = this.fallbackMove();
      bus.emit('ai-error', {
        error: new Error(`Engine proposed illegal move ${request.from}→${request.to}`),
        fallback,
      });
      request = fallback;
    }
    await this.commit(request);
  }

  /** Any legal move, preferring captures so the fallback is not absurd. */
  private fallbackMove(): MoveRequest {
    const legal = this.deps.engine.legalMoves();
    const pick = legal.find((m) => m.captured !== null) ?? legal[0];
    if (pick === undefined) {
      throw new Error('fallbackMove called with no legal moves.');
    }
    return pick.promotion === null
      ? { from: pick.from, to: pick.to }
      : { from: pick.from, to: pick.to, promotion: pick.promotion };
  }

  private refreshHighlights(): void {
    const { engine, view } = this.deps;
    const status = engine.status;
    const inDanger = (status.kind === 'playing' && status.inCheck) || status.kind === 'checkmate';
    const check = inDanger ? this.kingSquare() : undefined;
    const hint = this.hint === null ? {} : { hint: [this.hint.from, this.hint.to] };
    // Taken from the history rather than remembered: an undo then rewrites it
    // for free, and there is no second copy to fall out of step.
    const played = engine.history[engine.history.length - 1];
    const last = played === undefined ? {} : { last: [played.from, played.to] };
    if (this.selected === null) {
      view.showHighlights({
        ...last,
        ...hint,
        ...(check === undefined ? {} : { check }),
      });
      return;
    }

    const legal = engine.legalMoves(this.selected);
    const rooks = legal.flatMap((m) => (m.castle === null ? [] : [m.castle.rookFrom]));
    view.showHighlights({
      ...last,
      ...hint,
      selected: this.selected,
      moves: [...legal.filter((m) => m.captured === null).map((m) => m.to), ...rooks],
      captures: legal.filter((m) => m.captured !== null).map((m) => m.to),
      ...(check === undefined ? {} : { check }),
    });
  }

  private kingSquare(): Square | undefined {
    const turn = this.deps.engine.turn;
    return this.deps.engine.pieces().find((p) => p.piece.type === 'king' && p.piece.color === turn)
      ?.square;
  }

  /** The game can end while the engine is thinking, so this is asked again after every await. */
  private isPlayable(): boolean {
    return this.outcome === null;
  }

  /**
   * As above: a watcher can press pause while the engine is mid-search — and
   * either kind of hold counts, the player's pause or the menu being open.
   */
  private isHeld(): boolean {
    return this.paused || this.atMenu;
  }

  private publishStatus(): void {
    const { engine, bus } = this.deps;
    bus.emit('status-changed', { status: engine.status, turn: engine.turn });
  }

  private publishHistory(): void {
    this.deps.bus.emit('history-changed', { moves: this.deps.engine.history });
  }

  private publishOutcome(): void {
    const outcome = this.outcome;
    if (outcome !== null) this.deps.bus.emit('game-over', { outcome });
  }
}
