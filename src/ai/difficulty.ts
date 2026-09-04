// WHAT: Difficulty names → Stockfish UCI settings.
// HOW:  Five levels. Each pins a way of weakening the engine and a way of
//       limiting its search, plus the shortest time it is allowed to appear to
//       think. Two mechanisms are used, because one is not enough:
//         · `skill`  — UCI "Skill Level" 0–20, the engine's own handicap.
//         · `elo`    — UCI_LimitStrength + UCI_Elo, which aims at a rating.
//       and the search is limited either by time or by depth in plies.
// WHY:  BUILD_PLAN Phase 4 asked for "skill level and think time", and that is
//       what this was. It turned out not to reach a real beginner: Stockfish at
//       Skill Level 1 with 300 ms is still searching many plies deep, and Skill
//       Level mostly shuffles the order of moves that are all good. The two
//       weakest levels now cap the *depth* instead, which is the only knob that
//       makes the engine genuinely miss things — at depth 1 it will take a free
//       piece but not notice that its own move gives one away. UCI_Elo's floor
//       is 1320, a decent club player, so it cannot be the bottom of the range.

import type { Difficulty } from './IChessAI';

/** How the engine is held back. Skill Level and UCI_Elo are mutually exclusive. */
export type Strength =
  | { readonly kind: 'skill'; readonly level: number }
  | { readonly kind: 'elo'; readonly rating: number };

/** How long the engine may look. Depth is what makes a weak opponent weak. */
export type SearchLimit =
  | { readonly kind: 'movetime'; readonly ms: number }
  | { readonly kind: 'depth'; readonly plies: number };

export interface EngineSettings {
  readonly strength: Strength;
  readonly search: SearchLimit;
  /**
   * A depth-limited search returns almost instantly, which reads as a bug
   * rather than as an easy opponent. The reply is held back to at least this
   * long so the weak levels still feel like someone taking a turn.
   */
  readonly minThinkMs: number;
  /** Upper bound on one search, for the watchdog that gives up on the engine. */
  readonly budgetMs: number;
  /** UCI "Hash" in MB. */
  readonly hashMb: number;
}

export const DIFFICULTY_SETTINGS: Readonly<Record<Difficulty, EngineSettings>> = {
  // Sees one move ahead (plus captures). Hangs pieces, and misses yours.
  learner: {
    strength: { kind: 'skill', level: 0 },
    search: { kind: 'depth', plies: 1 },
    minThinkMs: 450,
    budgetMs: 2000,
    hashMb: 16,
  },
  // Sees an exchange coming, not a plan.
  beginner: {
    strength: { kind: 'skill', level: 0 },
    search: { kind: 'depth', plies: 3 },
    minThinkMs: 450,
    budgetMs: 3000,
    hashMb: 16,
  },
  // The lowest rating Stockfish will aim at.
  casual: {
    strength: { kind: 'elo', rating: 1320 },
    search: { kind: 'movetime', ms: 500 },
    minThinkMs: 300,
    budgetMs: 500,
    hashMb: 16,
  },
  club: {
    strength: { kind: 'elo', rating: 1800 },
    search: { kind: 'movetime', ms: 800 },
    minThinkMs: 300,
    budgetMs: 800,
    hashMb: 16,
  },
  strong: {
    strength: { kind: 'skill', level: 20 },
    search: { kind: 'movetime', ms: 1500 },
    minThinkMs: 0,
    budgetMs: 1500,
    hashMb: 32,
  },
};

/**
 * What the engine is asked when the player wants a hint. Deliberately unrelated
 * to the level being played: a Learner opponent searching one ply would suggest
 * the same blunder it would play.
 */
export const ADVICE_SETTINGS: EngineSettings = {
  strength: { kind: 'skill', level: 20 },
  search: { kind: 'movetime', ms: 600 },
  minThinkMs: 0,
  budgetMs: 600,
  hashMb: 16,
};

/** The `go` line that starts a search at this level. */
export function goCommand(settings: EngineSettings): string {
  return settings.search.kind === 'movetime'
    ? `go movetime ${String(settings.search.ms)}`
    : `go depth ${String(settings.search.plies)}`;
}

/**
 * The `setoption` lines for this level, skipping any the engine did not
 * advertise. Builds differ in what they expose, and an unknown option is
 * ignored silently by UCI — which would leave a level quietly not applied.
 */
export function optionCommands(
  settings: EngineSettings,
  supported: ReadonlySet<string>,
): readonly string[] {
  const out: string[] = [];
  const push = (name: string, value: string | number | boolean): void => {
    if (supported.size === 0 || supported.has(name)) {
      out.push(`setoption name ${name} value ${String(value)}`);
    }
  };

  if (settings.strength.kind === 'elo') {
    push('UCI_LimitStrength', true);
    push('UCI_Elo', settings.strength.rating);
  } else {
    // Must be turned off explicitly: it persists from a previous level.
    push('UCI_LimitStrength', false);
    push('Skill Level', settings.strength.level);
  }
  push('Hash', settings.hashMb);
  return out;
}
