# `src/app/` — bootstrap and wiring

**Belongs here:** the entry point (`main.ts`), project constants (`config.ts`), global CSS, and the composition root that constructs every service and injects it into the next (`new GameLoop(rules, renderer, ai)`).

**Does not belong here:** any behaviour. If a file in `app/` has an `if`, ask whether it should be a module somewhere else.

**Rule:** `app/` is the only layer allowed to import from every other layer. It is also where `FlatBoardLayout` gets swapped for `WarpedBoardLayout` in Phase 8 — nothing outside this folder should need to change for that swap.
