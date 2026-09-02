# MapChess — Progress

One report per completed phase, appended in order. Template in `BUILD_PLAN.md` §7.

---

## Phase 0 — Decisions & scaffolding

**Date:** 2026-09-02
**Project completion: 4%**

### In plain English

Nothing is playable yet. The project now has a foundation: the tooling that builds, checks and tests the code is installed and proven to work, and the folder layout for the whole game exists with a note in every folder saying what goes there. The three open questions (board size, look, devices) are answered and written down.

### What I built

- `package.json` — scripts: `dev`, `build`, `test`, `lint`, `format`, `typecheck`.
- `tsconfig.json` — TypeScript 6, `strict` plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`; per-layer path aliases (`@domain/*`, `@world/*`, …).
- `vite.config.ts` — Vite 8 + Vitest 4 in one file; the same aliases so tests and browser resolve imports identically.
- `eslint.config.js` — typescript-eslint strict type-checked preset, plus a `src/domain/**` block that _forbids_ importing three.js or touching `window`/`document`/`fetch`/storage.
- `.prettierrc`, `.prettierignore`, `.gitignore`.
- `index.html`, `src/app/main.ts`, `src/app/config.ts`, `src/app/styles.css` — entry point, the Phase 0 decisions as frozen constants, full-viewport layout with `#world` (canvas) and `#ui` (overlay) as siblings.
- `src/**/README.md` × 17, `tests/README.md`, `public/models/README.md` — what belongs in each folder, what does not, and which phase fills it.
- `tests/toolchain.test.ts` — smoke test proving Vitest runs and resolves aliases.
- `docs/DECISIONS.md` — D-001 to D-007.
- `README.md` — project summary and run instructions.
- Git repository initialised; one commit.

### Why it was done this way

- **Layering enforced by lint, not convention.** The plan's core rule is that `domain/` stays headless. Phase 8 will have geometry and rendering being written side by side, which is exactly when that rule gets broken by accident. ESLint now fails the build on `import ... from 'three'` inside `domain/`.
- **Path aliases per layer** rather than relative paths. `from '@world/...'` inside a domain file is visibly wrong at a glance, and it makes the lint rule a one-liner.
- **`console.info` allowed, `console.log` not.** Until the `shared/` logger exists in Phase 1, this keeps stray debug logging out without banning deliberate messages.
- **Board orientation convention recorded now (D-007)** although it is implemented in Phase 5, because piece placement, camera default and move animation all depend on it and I do not want three interpretations.
- **Rejected:** a nested `mapchess/` folder (the workspace root is the repo); a user-adjustable area size (every layout constant would need to scale with it).

### How to check it yourself

1. `npm install`
2. `npm run dev` — open the URL shown. You should see a dark blank page. The console shows one line: `MapChess 0.0.1 — Phase 0 scaffold. Board area 2000 m.` and no errors.
3. `npm run test` — 1 file, 2 tests pass.
4. `npm run lint` and `npm run typecheck` — both exit silently.
5. Open any folder under `src/` — its `README.md` tells you what belongs there.

### What's left

Phase 1 — Scene skeleton and flat board: renderer, camera, orbit controls, lights, resize, animation loop; `IBoardLayout` interface and `FlatBoardLayout`; `CellBuilder` that renders arbitrary polygons. Unlocks: something to look at, and the seam (`IBoardLayout`) that the entire map side of the project plugs into later.

### Risks / things I'm unsure about

- **TypeScript 6 is very new.** It deprecated `baseUrl` (already handled) and other tooling may lag. If typescript-eslint or Vite misbehave on TS 6, pinning to TS 5.9 is a one-line change with no code impact.
- **Vitest 4 / Vite 8 / ESLint 10** are likewise all current-major. Nothing broke today, but I have not exercised them beyond a smoke test.
- **`docs/warped-lattice-prototype.html`** exists in the repo from before Phase 0. I have not read it or built on it. It may be useful reference for Phase 8; it is excluded from lint and formatting so it does not affect the toolchain.
- **No `.nvmrc`/engines field.** Developed on Node 24. If you switch machines, add one.
