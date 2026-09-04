// WHAT: What a game looks like once it is written down, and how to recognise
//       one coming back.
// HOW:  A plain record — the area, the seating, the difficulty, the moves as
//       from/to/promotion requests, and who resigned — plus a runtime guard
//       that validates every field. Moves are stored as requests rather than a
//       FEN so a resumed game keeps its move list, its repetition history and
//       its undo stack.
// WHY:  BUILD_PLAN Phase 11 — "the saved game must include the selected area so
//       a resumed game rebuilds the same board". The area is four numbers; the
//       board, the terrain and all 64 names are rebuilt from them, so nothing
//       derived is ever saved and no save can disagree with itself.

import { DIFFICULTIES } from '@ai/IChessAI';
import type { Difficulty } from '@ai/IChessAI';
import { ALL_SQUARES } from '@domain/board/Square';
import type { Square } from '@domain/board/Square';
import type { Color, Move, MoveRequest, PromotionPiece } from '@domain/chess/types';
import type { SelectedArea } from '@mapdata/model/SelectedArea';

import type { Players } from './GameLoop';

/** Bumped whenever the shape changes; older saves are then quietly discarded. */
export const SAVE_VERSION = 1;

export interface SavedGame {
  readonly version: number;
  /** ISO timestamp, for telling the player how old the save is. */
  readonly savedAt: string;
  readonly area: SelectedArea;
  readonly players: Players;
  readonly difficulty: Difficulty;
  readonly moves: readonly MoveRequest[];
  readonly resignedBy: Color | null;
}

/** Drops the fields a Move carries for the renderer; only the request is saved. */
export function toSavedMoves(moves: readonly Move[]): readonly MoveRequest[] {
  return moves.map((m) =>
    m.promotion === null
      ? { from: m.from, to: m.to }
      : { from: m.from, to: m.to, promotion: m.promotion },
  );
}

export function isSavedGame(value: unknown): value is SavedGame {
  if (!isRecord(value)) return false;
  if (value.version !== SAVE_VERSION) return false;
  if (typeof value.savedAt !== 'string') return false;
  if (!isArea(value.area)) return false;
  if (!isPlayers(value.players)) return false;
  if (!isDifficulty(value.difficulty)) return false;
  if (!Array.isArray(value.moves) || !value.moves.every(isMoveRequest)) return false;
  return value.resignedBy === null || isColor(value.resignedBy);
}

const PROMOTIONS: readonly PromotionPiece[] = ['knight', 'bishop', 'rook', 'queen'];
const SQUARES: ReadonlySet<string> = new Set<string>(ALL_SQUARES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isColor(value: unknown): value is Color {
  return value === 'white' || value === 'black';
}

function isSquare(value: unknown): value is Square {
  return typeof value === 'string' && SQUARES.has(value);
}

function isDifficulty(value: unknown): value is Difficulty {
  return DIFFICULTIES.some((d) => d === value);
}

function isArea(value: unknown): value is SelectedArea {
  return (
    isRecord(value) &&
    isNumber(value.centerLat) &&
    isNumber(value.centerLon) &&
    isNumber(value.sizeMeters) &&
    value.sizeMeters > 0 &&
    isNumber(value.rotationDeg)
  );
}

function isPlayers(value: unknown): value is Players {
  return isRecord(value) && isSeat(value.white) && isSeat(value.black);
}

function isSeat(value: unknown): boolean {
  return value === 'human' || value === 'ai';
}

function isMoveRequest(value: unknown): value is MoveRequest {
  if (!isRecord(value) || !isSquare(value.from) || !isSquare(value.to)) return false;
  return value.promotion === undefined || PROMOTIONS.some((p) => p === value.promotion);
}
