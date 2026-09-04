// WHAT: IChessEngine implemented on top of chess.js.
// HOW:  Owns one chess.js instance. Validates every MoveRequest against the
//       legal-move list *before* handing it to chess.js, so failures come back
//       as a typed IllegalMoveError with a reason instead of a generic throw.
//       Keeps its own domain-typed history so callers never see chess.js Moves.
// WHY:  chess.js is excellent at rules and terse in its API. This wrapper adds
//       the vocabulary and error reporting the rest of MapChess wants, and is
//       the single place chess.js is instantiated.

import { Chess } from 'chess.js';

import { ALL_SQUARES } from '@domain/board/Square';
import type { Square } from '@domain/board/Square';

import { toColor, toMove, toPieceSymbol, toPieceType } from './chessJsAdapter';
import { IllegalMoveError, InvalidPositionError } from './errors';
import type { IChessEngine } from './IChessEngine';
import type { Color, GameStatus, Move, MoveRequest, Piece, PlacedPiece } from './types';

export class ChessEngine implements IChessEngine {
  private chess: Chess;
  private played: Move[] = [];

  public constructor(fen?: string) {
    this.chess = new Chess();
    if (fen !== undefined) {
      this.load(fen);
    }
  }

  public get turn(): Color {
    return toColor(this.chess.turn());
  }

  public get fen(): string {
    return this.chess.fen();
  }

  public get history(): readonly Move[] {
    return this.played;
  }

  public get status(): GameStatus {
    if (this.chess.isCheckmate()) {
      // The side to move is mated; the other side won.
      return { kind: 'checkmate', winner: this.turn === 'white' ? 'black' : 'white' };
    }
    if (this.chess.isStalemate()) return { kind: 'draw', reason: 'stalemate' };
    if (this.chess.isInsufficientMaterial())
      return { kind: 'draw', reason: 'insufficient-material' };
    if (this.chess.isThreefoldRepetition()) return { kind: 'draw', reason: 'threefold-repetition' };
    if (this.chess.isDrawByFiftyMoves()) return { kind: 'draw', reason: 'fifty-moves' };
    return { kind: 'playing', inCheck: this.chess.isCheck() };
  }

  public pieceAt(square: Square): Piece | null {
    const p = this.chess.get(square);
    return p === undefined ? null : { type: toPieceType(p.type), color: toColor(p.color) };
  }

  public pieces(): readonly PlacedPiece[] {
    const out: PlacedPiece[] = [];
    for (const square of ALL_SQUARES) {
      const piece = this.pieceAt(square);
      if (piece !== null) out.push({ square, piece });
    }
    return out;
  }

  public legalMoves(from?: Square): readonly Move[] {
    const raw =
      from === undefined
        ? this.chess.moves({ verbose: true })
        : this.chess.moves({ square: from, verbose: true });
    return raw.map(toMove);
  }

  public requiresPromotion(from: Square, to: Square): boolean {
    return this.legalMoves(from).some((m) => m.to === to && m.promotion !== null);
  }

  public isLegal(request: MoveRequest): boolean {
    return this.findLegal(request) !== null;
  }

  public isPinned(square: Square): boolean {
    const piece = this.chess.get(square);
    // A king is never pinned: nothing stands behind it to be exposed.
    if (piece === undefined || piece.type === 'k') return false;

    // The definition of an absolute pin, asked directly: lift the piece off
    // and see whether its king is suddenly under attack. Done on a copy, so
    // the real position is never momentarily illegal.
    const probe = new Chess(this.chess.fen());
    probe.remove(square);
    const king = probe
      .board()
      .flat()
      .find((p) => p !== null && p.type === 'k' && p.color === piece.color);
    if (king === undefined || king === null) return false;
    return probe.isAttacked(king.square, piece.color === 'w' ? 'b' : 'w');
  }

  public isAttacked(square: Square, byColor: Color): boolean {
    return this.chess.isAttacked(square, byColor === 'white' ? 'w' : 'b');
  }

  public move(request: MoveRequest): Move {
    const legal = this.findLegal(request);
    if (legal === null) {
      throw new IllegalMoveError(request, this.explainIllegal(request));
    }
    const played = this.chess.move({
      from: request.from,
      to: request.to,
      ...(request.promotion === undefined ? {} : { promotion: toPieceSymbol(request.promotion) }),
    });
    const move = toMove(played);
    this.played.push(move);
    return move;
  }

  public undo(): Move | null {
    const undone = this.chess.undo();
    if (undone === null) return null;
    return this.played.pop() ?? toMove(undone);
  }

  public reset(): void {
    this.chess.reset();
    this.played = [];
  }

  public load(fen: string): void {
    const candidate = new Chess();
    try {
      candidate.load(fen);
    } catch (error: unknown) {
      throw new InvalidPositionError(fen, error instanceof Error ? error.message : String(error));
    }
    this.chess = candidate;
    this.played = [];
  }

  private findLegal(request: MoveRequest): Move | null {
    const wanted = request.promotion ?? null;
    return (
      this.legalMoves(request.from).find((m) => m.to === request.to && m.promotion === wanted) ??
      null
    );
  }

  private explainIllegal(request: MoveRequest): IllegalMoveError['reason'] {
    if (this.status.kind !== 'playing') return 'game-over';
    const piece = this.pieceAt(request.from);
    if (piece === null) return 'no-piece-on-from-square';
    if (piece.color !== this.turn) return 'not-your-turn';
    const toSquare = this.legalMoves(request.from).filter((m) => m.to === request.to);
    if (toSquare.length === 0) return 'not-a-legal-destination';
    const promotes = toSquare.some((m) => m.promotion !== null);
    if (promotes && request.promotion === undefined) return 'promotion-required';
    return 'promotion-not-allowed';
  }
}
