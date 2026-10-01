// WHAT: What a capture looks like: the taken piece is knocked over, away from
//       the piece that took it, and sinks into its square, while the ground
//       throws up a little of itself — dust from grass, grit from sand, spray
//       from water, leaves from a wood.
// HOW:  Each victim is tipped about its own feet (the model's origin, see
//       loadPieceModels' stand()) on the axis square to the attacker's line,
//       falling faster as it goes, and lowered through the platform's top,
//       which hides it as it sinks; then it is removed. The burst is a few
//       dozen points thrown up and out under gravity, fading. Both are ticked
//       from the render loop and never awaited, so a capture never holds the
//       game up: the next move can be played while the last victim is falling.
// WHY:  A taken piece used to vanish the instant the attacker arrived — the
//       board said what happened and showed nothing. A piece that falls tells
//       you which piece was taken and where, at a glance, and the ground it
//       falls on is the reason this game is on a map.
//
//       Not for a player who has asked for less motion: their captures vanish
//       as they always did.

import {
  BufferAttribute,
  BufferGeometry,
  Box3,
  Color,
  Points,
  PointsMaterial,
  Quaternion,
  Vector3,
} from 'three';
import type { Object3D } from 'three';

import type { Square } from '@domain/board/Square';
import type { CoverName } from '@domain/theme/types';

/**
 * A victim falls, lies still a moment where it fell — long enough to be seen
 * lying there, which is the whole picture — and then sinks. Seconds each.
 */
const FALL_SECONDS = 0.42;
const LIE_SECONDS = 0.3;
const SINK_SECONDS = 0.5;
/** From the blow to the victim gone. */
export const CAPTURE_SECONDS = FALL_SECONDS + LIE_SECONDS + SINK_SECONDS;
/** How far over it goes: nearly flat, not quite, so it reads as fallen rather than laid. */
const FALL_ANGLE = 1.35;
export const BURST_SECONDS = 0.9;
const PARTICLES = 56;
const GRAVITY = 900;
/** Air slows the dust, so it spreads to the square's edges and hangs there rather than flying off. */
const DRAG = 3.2;
/**
 * Where the dust starts, in squares from the middle: at the piece's base, not
 * its centre — dust thrown up inside the piece is hidden by the two pieces.
 */
const RING = 0.17;
/** The sizes above are for a board of 250-unit squares; every board scales them. */
const NOMINAL_CELL = 250;
/** How far the blow carries the victim's feet, in squares: it clears the square for the attacker. */
const SHOVE = 0.45;

interface Fall {
  readonly object: Object3D;
  readonly axis: Vector3;
  readonly start: Quaternion;
  readonly start3: Vector3;
  readonly shove: Vector3;
  readonly depth: number;
  elapsed: number;
}

interface Burst {
  readonly points: Points;
  readonly velocity: Float32Array;
  elapsed: number;
}

/** The colour the ground throws up, and how it throws it. */
const GROUND: Readonly<
  Record<CoverName | 'bare', { readonly color: string; readonly up: number; readonly out: number }>
> = {
  // Light, so it shows against the square it rises from: dry earth over turf,
  // pale grit, white spray, last year's leaves on a dark wood floor.
  grass: { color: '#c9b78c', up: 300, out: 420 },
  sand: { color: '#f3e2b0', up: 260, out: 520 },
  water: { color: '#ffffff', up: 560, out: 300 },
  wood: { color: '#c7a24c', up: 300, out: 440 },
  scrub: { color: '#d2c08c', up: 300, out: 430 },
  bare: { color: '#d0c4b0', up: 260, out: 420 },
};

export class CaptureEffects {
  private readonly falls: Fall[] = [];
  private readonly bursts: Burst[] = [];
  private readonly stillness = window.matchMedia('(prefers-reduced-motion: reduce)');
  private readonly scale: number;
  private groundOf: (square: Square) => CoverName | null = () => null;

  public constructor(unit: number) {
    this.scale = unit / NOMINAL_CELL;
  }

  /** What every square is, for the burst; set with each board. */
  public setGround(groundOf: (square: Square) => CoverName | null): void {
    this.groundOf = groundOf;
  }

