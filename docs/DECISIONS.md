# MapChess — Decisions

A short record of every non-obvious choice. One entry per decision; newest at the bottom. Never delete an entry — if a decision is reversed, add a new entry that supersedes it.

---

## D-001 — Board area: 2 km per side

**Date:** 2026-09-02 · **Phase:** 0

**Decision:** The selected real-world square is 2000 m per side, fixed. Each of the 64 cells therefore averages ~250 m across before warping.

**Why:** 1 km is town-scale — a single village fills the board and hills are too subtle at 30 m elevation resolution. 3 km is landscape-scale — settlements collapse into single cells and rivers become thin. 2 km is the point where a river valley, a couple of named places and a ridge all fit and stay recognisable.

**Rejected:** a user-adjustable slider. It adds UI, and every layout constant (attraction radii, minimum cell area, vertical exaggeration) would need to scale with it. Revisit only if 2 km proves wrong in Phase 8 across the three fixture areas.

## D-002 — Art style: stylised low-poly

**Date:** 2026-09-02 · **Phase:** 0

**Decision:** Flat-shaded geometry, a restrained palette, no photographic textures.

**Why:** 30 m terrain data is coarse; a naturalistic look would expose that. Low-poly also keeps the board legible — BUILD_PLAN §8: when landscape and readability conflict, the board wins. It is also cheap to render, which matters once 64 terraced platforms, water and labels are on screen.

## D-003 — Desktop first, mobile later

**Date:** 2026-09-02 · **Phase:** 0

**Decision:** Build for mouse and keyboard. Use pointer events (not mouse events) and avoid hover-only affordances so a touch pass in Phase 12 is cheap, but do not test on mobile before then.

## D-004 — Repository lives at the workspace root

**Date:** 2026-09-02 · **Phase:** 0

**Decision:** BUILD_PLAN §4 draws a `mapchess/` root folder. The workspace folder `MapChess/` _is_ that root; there is no nested project folder.

## D-005 — Toolchain versions and lint enforcement of layering

**Date:** 2026-09-02 · **Phase:** 0

**Decision:** TypeScript 6 (`strict` plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), Vite 8, Vitest 4, three.js r185, chess.js 1.4, ESLint 10 flat config with typescript-eslint `strictTypeChecked`.

The rule "`domain/` never imports three.js and never touches the DOM" is enforced by ESLint (`no-restricted-imports` and `no-restricted-globals` scoped to `src/domain/**`), not by convention.

**Why:** the layering rule is what keeps the chess game headless-testable, and it will be tested most in Phase 8 when board geometry and rendering are being built side by side. A lint error is cheaper than discovering the leak later.

## D-006 — Path aliases per layer

**Date:** 2026-09-02 · **Phase:** 0

**Decision:** `@app/*`, `@domain/*`, `@mapdata/*`, `@world/*`, `@game/*`, `@ai/*`, `@ui/*`, `@shared/*`, declared in both `tsconfig.json` and `vite.config.ts`.

**Why:** an import line that reads `from '@world/scene/Camera'` states which layer it crosses into. That makes the lint layering rules simple to write, and makes a `domain/` file importing `@world/` visibly wrong in review.

## D-007 — Board orientation convention

**Date:** 2026-09-02 · **Phase:** 0 (implemented in Phase 5)

**Decision:** Recorded now so it is never re-derived: **the south edge of the selected area is White's back rank, and file a is west.** After the area's rotation is applied, "south" means the edge of the rotated square that faces the player when the picker's arrow points up.

Coordinate mapping (three.js is Y-up): longitude → +X (east), latitude → −Z (north), elevation → +Y. Converted once in `mapdata/model/`; every layer above it works in local metres, Y-up.

**Why:** piece placement, default camera, and move-animation direction all read this one rule. Stating it before any of them exist prevents three slightly different interpretations.
