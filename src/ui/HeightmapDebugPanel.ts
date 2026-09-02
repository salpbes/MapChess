// WHAT: A small panel that renders a HeightField as a greyscale image with
//       its statistics, and shows loading / error states while it is fetched.
// HOW:  `showLoading(progress)`, `showField(result, ms)`, `showError(msg)`.
//       The canvas is the field's own resolution (one pixel per sample), scaled
//       by CSS; row 0 is the board's north edge so the image reads like a map
//       with White at the bottom.
// WHY:  BUILD_PLAN Phase 6 "done when": a debug view renders a greyscale
//       heightmap and the second load is instant. Showing source and timing
//       is how you can tell cache from network without opening devtools.

import type { IElevationView } from '@mapdata/elevation/ElevationLoader';
import type { ElevationResult } from '@mapdata/elevation/IElevationProvider';
import type { HeightField } from '@mapdata/model/HeightField';

export class HeightmapDebugPanel implements IElevationView {
  private readonly el: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly caption: HTMLDivElement;

  public constructor(container: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'heightmap-panel';
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'heightmap-panel__canvas';
    this.caption = document.createElement('div');
    this.caption.className = 'heightmap-panel__caption';
    this.el.append(this.canvas, this.caption);
    container.appendChild(this.el);
    this.showLoading(0, 0);
  }

  public showLoading(done: number, total: number): void {
    this.caption.textContent =
      total === 0 ? 'Elevation: loading…' : `Elevation: ${String(done)} / ${String(total)} tiles`;
  }

  public showError(message: string): void {
    this.caption.textContent = `Elevation failed: ${message}`;
    const ctx = this.canvas.getContext('2d');
    if (ctx !== null) ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  public showField(result: ElevationResult, elapsedMs: number): void {
    const { field } = result;
    this.draw(field);
    const via =
      result.source === 'fixture'
        ? 'offline fixture'
        : `${result.source}, ${String(result.tileCount)} tiles @ z${String(result.zoom)}`;
    this.caption.textContent = `Elevation ${field.minMeters.toFixed(0)}…${field.maxMeters.toFixed(0)} m · ${String(field.cols)}×${String(field.rows)} @ ${String(field.stepMeters)} m · ${via} · ${String(Math.round(elapsedMs))} ms`;
  }

  public dispose(): void {
    this.el.remove();
  }

  private draw(field: HeightField): void {
    this.canvas.width = field.cols;
    this.canvas.height = field.rows;
    const ctx = this.canvas.getContext('2d');
    if (ctx === null) return;
    const img = ctx.createImageData(field.cols, field.rows);
    const range = Math.max(field.maxMeters - field.minMeters, 1e-6);
    for (let i = 0; i < field.data.length; i += 1) {
      const v = Math.round((((field.data[i] ?? 0) - field.minMeters) / range) * 255);
      const o = i * 4;
      img.data[o] = v;
      img.data[o + 1] = v;
      img.data[o + 2] = v;
      img.data[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }
}
