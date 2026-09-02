// WHAT: The turn loop — turns square clicks (or engine replies) into chess
//       moves and keeps the board view and the event bus informed.
// HOW:  A small state machine: nothing selected → a piece selected → (maybe
//       a promotion prompt) → animating → back to nothing selected. Every rule
//       question goes to IChessEngine; every visual goes to IBoardView. When
//       the side to move is assigned to the AI, the loop asks IChessAI instead
//       of waiting for clicks. Clicks are ignored while busy or on AI turns.
// WHY:  This is the only place where input, rules, rendering and the opponent
//       meet, and it depends on interfaces for all four so it can run without
//       a browser. Phase 11 adds undo/resign here.

import type { IChessAI } from '@ai/IChessAI';
import type { Square } from '@domain/board/Square';
import { IllegalMoveError } from '@domain/chess/errors';
import type { IChessEngine } from '@domain/chess/IChessEngine';
import type { Color, Move, MoveRequest } from '@domain/chess/types';

import type { GameBus } from './GameEvents';
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

export class GameLoop {
  private selected: Square | null = null;
  private busy = false;
  private players: Players = HOT_SEAT;
  /** Incremented on every new game so a stale engine reply can be ignored. */
  private generation = 0;

  public constructor(private readonly deps: GameLoopDeps) {}

  public start(players: Players = HOT_SEAT): void {
    this.players = this.deps.ai === undefined ? HOT_SEAT : players;
    this.generation += 1;
    this.selected = null;
    this.busy = false;
    this.deps.view.showPosition(this.deps.engine.pieces());
    this.refreshHighlights();
    this.publishStatus();
    void this.maybePlayAi();
  }

  /** Resets the engine and starts again with the given seating. */
  public newGame(players: Players): void {
    this.deps.engine.reset();
    this.start(players);
  }

  public isHumanTurn(): boolean {
    return this.players[this.deps.engine.turn] === 'human';
  }

  public async handleSquareClick(square: Square): Promise<void> {
    if (this.busy || !this.isHumanTurn()) return;
    const { engine } = this.deps;
    if (engine.status.kind !== 'playing') return;

    if (this.selected === null) {
      this.trySelect(square);
      return;
    }

    if (square === this.selected) {
      this.select(null);
      return;
    }

    const targets = engine.legalMoves(this.selected);
    if (targets.some((m) => m.to === square)) {
      await this.playMove({ from: this.selected, to: square });
      return;
    }

    // Clicking another own piece re-selects; anything else clears.
    this.trySelect(square);
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
    view.clearHighlights();
    try {
      await view.playMove(move);
    } finally {
      this.busy = false;
    }

    bus.emit('move-played', move);
    bus.emit('selection-changed', { square: null, targets: [] });
    this.refreshHighlights();
    this.publishStatus();
    void this.maybePlayAi();
    return true;
  }

  private async maybePlayAi(): Promise<void> {
    const { engine, ai, bus } = this.deps;
    if (ai === undefined || this.isHumanTurn() || engine.status.kind !== 'playing') return;
    if (this.busy) return;

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

    // A new game started while the engine was thinking: drop the stale reply.
    if (generation !== this.generation) return;

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

    if (this.selected === null) {
      view.showHighlights(check === undefined ? {} : { check });
      return;
    }

    const legal = engine.legalMoves(this.selected);
    view.showHighlights({
      selected: this.selected,
      moves: legal.filter((m) => m.captured === null).map((m) => m.to),
      captures: legal.filter((m) => m.captured !== null).map((m) => m.to),
      ...(check === undefined ? {} : { check }),
    });
  }

  private kingSquare(): Square | undefined {
    const turn = this.deps.engine.turn;
    return this.deps.engine.pieces().find((p) => p.piece.type === 'king' && p.piece.color === turn)
      ?.square;
  }

  private publishStatus(): void {
    const { engine, bus } = this.deps;
    bus.emit('status-changed', { status: engine.status, turn: engine.turn });
  }
}
