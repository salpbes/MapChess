// WHAT: Birds over the board on a fine day — now and then a loose flock passing
//       high over, or a single big bird circling on the warm air — and their
//       small shadows sliding over the squares beneath them.
// HOW:  A handful of tiny meshes, each a body and two wings hinged at the
//       shoulder, moved on the CPU: there are never more than seven. A flock
//       flies a loose V along a gently bending line from one side of the board
//       to the other; a soarer wheels in wide circles for half a minute and
//       then drifts away. Each bird flaps a little and glides a while, as birds
//       do, and banks into its turns. A new visit comes along every half
//       minute to a minute and a half, never two at once.
// WHY:  A sunny board was a still picture of a fine day. Something alive in
//       the sky, passing over the ground the game is played on, says this is a
//       real place on a real day — and their shadows cross the board the way a
//       bird's does over a field. High and small, so they never pass between a
//       player and a piece; seldom, so they are a pleasure and not traffic.
//
//       Not for a player who has asked for less motion: they are nothing but
//       motion.

import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshLambertMaterial,
  SphereGeometry,
  Vector3,
} from 'three';

import type { BoardBounds } from '@domain/board/types';

export type Visit = 'flock' | 'soarer';

/** A gull's wingspan here, as a share of the board's width: small, but a bird and not a speck. */
const SPAN = 0.022;
/** Board widths a second. */
const FLOCK_SPEED = 0.075;
const SOAR_SPEED = 0.045;
const SOAR_SECONDS = 30;
/** Seconds between one visit leaving and the next arriving. */
const QUIET = { min: 30, max: 90 } as const;

interface Bird {
  readonly body: Group;
  readonly left: Group;
  readonly right: Group;
  /** Where it flies relative to the leader: across, behind, and a little up or down. */
  readonly offset: Vector3;
  /** Flapping, or gliding, until `until`. */
  flapping: boolean;
  until: number;
  phase: number;
  readonly bob: number;
}

interface Flight {
  readonly kind: Visit;
  readonly birds: Bird[];
  readonly position: Vector3;
  heading: number;
  turn: number;
  elapsed: number;
  /** Where the soarer wheels, and when it began to; it circles for SOAR_SECONDS. */
  readonly centre: Vector3;
  readonly radius: number;
  circlingSince: number | null;
  /** Whether it has been over the board yet: it leaves only once it has. */
  arrived: boolean;
}

/**
 * One wing, for a bird facing +z with its left along +x: a swept triangle from
 * the shoulder's leading edge out to the tip, swept back, and in to the
 * shoulder's trailing edge.
 */
function wingGeometry(span: number): BufferGeometry {
  const half = span / 2;
  const chord = span * 0.22;
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    'position',
    new BufferAttribute(
      new Float32Array([0, 0, chord * 0.5, half, 0, -chord * 0.35, 0, 0, -chord * 0.6]),
      3,
    ),
  );
  geometry.computeVertexNormals();
  return geometry;
}

export class Birds {
  public readonly group = new Group();
  private readonly material = new MeshLambertMaterial({ color: '#34322f', side: DoubleSide });
  private readonly wing: BufferGeometry;
  private readonly bodyGeometry: SphereGeometry;
  private flight: Flight | null = null;
  private bounds: BoardBounds | null = null;
  private width = 1;
  private wait = 6 + Math.random() * 8;
  private active = false;
  private arrivals: ((kind: Visit) => void)[] = [];

  public constructor() {
    this.group.name = 'birds';
    this.wing = wingGeometry(1);
    this.bodyGeometry = new SphereGeometry(0.06, 6, 4);
    this.bodyGeometry.scale(1, 0.8, 3.2);
  }

  public fit(bounds: BoardBounds): void {
    this.bounds = bounds;
    this.width = bounds.maxX - bounds.minX;
    this.clear();
  }

  /** Birds come only in fair weather, and never while motion is reduced. */
  public setActive(active: boolean): void {
    this.active = active;
    if (!active) this.clear();
  }

  /** Told when a visit first comes over the board, so it can be heard. */
  public onArrival(listener: (kind: Visit) => void): () => void {
    this.arrivals.push(listener);
    return () => {
      this.arrivals = this.arrivals.filter((l) => l !== listener);
    };
  }

