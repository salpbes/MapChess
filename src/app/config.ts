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

  /** Single-threaded Stockfish glue; its .wasm sits beside it. Copied by scripts/copy-engine.mjs (D-017). */
  engineUrl: `${import.meta.env.BASE_URL}engine/stockfish-18-lite-single.js`,

  /** Default seating until Phase 11's menu exists. */
  defaultHumanColor: 'white' as const,
  defaultDifficulty: 'club' as const,

  /** Free vector basemap for the 2D picker, no API key (D-019). */
  mapStyleUrl: 'https://tiles.openfreemap.org/styles/liberty',

  /** Where the picker opens before the player chooses: Holy Island of Lindisfarne. */
  defaultArea: {
    centerLat: 55.6785,
    centerLon: -1.7937,
    sizeMeters: 2000,
    rotationDeg: 0,
  },
});

export type AppConfig = typeof APP_CONFIG;
