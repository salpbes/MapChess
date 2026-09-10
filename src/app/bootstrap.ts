// WHAT: The composition root — builds every service and wires them together.
// HOW:  Creates the stage from the flat board's bounds, builds the piece and
//       highlight layers, spins up the Stockfish worker, connects pointer
//       clicks → BoardPicker → GameLoop, and routes the selected area's
//       heights and features into BoardComposer, whose layout BoardScene
//       shows. The Phase 11 shell — menu, controls, record, game-over screen
//       and autosave — hangs off the same bus. Returns a handle so main.ts can
//       tear it all down on hot reload.
// WHY:  This is the one place where "which layout", "which piece factory",
//       "which engine", "which opponent" and "where saves live" are decided.
//       Phase 8's layout swap lives in BoardComposer; nothing in world/ or
//       game/ changed for it.

import { StockfishAI } from '@ai/StockfishAI';
import { FlatBoardLayout } from '@domain/board/FlatBoardLayout';
import type { IBoardLayout } from '@domain/board/IBoardLayout';
import { ChessEngine } from '@domain/chess/ChessEngine';
import type { GameEvents } from '@game/GameEvents';
import { GameLoop } from '@game/GameLoop';
import type { Players } from '@game/GameLoop';
import { SaveManager } from '@game/SaveManager';
import type { SaveContext } from '@game/SaveManager';
import { isSavedGame } from '@game/SavedGame';
import type { SavedGame } from '@game/SavedGame';
import { ThemeTracker } from '@game/ThemeTracker';
import { IndexedDbStore, STORES } from '@mapdata/cache/KeyValueStore';
import { ElevationLoader } from '@mapdata/elevation/ElevationLoader';
import type { IElevationView } from '@mapdata/elevation/ElevationLoader';
import { fixtureEntries } from '@mapdata/elevation/fixtureAreas';
import { FixtureElevationProvider } from '@mapdata/elevation/FixtureElevationProvider';
import { TerrariumElevationProvider } from '@mapdata/elevation/TerrariumElevationProvider';
import { FeatureLoader } from '@mapdata/features/FeatureLoader';
import type { IFeaturesView } from '@mapdata/features/FeatureLoader';
import {
  featureFixtureEntries,
  FixtureFeatureProvider,
} from '@mapdata/features/FixtureFeatureProvider';
import {
  isCachedFeatures,
  OverpassFeatureProvider,
} from '@mapdata/features/OverpassFeatureProvider';
import type { CachedFeatures } from '@mapdata/features/OverpassFeatureProvider';
import { buildBriefing } from '@mapdata/board/buildBriefing';
import type { BriefingInputs } from '@mapdata/board/buildBriefing';
import { WikidataProvider } from '@mapdata/history/WikidataProvider';
import type { HistoryFact } from '@mapdata/history/historyFacts';
import { primaryPlaceName } from '@mapdata/features/primaryPlace';
import { NominatimGeocoder } from '@mapdata/geocode/NominatimGeocoder';
import type { HeightField } from '@mapdata/model/HeightField';
import { FIXTURE_AREAS } from '@mapdata/model/fixtureAreas';
import type { MapFeature } from '@mapdata/model/MapFeature';
import type { SelectedArea } from '@mapdata/model/SelectedArea';
import { browserBase64 } from '@shared/encoding/base64';
import { EventBus } from '@shared/events/EventBus';
import { LocalJsonStore } from '@shared/storage/LocalJsonStore';
import { AreaBar } from '@ui/AreaBar';
import { AssessmentCard } from '@ui/AssessmentCard';
import { CoachCard } from '@ui/CoachCard';
import { Attribution } from '@ui/Attribution';
import { BoardDebugPanel } from '@ui/BoardDebugPanel';
import { BriefingPanel } from '@ui/BriefingPanel';
import { ControlDock } from '@ui/ControlDock';
import { DataStatus } from '@ui/DataStatus';
import { FeaturesDebugPanel } from '@ui/FeaturesDebugPanel';
import { FpsMeter } from '@ui/FpsMeter';
import { GameControls } from '@ui/GameControls';
import { GameOverScreen } from '@ui/GameOverScreen';
import { HeightmapDebugPanel } from '@ui/HeightmapDebugPanel';
import { HintCard } from '@ui/HintCard';
import { IdentityCard } from '@ui/IdentityCard';
import { MainMenu } from '@ui/MainMenu';
import { PanelColumn } from '@ui/PanelColumn';
import type { NewGameRequest, SavedGameSummary } from '@ui/MainMenu';
import { PromotionPrompt } from '@ui/PromotionPrompt';
import { RecordPanel } from '@ui/RecordPanel';
import { Sounds } from '@ui/Sounds';
import { StatusBar } from '@ui/StatusBar';
import { Tooltips } from '@ui/Tooltips';
import { ViewControls } from '@ui/ViewControls';
import { BoardScene } from '@world/builders/BoardScene';
import { BoardView } from '@world/pieces/BoardView';
import { HighlightLayer } from '@world/pieces/HighlightLayer';
import { MoveAnimator } from '@world/pieces/MoveAnimator';
import { PieceLayer } from '@world/pieces/PieceLayer';
import { ProceduralPieceFactory } from '@world/pieces/ProceduralPieceFactory';
import { BoardPicker } from '@world/scene/BoardPicker';
import { PointerInput } from '@world/scene/PointerInput';
import { WorldStage } from '@world/scene/WorldStage';