  /** Sends a visit now, whatever the wait; for tests. False if birds are not about. */
  public send(kind: Visit = 'flock'): boolean {
    if (!this.active || this.bounds === null) return false;
    this.clear();
    // From just off the board's edge, not from far out: a visit asked for is
    // over the board within a couple of seconds, however slow the frames.
    this.launch(kind, 0.62);
    return true;
  }

  /** How many birds are in the sky right now. */
  public get flying(): number {
    return this.flight?.birds.length ?? 0;
  }

  /** What is in the sky, if anything. */
  public get visiting(): Visit | null {
    return this.flight?.kind ?? null;
  }

  public update(dt: number): void {
    if (!this.active || this.bounds === null) return;
    const flight = this.flight;
    if (flight === null) {
      this.wait -= dt;
      if (this.wait <= 0) this.launch(Math.random() < 0.35 ? 'soarer' : 'flock');
      return;
    }
    flight.elapsed += dt;
    this.steer(flight, dt);
    this.place(flight, dt);

    const over = this.isOverBoard(flight.position, 0);
    if (over && !flight.arrived) {
      flight.arrived = true;
      for (const listener of this.arrivals) listener(flight.kind);
    }
    if (flight.arrived && !this.isOverBoard(flight.position, this.width * 0.9)) {
      this.clear();
      this.wait = QUIET.min + Math.random() * (QUIET.max - QUIET.min);
    }
  }

  public dispose(): void {
    this.clear();
    this.wing.dispose();
    this.bodyGeometry.dispose();
    this.material.dispose();
    this.group.removeFromParent();
  }

  /** `from` is how far out it starts, in board widths from the middle. */
  private launch(kind: Visit, from = 1.1): void {
    const b = this.bounds;
    if (b === null) return;
    const w = this.width;
    const cx = (b.minX + b.maxX) / 2;
    const cz = (b.minZ + b.maxZ) / 2;
    // In from the east or the west, mostly, aimed somewhere over the board: a
    // bird crossing the view is seen crossing, one flying straight at the
    // camera or away from it hardly seems to move.
    const bearing = (Math.random() < 0.5 ? 0 : Math.PI) + (Math.random() - 0.5) * 1.1;
    const start = new Vector3(
      cx + Math.cos(bearing) * w * from,
      0,
      cz + Math.sin(bearing) * w * from,
    );
    const aim = new Vector3(
      cx + (Math.random() - 0.5) * w * 0.4,
      0,
      cz + (Math.random() - 0.5) * w * 0.4,
    );
    start.y = b.maxY + w * (kind === 'soarer' ? 0.22 : 0.2 + Math.random() * 0.08);
    const heading = Math.atan2(aim.z - start.z, aim.x - start.x);

    const count = kind === 'soarer' ? 1 : 3 + Math.floor(Math.random() * 5);
    const span = w * SPAN * (kind === 'soarer' ? 1.6 : 1);
    const birds: Bird[] = [];
    for (let i = 0; i < count; i += 1) {
      // A loose V: alternate sides, each pair a little farther back.
      const rank = Math.ceil(i / 2);
      const side = i % 2 === 0 ? 1 : -1;
      const offset = new Vector3(
        -rank * span * 1.6 + (Math.random() - 0.5) * span * 0.6,
        (Math.random() - 0.5) * span * 0.8,
        i === 0 ? 0 : side * rank * span * 1.3 + (Math.random() - 0.5) * span * 0.5,
      );
      birds.push(this.makeBird(span, offset));
    }
    this.flight = {
      kind,
      birds,
      position: start,
      heading,
      // A flock's line bends a little; a soarer makes straight for its circle.
      turn: kind === 'soarer' ? 0 : (Math.random() - 0.5) * 0.08,
      elapsed: 0,
      centre: new Vector3(aim.x, start.y, aim.z),
      // Centre within a fifth of the middle, radius at most a quarter: the
      // whole circle lies over the board, so a soarer wheels where it is seen.
      radius: w * (0.15 + Math.random() * 0.1),
      circlingSince: null,
      arrived: false,
    };
  }

