// WHAT: Turns raw pointer events on the canvas into "click at NDC" and
//       "moved to NDC" callbacks.
// HOW:  Records pointerdown; on pointerup, if the pointer moved less than a
//       few pixels and it was the primary button, reports a click with
//       normalised device coordinates (−1…1). Anything else is left to
//       OrbitControls as a drag. Movement is reported separately and only
//       while no button is held, so orbiting does not stream hover events.
// WHY:  OrbitControls and selection share the same mouse button. Without a
//       movement threshold every orbit would also select a square.

export interface NdcPoint {
  readonly x: number;
  readonly y: number;
}

export type ClickHandler = (ndc: NdcPoint) => void;
/** Null when the pointer has left the canvas. */
export type MoveHandler = (ndc: NdcPoint | null) => void;

const MAX_CLICK_TRAVEL_PX = 6;

export class PointerInput {
  private readonly handlers = new Set<ClickHandler>();
  private readonly moveHandlers = new Set<MoveHandler>();
  private downAt: { x: number; y: number } | null = null;

  public constructor(private readonly canvas: HTMLElement) {
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onCancel);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerleave', this.onLeave);
  }

  public onClick(handler: ClickHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  public onMove(handler: MoveHandler): () => void {
    this.moveHandlers.add(handler);
    return () => this.moveHandlers.delete(handler);
  }

  public dispose(): void {
    this.canvas.removeEventListener('pointerdown', this.onDown);
    this.canvas.removeEventListener('pointerup', this.onUp);
    this.canvas.removeEventListener('pointercancel', this.onCancel);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerleave', this.onLeave);
    this.handlers.clear();
    this.moveHandlers.clear();
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

    const ndc = this.toNdc(e);
    for (const handler of this.handlers) handler(ndc);
  };

  private readonly onCancel = (): void => {
    this.downAt = null;
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (this.moveHandlers.size === 0) return;
    // Mid-drag the player is moving the camera, not pointing at anything.
    if (e.buttons !== 0) return;
    const point = this.toNdc(e);
    for (const handler of this.moveHandlers) handler(point);
  };

  private readonly onLeave = (): void => {
    for (const handler of this.moveHandlers) handler(null);
  };

  private toNdc(e: PointerEvent): NdcPoint {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
      y: -(((e.clientY - rect.top) / rect.height) * 2 - 1),
    };
  }
}