  /**
   * Knocks a taken piece over on `square` and lets the ground answer. `from`
   * and `to` are the attacker's travel, so the victim falls away from it.
   */
  public knockOver(victim: Object3D, square: Square, from: Vector3, to: Vector3): void {
    if (this.stillness.matches) {
      victim.removeFromParent();
      return;
    }
    const away = new Vector3(to.x - from.x, 0, to.z - from.z);
    if (away.lengthSq() < 1e-6) away.set(0, 0, -1);
    away.normalize();
    const box = new Box3().setFromObject(victim);
    this.falls.push({
      object: victim,
      // Tipping about this axis brings the top over toward `away`.
      axis: new Vector3(away.z, 0, -away.x),
      start: victim.quaternion.clone(),
      start3: victim.position.clone(),
      shove: away.clone().multiplyScalar(SHOVE * NOMINAL_CELL * this.scale),
      // Lying down, it is as deep as it is wide; its height is ample.
      depth: Math.max(box.max.y - box.min.y, 1) * 0.6,
      elapsed: 0,
    });
    this.burst(victim, this.groundOf(square));
  }

  /** Advances every fall and burst; finished ones are removed. */
  public update(dt: number): void {
    const turn = new Quaternion();
    for (let i = this.falls.length - 1; i >= 0; i -= 1) {
      const fall = this.falls[i];
      if (fall === undefined) continue;
      fall.elapsed += dt;
      const t = Math.min(fall.elapsed / FALL_SECONDS, 1);
      // Falls as things fall: slowly at first, then all at once.
      turn.setFromAxisAngle(fall.axis, FALL_ANGLE * t * t);
      fall.object.quaternion.copy(turn).multiply(fall.start);
      // Carried back by the blow, quickly and then less, out of the attacker's way…
      const carried = 1 - (1 - t) * (1 - t);
      fall.object.position.copy(fall.start3).addScaledVector(fall.shove, carried);
      // …and, after lying there a moment, down through the platform's top.
      const sinking = fall.elapsed - FALL_SECONDS - LIE_SECONDS;
      const sink = Math.min(Math.max(sinking / SINK_SECONDS, 0), 1);
      fall.object.position.y = fall.start3.y - fall.depth * sink * sink;
      if (sink >= 1) {
        fall.object.removeFromParent();
        this.falls.splice(i, 1);
      }
    }

    for (let i = this.bursts.length - 1; i >= 0; i -= 1) {
      const burst = this.bursts[i];
      if (burst === undefined) continue;
      burst.elapsed += dt;
      const position = burst.points.geometry.getAttribute('position') as BufferAttribute;
      const v = burst.velocity;
      const slow = Math.exp(-DRAG * dt);
      for (let p = 0; p < PARTICLES; p += 1) {
        v[p * 3] = (v[p * 3] ?? 0) * slow;
        v[p * 3 + 2] = (v[p * 3 + 2] ?? 0) * slow;
        v[p * 3 + 1] = (v[p * 3 + 1] ?? 0) * slow - GRAVITY * this.scale * dt;
        position.setXYZ(
          p,
          position.getX(p) + (v[p * 3] ?? 0) * dt,
          position.getY(p) + (v[p * 3 + 1] ?? 0) * dt,
          position.getZ(p) + (v[p * 3 + 2] ?? 0) * dt,
        );
      }
      position.needsUpdate = true;
      const material = burst.points.material as PointsMaterial;
      material.opacity = Math.max(0, 1 - burst.elapsed / BURST_SECONDS) * 0.9;
      if (burst.elapsed >= BURST_SECONDS) {
        burst.points.removeFromParent();
        burst.points.geometry.dispose();
        material.dispose();
        this.bursts.splice(i, 1);
      }
    }
  }

  /** How many captures are still falling, for tests. */
  public get falling(): number {
    return this.falls.length;
  }

  private burst(victim: Object3D, ground: CoverName | null): void {
    const parent = victim.parent;
    if (parent === null) return;
    const style = GROUND[ground ?? 'bare'];
    const k = this.scale;
    const positions = new Float32Array(PARTICLES * 3);
    const velocity = new Float32Array(PARTICLES * 3);
    const base = victim.position;
    for (let p = 0; p < PARTICLES; p += 1) {
      const a = (p / PARTICLES) * Math.PI * 2 + Math.random() * 0.4;
      const out = style.out * k * (0.4 + Math.random() * 0.8);
      const r = RING * NOMINAL_CELL * k;
      positions.set([base.x + Math.cos(a) * r, base.y + 4 * k, base.z + Math.sin(a) * r], p * 3);
      velocity.set(
        [Math.cos(a) * out, style.up * k * (0.5 + Math.random() * 0.7), Math.sin(a) * out],
        p * 3,
      );
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    const points = new Points(
      geometry,
      new PointsMaterial({
        color: new Color(style.color),
        size: 24 * k,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      }),
    );
    points.name = 'capture-burst';
    // Bursts move out of their starting bounds at once; never cull them.
    points.frustumCulled = false;
    parent.add(points);
    this.bursts.push({ points, velocity, elapsed: 0 });
  }
}