  private makeBird(span: number, offset: Vector3): Bird {
    const body = new Group();
    const torso = new Mesh(this.bodyGeometry, this.material);
    torso.scale.setScalar(span);
    torso.castShadow = true;
    body.add(torso);
    const left = new Group();
    const right = new Group();
    const leftWing = new Mesh(this.wing, this.material);
    leftWing.scale.setScalar(span);
    leftWing.castShadow = true;
    const rightWing = leftWing.clone();
    // The wing is built along +x; the right one is the left one mirrored.
    rightWing.scale.x = -span;
    left.add(leftWing);
    right.add(rightWing);
    body.add(left, right);
    this.group.add(body);
    return {
      body,
      left,
      right,
      offset,
      flapping: Math.random() < 0.5,
      until: Math.random() * 1.5,
      phase: Math.random() * Math.PI * 2,
      bob: Math.random() * Math.PI * 2,
    };
  }

  private steer(flight: Flight, dt: number): void {
    if (
      flight.kind === 'soarer' &&
      flight.circlingSince === null &&
      Math.hypot(flight.position.x - flight.centre.x, flight.position.z - flight.centre.z) <
        flight.radius
    ) {
      flight.circlingSince = flight.elapsed;
    }
    const speed = (flight.kind === 'soarer' ? SOAR_SPEED : FLOCK_SPEED) * this.width;
    if (this.isCircling(flight)) {
      // Wheeling round its centre: held on the circle, flying along it.
      const c = flight.centre;
      const around =
        Math.atan2(flight.position.z - c.z, flight.position.x - c.x) + (speed / flight.radius) * dt;
      flight.position.x = c.x + Math.cos(around) * flight.radius;
      flight.position.z = c.z + Math.sin(around) * flight.radius;
      flight.heading = around + Math.PI / 2;
      return;
    }
    flight.heading += flight.turn * dt;
    flight.position.x += Math.cos(flight.heading) * speed * dt;
    flight.position.z += Math.sin(flight.heading) * speed * dt;
  }

  private place(flight: Flight, dt: number): void {
    const cos = Math.cos(flight.heading);
    const sin = Math.sin(flight.heading);
    const wheeling = this.isCircling(flight);
    for (const bird of flight.birds) {
      // Offsets are in the leader's frame: x forward, z to its right.
      const o = bird.offset;
      bird.body.position.set(
        flight.position.x + o.x * cos - o.z * sin,
        flight.position.y + o.y + Math.sin(flight.elapsed * 1.3 + bird.bob) * this.width * 0.002,
        flight.position.z + o.x * sin + o.z * cos,
      );
      // Facing its heading (the body is built along z), banked into a turn.
      bird.body.rotation.set(0, Math.PI / 2 - flight.heading, wheeling ? -0.35 : 0, 'YXZ');

      bird.until -= dt;
      if (bird.until <= 0) {
        bird.flapping = !bird.flapping;
        // A soarer hardly ever flaps; a flock flaps more than it glides.
        bird.until = bird.flapping
          ? (flight.kind === 'soarer' ? 0.6 : 1.2) + Math.random() * 1.2
          : (flight.kind === 'soarer' ? 6 : 1) + Math.random() * 2;
      }
      bird.phase += dt * (flight.kind === 'soarer' ? 6 : 9);
      // Held a little raised in a glide; beating through it while flapping.
      const lift = bird.flapping ? Math.sin(bird.phase) * 0.65 : 0.12;
      bird.left.rotation.z = lift;
      bird.right.rotation.z = -lift;
    }
  }

  private isCircling(flight: Flight): boolean {
    return flight.circlingSince !== null && flight.elapsed - flight.circlingSince < SOAR_SECONDS;
  }

  private isOverBoard(p: Vector3, margin: number): boolean {
    const b = this.bounds;
    if (b === null) return false;
    return (
      p.x > b.minX - margin &&
      p.x < b.maxX + margin &&
      p.z > b.minZ - margin &&
      p.z < b.maxZ + margin
    );
  }

  private clear(): void {
    for (const bird of this.flight?.birds ?? []) bird.body.removeFromParent();
    this.flight = null;
  }
}
