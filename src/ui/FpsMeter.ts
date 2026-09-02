// WHAT: A small frames-per-second readout.
// HOW:  Fed from the render loop's tick; averages over a one-second window and
//       rewrites a <div>. Hidden unless the page is opened with `?debug`.
// WHY:  BUILD_PLAN Phase 4 and Phase 9 both say "measure the frame rate,
//       don't assume". This is the measurement.

export class FpsMeter {
  private readonly el: HTMLDivElement;
  private frames = 0;
  private elapsed = 0;

  public constructor(container: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'fps-meter';
    this.el.textContent = '– fps';
    container.appendChild(this.el);
  }

  public tick(deltaSeconds: number): void {
    this.frames += 1;
    this.elapsed += deltaSeconds;
    if (this.elapsed < 1) return;
    this.el.textContent = `${String(Math.round(this.frames / this.elapsed))} fps`;
    this.frames = 0;
    this.elapsed = 0;
  }

  public dispose(): void {
    this.el.remove();
  }
}
