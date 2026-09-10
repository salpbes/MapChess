# `src/ui/` — DOM overlay

**Belongs here:** everything rendered into `#ui` in `index.html`. Present: `MainMenu` (resume, side, difficulty, area), the MapLibre `AreaPicker` behind `AreaBar`, `StatusBar`, `IdentityCard`, `RecordPanel` (with `CapturedRow` and `MoveList`), `GameControls` (menu, take back, resign), `GameOverScreen`, `PromotionPrompt`, and `DataStatus` — the loading and failure state for every network call. Still to come: the OSM/terrain attribution (Phase 12).

Also here: `Sounds.ts`, which is not rendered into `#ui` but belongs to the
same layer — presentation driven by the event bus, synthesised through WebAudio
so there is nothing to download.

**Does not belong here:** three.js. The UI talks to the rest of the app through the event bus in `shared/`, never by touching the scene.

**Built in:** Phase 3 (status bar), Phase 5 (area picker), Phase 10 (identity card), Phase 11 (game shell), Phase 12 (attribution).
