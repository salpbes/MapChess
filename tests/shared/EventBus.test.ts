// WHAT: Tests for the typed EventBus.
// HOW:  Subscribes, emits, unsubscribes; checks isolation between events and
//       that a throwing handler does not starve the others.
// WHY:  Every cross-layer message will pass through this; it must be boring
//       and correct.

import { describe, expect, it, vi } from 'vitest';

import { EventBus } from '@shared/events/EventBus';

interface TestEvents extends Record<string, unknown> {
  ping: { n: number };
  text: string;
}

describe('EventBus', () => {
  it('delivers payloads to subscribers of that event only', () => {
    const bus = new EventBus<TestEvents>();
    const ping = vi.fn();
    const text = vi.fn();
    bus.on('ping', ping);
    bus.on('text', text);

    bus.emit('ping', { n: 1 });
    expect(ping).toHaveBeenCalledWith({ n: 1 });
    expect(text).not.toHaveBeenCalled();
  });

  it('stops delivering after unsubscribe', () => {
    const bus = new EventBus<TestEvents>();
    const handler = vi.fn();
    const off = bus.on('text', handler);
    bus.emit('text', 'a');
    off();
    bus.emit('text', 'b');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('keeps dispatching when one handler throws', () => {
    const bus = new EventBus<TestEvents>();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const second = vi.fn();
    bus.on('text', () => {
      throw new Error('boom');
    });
    bus.on('text', second);

    bus.emit('text', 'x');
    expect(second).toHaveBeenCalledWith('x');
    expect(error).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });

  it('tolerates a handler unsubscribing during dispatch', () => {
    const bus = new EventBus<TestEvents>();
    const second = vi.fn();
    const off = bus.on('ping', () => {
      off();
    });
    bus.on('ping', second);
    bus.emit('ping', { n: 2 });
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('emitting with no subscribers is a no-op', () => {
    const bus = new EventBus<TestEvents>();
    expect(() => {
      bus.emit('ping', { n: 0 });
    }).not.toThrow();
  });
});
