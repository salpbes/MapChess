// WHAT: The empty stage — composes renderer, camera, lights, controls, resize
//       and the render loop into one object the app can add things to.
// HOW:  Constructor injection of the container and the board bounds; everything
//       else is built from those two. `add()` puts objects in the scene,
//       `start()` begins rendering, `dispose()` tears everything down so Vite
//       hot-reload does not stack canvases.
// WHY:  app/ should say `new WorldStage(container, layout.bounds)` and be done.
//       The individual create* modules stay small and testable by eye; this is
//       the only file that knows they all exist.

import { Color, DirectionalLight, HemisphereLight, Scene } from 'three';
import type { Object3D, PerspectiveCamera, WebGLRenderer } from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import type { BoardBounds } from '@domain/board/types';

import { boardCentre, createCamera, topDownDistance } from './createCamera';
import { createControls } from './createControls';
import {
  STRIKE_SECONDS,
  applyMood,
  lightningAt,
  rainIntensityAt,
  rainsIn,
  thundersIn,
  weather,
  gustAt,
  windDirectionAt,
  windFor,
} from './Atmosphere';
import type { Mood } from './Atmosphere';
import { createLights } from './createLights';
import { Rain } from './Rain';
import { createRenderer } from './createRenderer';
import { RenderLoop } from './RenderLoop';
import { ResizeHandler } from './ResizeHandler';

const BACKGROUND = 0x1a1d21;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Whether the primary pointer is a fingertip. Asked once, at build time, and
 * deliberately as a capability rather than a screen width: a touchscreen
 * laptop and a phone want the same orbit limits, and a narrow window on a
 * desktop does not.
 */
function hasCoarsePointer(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
}

export class WorldStage {
  public readonly scene: Scene;
  public readonly camera: PerspectiveCamera;
  public readonly renderer: WebGLRenderer;
  public readonly controls: OrbitControls;
  public readonly loop: RenderLoop;

  private readonly resize: ResizeHandler;
  private lights: Object3D;
  private weather: Mood = 'midday';
  private bounds: BoardBounds;
  /** Asked once and kept: reframe must not quietly hand a phone the mouse's limits. */
  private readonly coarsePointer: boolean;
  private readonly unsubscribeControls: () => void;
  private readonly rain: Rain;
  private readonly stopWeatherClock: () => void;
  /**
   * A player who has asked their device for less motion gets the storm's sky
   * and light, and none of the falling rain or swaying trees.
   */
  private readonly stillness = window.matchMedia('(prefers-reduced-motion: reduce)');
  private readonly onStillnessChanged = (): void => {
    this.applyMotion();
  };

  public constructor(container: HTMLElement, bounds: BoardBounds) {
    this.renderer = createRenderer(container);
    this.scene = new Scene();
    this.scene.background = new Color(BACKGROUND);

    const aspect = container.clientWidth / Math.max(container.clientHeight, 1);
    this.camera = createCamera(bounds, aspect);
    this.coarsePointer = hasCoarsePointer();
    this.controls = createControls(this.camera, this.renderer.domElement, bounds, {
      coarsePointer: this.coarsePointer,
    });

    this.lights = createLights(bounds);
    this.scene.add(this.lights);
    // A new rig is built at the old rig's defaults; the weather goes back on it.
    applyMood(this.scene, this.lights, bounds, this.weather);
    this.bounds = bounds;

    this.resize = new ResizeHandler(container, this.renderer, this.camera);
    this.loop = new RenderLoop(this.renderer, this.scene, this.camera);
    this.unsubscribeControls = this.loop.onTick(() => {
      this.clampTarget();
      this.controls.update();
    });

    // Fewer drops on a phone, where the storm is smaller on screen anyway.
    this.rain = new Rain(this.coarsePointer ? 1600 : 3200);
    this.rain.fit(bounds);
    this.scene.add(this.rain.mesh);
    this.stopWeatherClock = this.loop.onTick((dt) => {
      weather.time.value += dt;
      const dir = windDirectionAt(weather.time.value);
      weather.windDir.value.set(dir.x, dir.z);
      weather.wind.value = this.baseWind * gustAt(weather.time.value);
      weather.rain.value = rainIntensityAt(weather.time.value);
      this.tickLightning(dt);
    });
    this.stillness.addEventListener('change', this.onStillnessChanged);
    this.applyMotion();
  }

  /** Re-aims camera, orbit limits and the shadow rig at a board with different bounds. */
  public reframe(bounds: BoardBounds): void {
    const fresh = createCamera(bounds, this.camera.aspect);
    this.camera.position.copy(fresh.position);
    this.camera.near = fresh.near;
    this.camera.far = fresh.far;
    this.camera.updateProjectionMatrix();

    const limits = createControls(fresh, this.renderer.domElement, bounds, {
      coarsePointer: this.coarsePointer,
    });
    this.controls.target.copy(limits.target);
    this.controls.minDistance = limits.minDistance;
    this.controls.maxDistance = limits.maxDistance;
    this.controls.maxPolarAngle = limits.maxPolarAngle;
    limits.dispose();
    this.controls.update();

    this.scene.remove(this.lights);
    this.lights = createLights(bounds);
    this.scene.add(this.lights);
    // A new rig is built at the old rig's defaults; the weather goes back on it.
    applyMood(this.scene, this.lights, bounds, this.weather);
    this.rain.fit(bounds);
    this.bounds = bounds;
  }

