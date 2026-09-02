// WHAT: A minimum-interval gate for outbound requests to a shared service.
// HOW:  `acquire()` resolves immediately if enough time has passed since the
//       last release, otherwise after the remaining wait. Callers queue in
//       order; one in flight at a time.
// WHY:  Nominatim (1 req/s) and Overpass are free community services that
//       block abusive clients. During development a hot-reload loop can fire
//       dozens of requests a second; this makes that impossible by construction.

export class RateLimiter {
  private lastStart = Number.NEGATIVE_INFINITY;
  private queue: Promise<void> = Promise.resolve();

  /** @param minIntervalMs smallest allowed gap between the *starts* of two requests. */
  public constructor(
    private readonly minIntervalMs: number,
    private readonly now: () => number = () => Date.now(),
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((r) => setTimeout(r, ms)),
  ) {}

  /** Resolves when the caller may start its request. */
  public acquire(): Promise<void> {
    const turn = this.queue.then(async () => {
      const wait = this.lastStart + this.minIntervalMs - this.now();
      if (wait > 0) await this.sleep(wait);
      this.lastStart = this.now();
    });
    // Keep the chain alive even if a caller's own work later rejects.
    this.queue = turn.catch(() => undefined);
    return turn;
  }
}
