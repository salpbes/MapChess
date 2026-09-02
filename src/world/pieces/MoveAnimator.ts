// WHAT: Animates a piece travelling from one point to another along an arc.
// HOW:  Tick-driven from the RenderLoop. Each animation eases position along
//       a straight line in XZ and adds a sine bump in Y whose height grows with
//       distance (capped at one nominal cell), so long moves visibly hop and
//       short ones glide. Resolves a Promise when it lands.
// WHY:  Snapping pieces is disorienting; a lift also reads as "over the terrain"
//       once cells have different heights. Rotation is never animated — the
//       piece stays upright throughout (BUILD_PLAN §2).

import type { Object3D, Vector3 } from 'three';

interface ActiveAnimation {
  readonly object: Object3D;
  readonly from: Vector3;
  readonly to: Vector3;
  readonly arcHeight: number;
  readonly duration: number;
  elapsed: number;
  readonly resolve: () => void;
}

export interface MoveAnimatorOptions {
  /** Metres; used to scale the arc height. */
  readonly unit: number;
  readonly durationSeconds?: number;
}

const DEFAULT_DURATION = 0.45;

export class MoveAnimator {
  private readonly active = new Set<ActiveAnimation>();
  private readonly unit: number;
  private readonly duration: number;

  public constructor(options: MoveAnimatorOptions) {
    this.unit = options.unit;
    this.duration = options.durationSeconds ?? DEFAULT_DURATION;
  }

  public get isAnimating(): boolean {
    return this.active.size > 0;
  }

  public animate(object: Object3D, to: Vector3): Promise<void> {
    const from = object.position.clone();
    const distance = Math.hypot(to.x - from.x, to.z - from.z);
    const arcHeight = Math.min(distance * 0.35, this.unit * 0.8);

    return new Promise((resolve) => {
      this.active.add({
        object,
        from,
        to: to.clone(),
        arcHeight,
        duration: this.duration,
        elapsed: 0,
        resolve,
      });
    });
  }

  public update(deltaSeconds: number): void {
    for (const anim of this.active) {
      anim.elapsed += deltaSeconds;
      const t = Math.min(anim.elapsed / anim.duration, 1);
      const eased = smoothstep(t);

      anim.object.position.lerpVectors(anim.from, anim.to, eased);
      anim.object.position.y += Math.sin(Math.PI * eased) * anim.arcHeight;

      if (t >= 1) {
        anim.object.position.copy(anim.to);
        this.active.delete(anim);
        anim.resolve();
      }
    }
  }

  /** Finishes every animation immediately (used on teardown and resync). */
  public flush(): void {
    for (const anim of this.active) {
      anim.object.position.copy(anim.to);
      anim.resolve();
    }
    this.active.clear();
  }
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}
