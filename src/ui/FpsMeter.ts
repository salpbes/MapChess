// WHAT: A small frames-per-second and draw-call readout.
// HOW:  Fed from the render loop's tick; averages over a one-second window and
//       rewrites a <div>. An optional stats callback adds renderer counts.
//       Hidden unless the page is opened with `?debug`.
// WHY:  BUILD_PLAN Phase 4 and Phase 9 both say "measure the frame rate,
//       don't assume" and "no thousands of draw calls". This is the measurement.

export interface RenderStats {
  readonly calls: number;
  readonly triangles: number;
}

export class FpsMeter {
  private readonly el: HTMLDivElement;
  private frames = 0;
  private elapsed = 0;

  public constructor(
    container: HTMLElement,
    private readonly stats?: () => RenderStats,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'fps-meter';
    this.el.textContent = '– fps';
    container.appendChild(this.el);
  }

  public tick(deltaSeconds: number): void {
    this.frames += 1;
    this.elapsed += deltaSeconds;
    if (this.elapsed < 1) return;
    const fps = String(Math.round(this.frames / this.elapsed));
    const s = this.stats?.();
    this.el.textContent =
      s === undefined
        ? `${fps} fps`
        : `${fps} fps · ${String(s.calls)} calls · ${(s.triangles / 1000).toFixed(0)}k tris`;
    this.frames = 0;
    this.elapsed = 0;
  }

  public dispose(): void {
    this.el.remove();
  }
}