  /** The weather over the board. */
  public get mood(): Mood {
    return this.weather;
  }

  public setMood(mood: Mood): void {
    this.weather = mood;
    applyMood(this.scene, this.lights, this.bounds, mood);
    this.applyMotion();
  }

  /** How hard the wind is blowing right now, 0 to 1 — 0 whenever motion is reduced. */
  public get wind(): number {
    return this.baseWind;
  }

  /** The mood's wind, before gusts; 0 whenever motion is reduced. */
  private baseWind = 0;

  /**
   * A lightning strike, if this is weather that has lightning and the player
   * has not asked for less motion. Returns whether it struck, so the thunder
   * can follow it. The light is lifted along `lightningAt` and handed back to
   * the mood's own values the moment the strike is over.
   */
  public flash(near = false): boolean {
    if (this.stillness.matches || !thundersIn(this.weather)) return false;
    this.strikeAt = 0;
    this.strikeNear = near;
    this.strikes += 1;
    return true;
  }

  /** A close strike lights the board harder — the same two flickers, no more. */
  private strikeNear = false;

  /** How hard it is raining right now, MEDIUM_RAIN to 1 — the sound follows it too. */
  public get rainIntensity(): number {
    return weather.rain.value;
  }

  /** The weather's clock in seconds, for tests that wait on the wind. */
  public get weatherClock(): number {
    return weather.time.value;
  }

  /** Strikes since the page opened, for tests. */
  public get lightningStrikes(): number {
    return this.strikes;
  }

  private strikeAt: number | null = null;
  private strikes = 0;

  private tickLightning(dt: number): void {
    if (this.strikeAt === null) return;
    this.strikeAt += dt;
    const glow = lightningAt(this.strikeAt);
    // Re-applying the mood restores every light to its own value; the glow
    // then lifts the sky light and the sun on top of it.
    applyMood(this.scene, this.lights, this.bounds, this.weather);
    if (glow > 0) {
      this.lights.traverse((node) => {
        const lift = this.strikeNear ? 1.35 : 1;
        if (node instanceof HemisphereLight) node.intensity *= 1 + 1.6 * lift * glow;
        else if (node instanceof DirectionalLight && node.castShadow) {
          node.intensity *= 1 + 1.2 * lift * glow;
        }
      });
    }
    if (this.strikeAt > STRIKE_SECONDS) this.strikeAt = null;
  }

  /** Whether it is raining right now — false whenever motion is reduced. */
  public get raining(): boolean {
    return this.rain.mesh.visible;
  }

  private applyMotion(): void {
    const still = this.stillness.matches;
    this.baseWind = still ? 0 : windFor(this.weather);
    weather.wind.value = this.baseWind * gustAt(weather.time.value);
    this.rain.mesh.visible = !still && rainsIn(this.weather);
  }

  /**
   * Looks straight down at the whole board.
   *
   * A tilted view is what makes the terrain readable, and it is also what makes
   * a chessboard hard to read: ranks foreshorten and the far side is the part
   * you are worst at judging. This is the other view, one press away — the
   * board as a board, with the landscape flattened into a map of itself.
   */
  public lookDown(): void {
    const b = this.bounds;
    const centre = boardCentre(b);
    const height = topDownDistance(b.maxX - b.minX, this.camera.aspect);

    this.controls.target.copy(centre);
    /*
      A hair to the south rather than exactly overhead: straight down leaves
      OrbitControls with no azimuth to keep, and the first drag afterwards
      snaps the board round to an arbitrary heading.
    */
    this.camera.position.set(centre.x, centre.y + height, centre.z + height * 0.002);
    this.camera.lookAt(centre);
    this.controls.maxDistance = Math.max(this.controls.maxDistance, height * 1.25);
    this.controls.update();
  }

  /**
   * Panning is free movement, and free movement means the board can be pushed
   * off screen with no way back but a reload. The target is kept within half a
   * board of the edge: enough to look along a coastline from outside it, not
   * enough to lose the game.
   */
  private clampTarget(): void {
    const b = this.bounds;
    const margin = (b.maxX - b.minX) * 0.5;
    const t = this.controls.target;
    t.x = clamp(t.x, b.minX - margin, b.maxX + margin);
    t.z = clamp(t.z, b.minZ - margin, b.maxZ + margin);
    t.y = clamp(t.y, b.minY, b.maxY);
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
    this.stopWeatherClock();
    this.stillness.removeEventListener('change', this.onStillnessChanged);
    this.rain.dispose();
    this.controls.dispose();
    this.resize.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
