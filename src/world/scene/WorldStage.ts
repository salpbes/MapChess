// WHAT: The empty stage — composes renderer, camera, lights, controls, resize
//       and the render loop into one object the app can add things to.
// HOW:  Constructor injection of the container and the board bounds; everything
//       else is built from those two. `add()` puts objects in the scene,
//       `start()` begins rendering, `dispose()` tears everything down so Vite
//       hot-reload does not stack canvases.
// WHY:  app/ should say `new WorldStage(container, layout.bounds)` and be done.
//       The individual create* modules stay small and testable by eye; this is
//       the only file that knows they all exist.

import { Color, Scene } from 'three';
import type { Object3D, PerspectiveCamera, WebGLRenderer } from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import type { BoardBounds } from '@domain/board/types';

import { createCamera } from './createCamera';
import { createControls } from './createControls';
import { createLights } from './createLights';
import { createRenderer } from './createRenderer';
import { RenderLoop } from './RenderLoop';
import { ResizeHandler } from './ResizeHandler';

const BACKGROUND = 0x1a1d21;

export class WorldStage {
  public readonly scene: Scene;
  public readonly camera: PerspectiveCamera;
  public readonly renderer: WebGLRenderer;
  public readonly controls: OrbitControls;
  public readonly loop: RenderLoop;

  private readonly resize: ResizeHandler;
  private lights: Object3D;
  private readonly unsubscribeControls: () => void;

  public constructor(container: HTMLElement, bounds: BoardBounds) {
    this.renderer = createRenderer(container);
    this.scene = new Scene();
    this.scene.background = new Color(BACKGROUND);

    const aspect = container.clientWidth / Math.max(container.clientHeight, 1);
    this.camera = createCamera(bounds, aspect);
    this.controls = createControls(this.camera, this.renderer.domElement, bounds);

    this.lights = createLights(bounds);
    this.scene.add(this.lights);

    this.resize = new ResizeHandler(container, this.renderer, this.camera);
    this.loop = new RenderLoop(this.renderer, this.scene, this.camera);
    this.unsubscribeControls = this.loop.onTick(() => {
      this.controls.update();
    });
  }

  /** Re-aims camera, orbit limits and the shadow rig at a board with different bounds. */
  public reframe(bounds: BoardBounds): void {
    const fresh = createCamera(bounds, this.camera.aspect);
    this.camera.position.copy(fresh.position);
    this.camera.near = fresh.near;
    this.camera.far = fresh.far;
    this.camera.updateProjectionMatrix();

    const limits = createControls(fresh, this.renderer.domElement, bounds);
    this.controls.target.copy(limits.target);
    this.controls.minDistance = limits.minDistance;
    this.controls.maxDistance = limits.maxDistance;
    this.controls.maxPolarAngle = limits.maxPolarAngle;
    limits.dispose();
    this.controls.update();

    this.scene.remove(this.lights);
    this.lights = createLights(bounds);
    this.scene.add(this.lights);
  }

  public add(...objects: Object3D[]): void {
    this.scene.add(...objects);
  }

  public start(): void {
    this.loop.start();
  }

  public dispose(): void {
    this.loop.dispose();
    this.unsubscribeControls();
    this.controls.dispose();
    this.resize.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
