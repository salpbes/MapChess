// WHAT: Turns raw pointer events on the canvas into "click at NDC" callbacks.
// HOW:  Records pointerdown; on pointerup, if the pointer moved less than a
//       few pixels and it was the primary button, reports a click with
//       normalised device coordinates (−1…1). Anything else is left to
//       OrbitControls as a drag.
// WHY:  OrbitControls and selection share the same mouse button. Without a
//       movement threshold every orbit would also select a square.

export interface NdcPoint {
  readonly x: number;
  readonly y: number;
}

export type ClickHandler = (ndc: NdcPoint) => void;

const MAX_CLICK_TRAVEL_PX = 6;

export class PointerInput {
  private readonly handlers = new Set<ClickHandler>();
  private downAt: { x: number; y: number } | null = null;

  public constructor(private readonly canvas: HTMLElement) {
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onCancel);
  }

  public onClick(handler: ClickHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  public dispose(): void {
    this.canvas.removeEventListener('pointerdown', this.onDown);
    this.canvas.removeEventListener('pointerup', this.onUp);
    this.canvas.removeEventListener('pointercancel', this.onCancel);
    this.handlers.clear();
  }

  private readonly onDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    this.downAt = { x: e.clientX, y: e.clientY };
  };

  private readonly onUp = (e: PointerEvent): void => {
    const down = this.downAt;
    this.downAt = null;
    if (down === null || e.button !== 0) return;
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > MAX_CLICK_TRAVEL_PX) return;

    const rect = this.canvas.getBoundingClientRect();
    const ndc: NdcPoint = {
      x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
      y: -(((e.clientY - rect.top) / rect.height) * 2 - 1),
    };
    for (const handler of this.handlers) handler(ndc);
  };

  private readonly onCancel = (): void => {
    this.downAt = null;
  };
}