import { BoardComposer } from './BoardComposer';
import type { AppConfig } from './config';

export interface AppHandle {
  /** The board currently shown — flat until the area's terrain has loaded, then warped. */
  layout(): IBoardLayout;
  readonly stage: WorldStage;
  selectedArea(): SelectedArea;
  heightField(): HeightField | null;
  features(): readonly MapFeature[] | null;
  dispose(): void;
}

export function bootstrap(
  config: AppConfig,
  worldContainer: HTMLElement,
  uiContainer: HTMLElement,
): AppHandle {
  // The flat board is the starting point; BoardComposer replaces it once terrain arrives.
  const initialLayout: IBoardLayout = new FlatBoardLayout({
    boardSizeMeters: config.boardSizeMeters,
  });
  const boardWidth = config.boardSizeMeters;
  const cellUnit = boardWidth / config.filesAndRanks;

  // --- world ---
  const stage = new WorldStage(worldContainer, initialLayout.bounds);

  const pieceFactory = new ProceduralPieceFactory(cellUnit);
  const pieces = new PieceLayer(initialLayout, pieceFactory);
  const highlights = new HighlightLayer(initialLayout);
  const animator = new MoveAnimator({ unit: cellUnit });
  const view = new BoardView(pieces, highlights, animator);
  stage.add(...view.objects);
  const stopAnimator = stage.loop.onTick((dt) => {
    animator.update(dt);
    highlights.update(dt);
  });

  // --- game ---
  const bus = new EventBus<GameEvents>();
  const engine = new ChessEngine();
  const promotion = new PromotionPrompt(uiContainer);
  const ai = new StockfishAI({ workerUrl: config.engineUrl, difficulty: config.defaultDifficulty });
  ai.ready().catch((error: unknown) => {
    // GameLoop falls back to a legal move on every failed request; this just tells the player why.
    console.error(
      'Chess engine failed to start; the computer will play weak fallback moves.',
      error,
    );
  });
  // Only the easiest level is questioned; startGame decides when.
  const game = new GameLoop({ engine, view, promotion, bus, ai });

  // --- persistence (Phase 11: one autosaved game, including its area) ---
  const saves = new SaveManager({
    bus,
    store: new LocalJsonStore<SavedGame>(config.saveKey, isSavedGame),
    context: (): SaveContext => ({
      area: areaBar.current,
      players: toPlayers(seating.humanColor),
      difficulty: seating.difficulty,
    }),
  });
  // Read once, before the first autosave overwrites it, so the menu can offer it.
  const savedOnLoad: SavedGame | null = saves.read();

  // The seating the shell will use for the next new game, and the save it is
  // still willing to resume. Both change only through startGame / resumeSavedGame.
  let seating: NewGameRequest = {
    humanColor: savedOnLoad === null ? config.defaultHumanColor : toHumanColor(savedOnLoad.players),
    difficulty: savedOnLoad?.difficulty ?? config.defaultDifficulty,
  };
  let resumable: SavedGame | null = savedOnLoad;
  /** What the current board is called, once its features have arrived. */
  let placeName: string | null = null;
  /** Drops a Wikidata answer that arrives after the player has moved on. */
  let briefingGeneration = 0;

  // --- ui ---
  const statusBar = new StatusBar(uiContainer, bus);
  // One tooltip for every `data-tip` in the overlay, placed where it fits.
  const tooltips = new Tooltips(uiContainer);
  // Silent until the player asks; a browser will not start audio otherwise.
  const sounds = new Sounds(bus);
  // Required by the ODbL for as long as the board is on screen.
  const attribution = new Attribution(uiContainer);
  const themeTracker = new ThemeTracker(bus);
  const briefing = new BriefingPanel(uiContainer);
  // The reveal is drawn on the briefing's paper rather than floating over the board.
  const identityCard = new IdentityCard(briefing.selectionSlot, bus, themeTracker);
  // Optional, CC0, and never allowed to hold the board up: the briefing is
  // shown at once from OSM alone, then re-shown if Wikidata answers.
  const historyProvider = new WikidataProvider(
    new IndexedDbStore<HistoryFact>(STORES.history, isHistoryFact),
  );
  // Left column, top to bottom: the controls, the record, then a hint when
  // there is one. Flex does the arithmetic that three absolute positions used
  // to have to agree on.
  const column = new PanelColumn(uiContainer);
  const dock = new ControlDock(column.element);
  const coachCard = new CoachCard(column.element, bus);
  const assessment = new AssessmentCard(column.element, bus);
  const record = new RecordPanel(column.element, bus, themeTracker);
  const hintCard = new HintCard(column.element, bus, themeTracker);

  const menu = new MainMenu(uiContainer, seating, {
    onNewGame: (request) => {
      startGame(request);
    },
    onResume: () => {
      resumeSavedGame();
    },
    onChooseArea: () => {
      areaBar.open();
    },
    // The name if the map knows one; the coordinates are the fallback, not the point.
    areaLabel: () => placeName ?? areaBar.label,
    savedGame: () => summarise(resumable),
    // Nothing plays behind the front door — see GameLoop.setAtMenu.
    onVisibility: (open) => {
      game.setAtMenu(open);
    },
  });
  const controls = new GameControls({ menu: dock.placeSlot, actions: dock.actionSlot }, bus, {
    onMenu: () => {
      menu.open();
    },
    onTogglePause: () => {
      game.setPaused(!game.isPaused);
    },
    canPause: () => game.isWatching() && game.outcome === null,
    isPaused: () => game.isPaused,
    onHint: () => {
      void game.requestHint();
    },
    onUndo: () => {
      game.undo();
    },
    onResign: () => {
      // Resigning on behalf of whoever the player is sitting as.
      game.resign(resigningColor());
    },
    canHint: () => game.canHint(),
    canUndo: () => game.canUndo(),
    canResign: () => game.outcome === null && seating.humanColor !== 'none',
  });
  const gameOver = new GameOverScreen(uiContainer, bus, themeTracker, () => {
    menu.open();
  });

  const debug = new URLSearchParams(window.location.search).has('debug');
  const fps = debug
    ? new FpsMeter(uiContainer, () => ({
        calls: stage.renderer.info.render.calls,
        triangles: stage.renderer.info.render.triangles,
      }))
    : null;
  const stopFps =
    fps === null
      ? () => undefined
      : stage.loop.onTick((dt) => {
          fps.tick(dt);
        });

  // --- map area + elevation (Phase 5/6: selected, fetched and shown; consumed by the board from Phase 8) ---
  // Fixtures first (offline), then IndexedDB-cached Terrarium tiles (D-022).
  const elevationProvider = new FixtureElevationProvider(
    fixtureEntries(),
    new TerrariumElevationProvider(
      new IndexedDbStore<Float32Array>(STORES.elevationTiles, (v) => v instanceof Float32Array),
    ),
    browserBase64,
  );
  // Loading and failure are visible to every player; the debug panels add the detail.
  const dataStatus = new DataStatus(uiContainer, () => {
    loadArea(areaBar.current);
  });
  const heightmapPanel = debug ? new HeightmapDebugPanel(uiContainer) : null;
  const elevationView: IElevationView = {
    showLoading: (done, total) => {
      dataStatus.terrain.showLoading(done, total);
      heightmapPanel?.showLoading(done, total);
    },
    showField: (result, elapsedMs) => {
      dataStatus.terrain.showField(result, elapsedMs);
      heightmapPanel?.showField(result, elapsedMs);
    },
    showError: (message) => {
      dataStatus.terrain.showError(message);
      heightmapPanel?.showError(message);
    },
  };
  const elevation = new ElevationLoader(elevationProvider, elevationView);

  // Features: fixtures first (offline), then IndexedDB-cached, rate-limited Overpass (D-024).
  const featureProvider = new FixtureFeatureProvider(
    featureFixtureEntries(),
    new OverpassFeatureProvider(
      new IndexedDbStore<CachedFeatures>(STORES.features, isCachedFeatures),
    ),
  );
  const featuresPanel = debug ? new FeaturesDebugPanel(uiContainer) : null;
  const featuresView: IFeaturesView = {
    showLoading: () => {
      dataStatus.features.showLoading();
      featuresPanel?.showLoading();
    },
    showFeatures: (summary, result) => {
      dataStatus.features.showFeatures(summary, result);
      featuresPanel?.showFeatures(summary, result);
    },
    showError: (message) => {
      dataStatus.features.showError(message);
      featuresPanel?.showError(message);
    },
  };
  const features = new FeatureLoader(featureProvider, featuresView);

  const areaBar: AreaBar = new AreaBar(
    { summary: briefing.coordinateSlot, buttons: dock.placeSlot },
    savedOnLoad?.area ?? config.defaultArea,
    {
      geocoder: new NominatimGeocoder(),
      styleUrl: config.mapStyleUrl,
      pickerHost: uiContainer,
      presets: FIXTURE_AREAS,
      onAreaChanged: (area) => {
        placeName = null;
        loadArea(area);
        // A new area is a new board, so it is a new game: identities from the old
        // map would otherwise follow pieces onto ground they never came from.
        startGame(seating);
      },
    },
  );

  // --- input ---
  const picker = new BoardPicker(stage.camera, initialLayout, null, pieces);
  const input = new PointerInput(stage.renderer.domElement);
  input.onClick((ndc) => {
    if (menu.isOpen) return;
    const square = picker.pick(ndc);
    if (square !== null) void game.handleSquareClick(square);
  });
  input.onMove((ndc) => {
    boardScene.setHoveredSquare(ndc === null || menu.isOpen ? null : picker.pick(ndc));
  });

  // --- board: flat until terrain arrives, then warped (Phase 8) ---
  const boardScene = new BoardScene({ stage, pieces, highlights, picker });
  const composer = new BoardComposer(config.boardSizeMeters, ({ model, mode }) => {
    // The flat placeholder board carries no features; keep the last known name.
    if (model.features !== null) placeName = primaryPlaceName(model.features);
    const inputs: BriefingInputs | null =
      model.features === null || model.heights === null || model.cover === null
        ? null
        : {
            features: model.features,
            heights: model.heights,
            cover: model.cover,
            bounds: model.layout.bounds,
          };
    briefing.show(inputs === null ? null : buildBriefing(inputs));
    if (inputs !== null) {
      const generation = ++briefingGeneration;
      void historyProvider.factsFor(inputs.features).then((history) => {
        // A later board may have arrived while Wikidata was answering.
        if (generation !== briefingGeneration || history.size === 0) return;
        briefing.show(buildBriefing({ ...inputs, history }));
      });
    }
    boardScene.show(model);
    themeTracker.setTheme(model.theme);
    // Positions changed under the pieces; re-place them from the engine's position.
    view.showPosition(engine.pieces());
    const t = model.terrain;
    console.info(
      `Board: ${mode}${t === null ? '' : ` (${String(t.lines.length)} lines, ${String(t.points.length)} points)`}`,
    );
  });

  function loadArea(area: SelectedArea): void {
    const generation = composer.beginArea();
    void elevation.load(area).then((result) => {
      if (result !== null) composer.setHeights(generation, result.field);
    });
    void features.load(area).then((result) => {
      if (result !== null) composer.setFeatures(generation, result.features);
    });
  }

  function startGame(request: NewGameRequest): void {
    resumable = null;
    seating = request;
    ai.setDifficulty(request.difficulty);
    game.newGame(toPlayers(request.humanColor));
  }

  function resumeSavedGame(): void {
    const saved = resumable;
    if (saved === null) return;
    resumable = null;
    seating = { humanColor: toHumanColor(saved.players), difficulty: saved.difficulty };
    ai.setDifficulty(saved.difficulty);
    if (!sameArea(saved.area, areaBar.current)) {
      areaBar.setArea(saved.area);
      loadArea(saved.area);
    }
    saves.resume(game);
  }

  function resigningColor(): 'white' | 'black' {
    // Hot-seat: whoever is to move gives up. Otherwise the player's own colour.
    if (seating.humanColor === 'white' || seating.humanColor === 'black') return seating.humanColor;
    return engine.turn;
  }

  const boardDebug = debug
    ? new BoardDebugPanel(
        uiContainer,
        { mode: 'warped', labels: true, features: true },
        (state) => {
          composer.setMode(state.mode);
          boardScene.setOverlay({ labels: state.labels, features: state.features });
        },
      )
    : null;
  if (debug) boardScene.setOverlay({ labels: true, features: true });

  const viewControls = new ViewControls(dock.actionSlot, {
    onLabelsChanged: (mode) => {
      boardScene.setLabelMode(mode);
    },
    onAssessingChanged: (on) => {
      game.setAssessing(on);
    },
    onCoachingChanged: (on) => {
      game.setCoaching(on);
    },
    onSoundChanged: (on) => {
      sounds.setEnabled(on);
    },
    onRecenter: () => {
      stage.reframe(boardScene.layout?.bounds ?? initialLayout.bounds);
    },
  });

  loadArea(areaBar.current);
  // The menu goes up first so the hold is already on when the game starts:
  // otherwise a watched game announces "White is thinking…" on its way to
  // being held, and the status bar keeps saying it behind the front door.
  menu.open();
  game.start(toPlayers(seating.humanColor));
  stage.start();

  return {
    layout: () => boardScene.layout ?? initialLayout,
    stage,
    selectedArea: () => areaBar.current,
    heightField: () => elevation.heightField,
    features: () => features.features,
    dispose: () => {
      input.dispose();
      boardDebug?.dispose();
      boardScene.dispose();
      features.dispose();
      featuresPanel?.dispose();
      elevation.dispose();
      heightmapPanel?.dispose();
      dataStatus.dispose();
      areaBar.dispose();
      stopFps();
      fps?.dispose();
      viewControls.dispose();
      gameOver.dispose();
      controls.dispose();
      menu.dispose();
      hintCard.dispose();
      record.dispose();
      assessment.dispose();
      coachCard.dispose();
      dock.dispose();
      column.dispose();
      briefing.dispose();
      saves.dispose();
      identityCard.dispose();
      themeTracker.dispose();
      attribution.dispose();
      sounds.dispose();
      tooltips.dispose();
      statusBar.dispose();
      ai.dispose();
      stopAnimator();
      highlights.dispose();
      pieceFactory.dispose();
      bus.clear();
      stage.dispose();
    },
  };
}

