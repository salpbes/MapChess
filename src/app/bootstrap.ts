// WHAT: The composition root — builds every service and wires them together.
// HOW:  Creates the stage from the flat board's bounds, builds the piece and
//       highlight layers, spins up the Stockfish worker, connects pointer
//       clicks → BoardPicker → GameLoop, and routes the selected area's
//       heights and features into BoardComposer, whose layout BoardScene
//       shows. Returns a handle so main.ts can tear it all down on hot reload.
// WHY:  This is the one place where "which layout", "which piece factory",
//       "which engine" and "which opponent" are decided. Phase 8's layout
//       swap lives in BoardComposer; nothing in world/ or game/ changed for it.

import { StockfishAI } from '@ai/StockfishAI';
import { FlatBoardLayout } from '@domain/board/FlatBoardLayout';
import type { IBoardLayout } from '@domain/board/IBoardLayout';
import { ChessEngine } from '@domain/chess/ChessEngine';
import type { GameEvents } from '@game/GameEvents';
import { GameLoop } from '@game/GameLoop';
import type { Players } from '@game/GameLoop';
import { IndexedDbStore, STORES } from '@mapdata/cache/KeyValueStore';
import { ElevationLoader } from '@mapdata/elevation/ElevationLoader';
import { fixtureEntries } from '@mapdata/elevation/fixtureAreas';
import { FixtureElevationProvider } from '@mapdata/elevation/FixtureElevationProvider';
import { TerrariumElevationProvider } from '@mapdata/elevation/TerrariumElevationProvider';
import { FeatureLoader } from '@mapdata/features/FeatureLoader';
import {
  featureFixtureEntries,
  FixtureFeatureProvider,
} from '@mapdata/features/FixtureFeatureProvider';
import {
  isCachedFeatures,
  OverpassFeatureProvider,
} from '@mapdata/features/OverpassFeatureProvider';
import type { CachedFeatures } from '@mapdata/features/OverpassFeatureProvider';
import { NominatimGeocoder } from '@mapdata/geocode/NominatimGeocoder';
import type { HeightField } from '@mapdata/model/HeightField';
import { FIXTURE_AREAS } from '@mapdata/model/fixtureAreas';
import type { MapFeature } from '@mapdata/model/MapFeature';
import type { SelectedArea } from '@mapdata/model/SelectedArea';
import { browserBase64 } from '@shared/encoding/base64';
import { EventBus } from '@shared/events/EventBus';
import { AreaBar } from '@ui/AreaBar';
import { BoardDebugPanel } from '@ui/BoardDebugPanel';
import { FeaturesDebugPanel } from '@ui/FeaturesDebugPanel';
import { FpsMeter } from '@ui/FpsMeter';
import { HeightmapDebugPanel } from '@ui/HeightmapDebugPanel';
import { OpponentPanel } from '@ui/OpponentPanel';
import type { NewGameRequest } from '@ui/OpponentPanel';
import { PromotionPrompt } from '@ui/PromotionPrompt';
import { StatusBar } from '@ui/StatusBar';
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
  const game = new GameLoop({ engine, view, promotion, bus, ai });

  // --- ui ---
  const statusBar = new StatusBar(uiContainer, bus);
  const initialSeating: NewGameRequest = {
    humanColor: config.defaultHumanColor,
    difficulty: config.defaultDifficulty,
  };
  const panel = new OpponentPanel(uiContainer, initialSeating, (request) => {
    ai.setDifficulty(request.difficulty);
    game.newGame(toPlayers(request.humanColor));
  });
  const fps = new URLSearchParams(window.location.search).has('debug')
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
  const heightmapPanel = new HeightmapDebugPanel(uiContainer);
  const elevation = new ElevationLoader(elevationProvider, heightmapPanel);

  // Features: fixtures first (offline), then IndexedDB-cached, rate-limited Overpass (D-024).
  const featureProvider = new FixtureFeatureProvider(
    featureFixtureEntries(),
    new OverpassFeatureProvider(
      new IndexedDbStore<CachedFeatures>(STORES.features, isCachedFeatures),
    ),
  );
  const featuresPanel = new FeaturesDebugPanel(uiContainer);
  const features = new FeatureLoader(featureProvider, featuresPanel);

  const areaBar = new AreaBar(uiContainer, config.defaultArea, {
    geocoder: new NominatimGeocoder(),
    styleUrl: config.mapStyleUrl,
    presets: FIXTURE_AREAS,
    onAreaChanged: (area) => {
      loadArea(area);
    },
  });

  // --- input ---
  const picker = new BoardPicker(stage.camera, initialLayout, null, pieces);
  const input = new PointerInput(stage.renderer.domElement);
  input.onClick((ndc) => {
    const square = picker.pick(ndc);
    if (square !== null) void game.handleSquareClick(square);
  });

  // --- board: flat until terrain arrives, then warped (Phase 8) ---
  const boardScene = new BoardScene({ stage, pieces, highlights, picker });
  const composer = new BoardComposer(config.boardSizeMeters, ({ model, mode }) => {
    boardScene.show(model);
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

  const debug = new URLSearchParams(window.location.search).has('debug');
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

  loadArea(config.defaultArea);
  game.start(toPlayers(initialSeating.humanColor));
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
      featuresPanel.dispose();
      elevation.dispose();
      heightmapPanel.dispose();
      areaBar.dispose();
      stopFps();
      fps?.dispose();
      panel.dispose();
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
