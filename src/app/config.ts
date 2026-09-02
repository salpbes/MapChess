// WHAT: Project-wide constants decided in Phase 0 (see docs/DECISIONS.md).
// HOW:  A single frozen object, imported by app/ wiring and passed down via
//       constructor injection. Nothing else should import this directly.
// WHY:  The decisions in DECISIONS.md need one place in code where they become
//       numbers. Scattering "2000" through the codebase is how a decision
//       silently gets un-made.

export const APP_CONFIG = Object.freeze({
  version: '0.0.1',

  /** Real-world side length of the selected map area. Decision D-001. */
  boardSizeMeters: 2000,

  /** Number of cells per side of the chessboard. Never anything but 8. */
  filesAndRanks: 8,

  /** Visual direction: stylised low-poly. Decision D-002. */
  artStyle: 'low-poly' as const,
});

export type AppConfig = typeof APP_CONFIG;