/** Guards a cached fact against a shape written by an older version. */
function isHistoryFact(value: unknown): value is HistoryFact {
  if (typeof value !== 'object' || value === null) return false;
  const f = value as Partial<HistoryFact>;
  return (
    typeof f.id === 'string' &&
    (f.label === null || typeof f.label === 'string') &&
    (f.year === null || typeof f.year === 'number') &&
    (f.kind === null || typeof f.kind === 'string') &&
    (f.heritage === null || typeof f.heritage === 'string')
  );
}

function toPlayers(humanColor: NewGameRequest['humanColor']): Players {
  switch (humanColor) {
    case 'white':
      return { white: 'human', black: 'ai' };
    case 'black':
      return { white: 'ai', black: 'human' };
    case 'both':
      return { white: 'human', black: 'human' };
    case 'none':
      return { white: 'ai', black: 'ai' };
  }
}

function toHumanColor(players: Players): NewGameRequest['humanColor'] {
  if (players.white === 'human' && players.black === 'human') return 'both';
  if (players.white === 'human') return 'white';
  if (players.black === 'human') return 'black';
  return 'none';
}

function summarise(saved: SavedGame | null): SavedGameSummary | null {
  if (saved === null) return null;
  return {
    moveCount: saved.moves.length,
    areaLabel: `${saved.area.centerLat.toFixed(3)}, ${saved.area.centerLon.toFixed(3)}`,
    savedAt: new Date(saved.savedAt),
  };
}

function sameArea(a: SelectedArea, b: SelectedArea): boolean {
  return (
    a.centerLat === b.centerLat &&
    a.centerLon === b.centerLon &&
    a.sizeMeters === b.sizeMeters &&
    a.rotationDeg === b.rotationDeg
  );
}
