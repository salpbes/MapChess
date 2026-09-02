// WHAT: Loads map features for whichever area is current and reports them.
// HOW:  `load(area)` cancels any in-flight request, asks IFeatureProvider,
//       forwards loading / result / error to a view, prints the full name
//       report to the console, and keeps the latest features for Phase 8.
// WHY:  Same shape as ElevationLoader: the small piece of glue between "area
//       chosen" and "features available", with cancellation so a quick second
//       selection never shows stale data.

import type { MapArea } from '@mapdata/model/MapArea';
import { describeArea } from '@mapdata/model/MapArea';
import type { MapFeature } from '@mapdata/model/MapFeature';
import type { SelectedArea } from '@mapdata/model/SelectedArea';
import { NetworkError } from '@mapdata/net/fetchJson';

import type { FeatureResult, IFeatureProvider } from './IFeatureProvider';
import { formatFeatureReport, summarizeFeatures } from './summarizeFeatures';
import type { FeatureSummary } from './summarizeFeatures';

/** What the loader needs from a UI: implemented by ui/FeaturesDebugPanel. */
export interface IFeaturesView {
  showLoading(): void;
  showFeatures(summary: FeatureSummary, result: FeatureResult): void;
  showError(message: string): void;
}

export class FeatureLoader {
  private inFlight: AbortController | null = null;
  private latest: FeatureResult | null = null;

  public constructor(
    private readonly provider: IFeatureProvider,
    private readonly view: IFeaturesView,
  ) {}

  public get features(): readonly MapFeature[] | null {
    return this.latest?.features ?? null;
  }

  public async load(area: SelectedArea): Promise<FeatureResult | null> {
    this.inFlight?.abort();
    const abort = new AbortController();
    this.inFlight = abort;
    this.view.showLoading();

    const mapArea: MapArea = describeArea(area);
    try {
      const result = await this.provider.getFeatures(mapArea, { signal: abort.signal });
      if (abort.signal.aborted) return null;
      this.latest = result;
      const summary = summarizeFeatures(result.features);
      this.view.showFeatures(summary, result);
      console.info(
        formatFeatureReport(
          summary,
          `MapChess features for ${area.centerLat.toFixed(4)}, ${area.centerLon.toFixed(4)} (${result.source}, ${String(Math.round(result.elapsedMs))} ms)`,
        ),
      );
      return result;
    } catch (error: unknown) {
      if (abort.signal.aborted) return null;
      const message =
        error instanceof NetworkError
          ? error.reason === 'http' && error.status === 429
            ? 'Overpass is busy (rate limited) — try again in a minute'
            : `${error.reason}${error.status === undefined ? '' : ` ${String(error.status)}`}`
          : error instanceof Error
            ? error.message
            : String(error);
      this.view.showError(message);
      console.error('Feature load failed:', error);
      return null;
    } finally {
      if (this.inFlight === abort) this.inFlight = null;
    }
  }

  public dispose(): void {
    this.inFlight?.abort();
  }
}
