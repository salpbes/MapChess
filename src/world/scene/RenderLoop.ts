// WHAT: The per-frame update loop.
// HOW:  Wraps `renderer.setAnimationLoop`, hands each subscriber the elapsed
//       seconds since the previous frame (clamped, so a backgrounded tab does
//       not produce a giant step on return), then renders.
// WHY:  Controls damping, move animation (Phase 3) and later label fading all
//       need a tick. One loop with subscribers beats each system running its
//       own requestAnimationFrame.

import { Timer } from 'three';
import type { Camera, Scene, WebGLRenderer } from 'three';

export type TickCallback = (deltaSeconds: number) => void;

/** Longest step handed to subscribers, so tab-switches do not teleport animations. */
const MAX_DELTA_SECONDS = 0.1;

export class RenderLoop {
  private readonly timer = new Timer();
  private readonly subscribers = new Set<TickCallback>();

  public constructor(
    private readonly renderer: WebGLRenderer,
    private readonly scene: Scene,
    private readonly camera: Camera,
  ) {}

  public onTick(callback: TickCallback): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  public start(): void {
    this.timer.reset();
    this.renderer.setAnimationLoop((time) => {
      this.frame(time);
    });
  }

  public stop(): void {
    this.renderer.setAnimationLoop(null);
  }

  public dispose(): void {
    this.stop();
    this.timer.dispose();
  }

  private frame(time: number): void {
    this.timer.update(time);
    const delta = Math.min(this.timer.getDelta(), MAX_DELTA_SECONDS);
    for (const cb of this.subscribers) cb(delta);
    this.renderer.render(this.scene, this.camera);
  }
}
