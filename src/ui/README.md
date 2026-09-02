# `src/ui/` — DOM overlay

**Belongs here:** everything rendered into `#ui` in `index.html`: main menu, new-game dialog (side, difficulty), the MapLibre area picker, HUD, algebraic move list, captured pieces, undo/resign, game-over screen, loading and error states for every network call, and the OSM/terrain attribution.

**Does not belong here:** three.js. The UI talks to the rest of the app through the event bus in `shared/`, never by touching the scene.

**Built in:** Phase 5 (area picker), Phase 11 (game shell), Phase 12 (attribution).
