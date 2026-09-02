// WHAT: A minimal, fully typed publish/subscribe bus.
// HOW:  Generic over an event map `{ name: payload }`. `on` returns an
//       unsubscribe function. Handlers that throw are reported via
//       `console.error` and do not stop the other handlers.
// WHY:  BUILD_PLAN §5 — cross-layer communication goes through a typed event
//       bus. The game layer emits "a move was played"; the UI and, later, the
//       save system listen. None of them import each other.

export type EventMap = Record<string, unknown>;

export type Handler<T> = (payload: T) => void;

export class EventBus<Events extends EventMap> {
  private readonly handlers = new Map<keyof Events, Set<Handler<never>>>();

  public on<K extends keyof Events>(event: K, handler: Handler<Events[K]>): () => void {
    let set = this.handlers.get(event);
    if (set === undefined) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler);
    return () => {
      set.delete(handler);
    };
  }

  public emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this.handlers.get(event);
    if (set === undefined) return;
    // Copy so a handler that unsubscribes during dispatch does not skip others.
    for (const handler of [...set]) {
      try {
        (handler as Handler<Events[K]>)(payload);
      } catch (error: unknown) {
        console.error(`Event handler for "${String(event)}" threw:`, error);
      }
    }
  }

  public clear(): void {
    this.handlers.clear();
  }
}
