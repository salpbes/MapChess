# `src/world/scene/` — the stage

**Belongs here:** `WebGLRenderer` setup, the perspective camera and its default framing (derived from the board-orientation rule: White's back rank nearest the camera), lights, `OrbitControls`, window-resize handling, and the `requestAnimationFrame` loop.

**Does not belong here:** any object that represents game state. The scene is an empty stage; `builders/` and `pieces/` populate it.

**Built in:** Phase 1.
