// WHAT: Difficulty names → Stockfish UCI settings.
// HOW:  Each level pins a Skill Level (0–20, the engine's own handicap that
//       deliberately picks weaker moves) and a fixed think time. Strong also
//       raises the hash a little; the lite build's default 16 MB is fine below.
// WHY:  BUILD_PLAN Phase 4: "difficulty via skill level and think time —
//       roughly beginner / club / strong". Keeping the numbers in one table
//       makes tuning them a one-line change after playtesting.

import type { Difficulty } from './IChessAI';

export interface EngineSettings {
  /** UCI "Skill Level", 0 (weakest) to 20 (full strength). */
  readonly skillLevel: number;
  /** Fixed search time per move, in milliseconds. */
  readonly moveTimeMs: number;
  /** UCI "Hash" in MB. */
  readonly hashMb: number;
}

export const DIFFICULTY_SETTINGS: Readonly<Record<Difficulty, EngineSettings>> = {
  beginner: { skillLevel: 1, moveTimeMs: 300, hashMb: 16 },
  club: { skillLevel: 8, moveTimeMs: 800, hashMb: 16 },
  strong: { skillLevel: 20, moveTimeMs: 1500, hashMb: 32 },
};
