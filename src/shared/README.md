# `src/shared/` — cross-cutting utilities

**Belongs here:** things every layer may import and none owns: the typed event bus, the logger, small maths helpers (vectors in plain objects, lerp, clamp), and shared primitive types.

**Rules:**

- No three.js. `domain/` imports from here, so this folder inherits its purity rule.
- No business logic. If a helper knows what a "rook" or a "river" is, it belongs in `domain/` or `mapdata/`.

**Built in:** Phase 1 onward, as needed.
