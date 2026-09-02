// WHAT: The turn loop — turns square clicks into chess moves and keeps the
//       board view and the event bus informed.
// HOW:  A small state machine: nothing selected → a piece selected → (maybe
//       a promotion prompt) → animating → back to nothing selected. Every rule
//       question goes to IChessEngine; every visual goes to IBoardView.
//       While a move animates, clicks are ignored.
// WHY:  This is the only place where input, rules and rendering meet, and it
//       depends on interfaces for all three so it can run without a browser.
//       Phase 4 adds an AI player here; Phase 11 adds undo/resign here.

import type { Square } from '@domain/board/Square';
import { IllegalMoveError } from '@domain/chess/errors';
import type { IChessEngine } from '@domain/chess/IChessEngine';
import type { Move, MoveRequest } from '@domain/chess/types';

import type { GameBus } from './GameEvents';
import type { IBoardView } from './IBoardView';
import type { IPromotionChooser } from './IPromotionChooser';

export interface GameLoopDeps {
  readonly engine: IChessEngine;
  readonly view: IBoardView;
  readonly promotion: IPromotionChooser;
  readonly bus: GameBus;
}

export class GameLoop {
  private selected: Square | null = null;
  private busy = false;

  public constructor(private readonly deps: GameLoopDeps) {}

  public start(): void {
    this.deps.view.showPosition(this.deps.engine.pieces());
    this.selected = null;
    this.refreshHighlights();
    this.publishStatus();
  }

  public async handleSquareClick(square: Square): Promise<void> {
    if (this.busy) return;
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
    const { engine, view, promotion, bus } = this.deps;

    let full: MoveRequest = request;
    if (engine.requiresPromotion(request.from, request.to)) {
      this.busy = true;
      const choice = await promotion.choose(engine.turn);
      this.busy = false;
      if (choice === null) return;
      full = { ...request, promotion: choice };
    }

    let move: Move;
    try {
      move = engine.move(full);
    } catch (error: unknown) {
      if (error instanceof IllegalMoveError) {
        bus.emit('move-refused', error);
        return;
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
