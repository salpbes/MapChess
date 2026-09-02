// WHAT: Creates and configures the WebGLRenderer.
// HOW:  Sizes the canvas to the container, caps the pixel ratio at 2 so retina
//       screens don't quadruple the fill cost, and appends the canvas.
// WHY:  Renderer setup is one decision (colour space, antialias, DPR) made once.
//       Nothing else should ever call `setSize` or `setPixelRatio` — the
//       ResizeHandler goes through `resizeRenderer` below.

import { SRGBColorSpace, WebGLRenderer } from 'three';

const MAX_PIXEL_RATIO = 2;

export function createRenderer(container: HTMLElement): WebGLRenderer {
  const renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
  resizeRenderer(renderer, container);
  container.appendChild(renderer.domElement);
  return renderer;
}

export function resizeRenderer(renderer: WebGLRenderer, container: HTMLElement): void {
  renderer.setSize(container.clientWidth, container.clientHeight, false);
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
}
