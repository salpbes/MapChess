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
  renderer.shadowMap.enabled = true;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
  resizeRenderer(renderer, container);
  /*
    The board is reachable by keyboard: without a tabindex a canvas is a
    picture, and the game inside it cannot be tabbed to at all. The label is
    what a screen reader announces on arrival, since there is nothing to read.
  */
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute('role', 'application');
  renderer.domElement.setAttribute(
    'aria-label',
    'The board. Arrow keys move the cursor, or type a square such as e4. Enter picks up and puts down a piece; Escape puts it back.',
  );
  container.appendChild(renderer.domElement);
  return renderer;
}

export function resizeRenderer(renderer: WebGLRenderer, container: HTMLElement): void {
  renderer.setSize(container.clientWidth, container.clientHeight, false);
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
}
