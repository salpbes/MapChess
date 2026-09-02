// WHAT: Keeps renderer and camera in step with the container's size.
// HOW:  A ResizeObserver on the container (not `window.resize`) so the canvas
//       follows layout changes too, e.g. a side panel opening in Phase 11.
// WHY:  Resize logic is a classic source of stretched renders and broken
//       raycasts; isolating it makes it impossible to half-do.

import type { PerspectiveCamera, WebGLRenderer } from 'three';

import { resizeRenderer } from './createRenderer';

export class ResizeHandler {
  private readonly observer: ResizeObserver;

  public constructor(
    private readonly container: HTMLElement,
    private readonly renderer: WebGLRenderer,
    private readonly camera: PerspectiveCamera,
  ) {
    this.observer = new ResizeObserver(() => {
      this.apply();
    });
    this.observer.observe(container);
    this.apply();
  }

  public dispose(): void {
    this.observer.disconnect();
  }

  private apply(): void {
    const { clientWidth, clientHeight } = this.container;
    if (clientWidth === 0 || clientHeight === 0) return;
    resizeRenderer(this.renderer, this.container);
    this.camera.aspect = clientWidth / clientHeight;
    this.camera.updateProjectionMatrix();
  }
}
