// WHAT: Loads elevation for whichever area is current and reports it.
// HOW:  `load(area)` cancels any in-flight request, asks IElevationProvider,
//       times it, and forwards progress / result / error to the debug panel.
//       Keeps the latest HeightField for anyone who asks (Phase 8 will).
// WHY:  app/ must not contain behaviour; this is the small piece of glue
//       between "area chosen" and "heights available", with cancellation so a
//       quick second selection never shows stale terrain.

import type { ElevationResult, IElevationProvider } from '@mapdata/elevation/IElevationProvider';
import type { HeightField } from '@mapdata/model/HeightField';
import { describeArea } from '@mapdata/model/MapArea';
import type { SelectedArea } from '@mapdata/model/SelectedArea';
import { NetworkError } from '@mapdata/net/fetchJson';

/** What the loader needs from a UI: implemented by ui/HeightmapDebugPanel. */
export interface IElevationView {
  showLoading(done: number, total: number): void;
  showField(result: ElevationResult, elapsedMs: number): void;
  showError(message: string): void;
}

export class ElevationLoader {
  private inFlight: AbortController | null = null;
  private latest: ElevationResult | null = null;

  public constructor(
    private readonly provider: IElevationProvider,
    private readonly panel: IElevationView,
  ) {}

  public get heightField(): HeightField | null {
    return this.latest?.field ?? null;
  }

  public async load(area: SelectedArea): Promise<ElevationResult | null> {
    this.inFlight?.abort();
    const abort = new AbortController();
    this.inFlight = abort;
    this.panel.showLoading(0, 0);

    const started = performance.now();
    try {
      const result = await this.provider.getHeightField(describeArea(area), {
        signal: abort.signal,
        onProgress: (done, total) => {
          if (!abort.signal.aborted) this.panel.showLoading(done, total);
        },
      });
      if (abort.signal.aborted) return null;
      this.latest = result;
      this.panel.showField(result, performance.now() - started);
      return result;
    } catch (error: unknown) {
      if (abort.signal.aborted) return null;
      const message =
        error instanceof NetworkError
          ? `${error.reason} (${error.url.split('/').slice(-3).join('/')})`
          : error instanceof Error
            ? error.message
            : String(error);
      this.panel.showError(message);
      console.error('Elevation load failed:', error);
      return null;
    } finally {
      if (this.inFlight === abort) this.inFlight = null;
    }
  }

  public dispose(): void {
    this.inFlight?.abort();
  }
}
