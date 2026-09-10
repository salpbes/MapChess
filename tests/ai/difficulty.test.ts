// WHAT: Tests for the difficulty table and the UCI it turns into.
// HOW:  Pure functions over the settings — no engine, no worker. Checks that
//       every level is present and ordered, and that the option lines say what
//       they should for each of the two weakening mechanisms.
// WHY:  A difficulty level is a handful of numbers with no compiler to check
//       them, and getting one wrong is invisible: the engine ignores an option
//       it does not recognise and plays on at whatever strength it had. The
//       first version of this table looked correct and was far too strong.

import { describe, expect, it } from 'vitest';

import { DIFFICULTIES } from '@ai/IChessAI';
import type { Difficulty } from '@ai/IChessAI';
import { DIFFICULTY_SETTINGS, goCommand, optionCommands } from '@ai/difficulty';

/** Anything the engine advertises is allowed through. */
const ALL: ReadonlySet<string> = new Set([
  'Skill Level',
  'UCI_LimitStrength',
  'UCI_Elo',
  'Hash',
  'Threads',
]);

function commands(level: Difficulty, supported: ReadonlySet<string> = ALL): readonly string[] {
  return optionCommands(DIFFICULTY_SETTINGS[level], supported);
}

describe('DIFFICULTY_SETTINGS', () => {
  it('covers every level the UI can offer', () => {
    for (const level of DIFFICULTIES) {
      expect(DIFFICULTY_SETTINGS[level], level).toBeDefined();
    }
    expect(Object.keys(DIFFICULTY_SETTINGS).sort()).toEqual([...DIFFICULTIES].sort());
  });

  it('lists the levels weakest first', () => {
    // A crude but honest ordering: depth-limited levels are weaker than any
    // rating-limited one, which is weaker than the unrestricted engine.
    const rank = (level: Difficulty): number => {
      const s = DIFFICULTY_SETTINGS[level];
      if (s.search.kind === 'depth') return s.search.plies;
      return s.strength.kind === 'elo' ? 100 + s.strength.rating / 100 : 1000;
    };
    const ranks = DIFFICULTIES.map(rank);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });

  it('caps depth on the two easiest levels, because Skill Level alone did not', () => {
    expect(DIFFICULTY_SETTINGS.learner.search).toEqual({ kind: 'depth', plies: 1 });
    expect(DIFFICULTY_SETTINGS.beginner.search.kind).toBe('depth');
    // UCI_Elo cannot go below 1320, so it cannot be what makes these weak.
    expect(DIFFICULTY_SETTINGS.learner.strength).toEqual({ kind: 'skill', level: 0 });
  });

  it('never asks UCI_Elo for a rating the engine will not accept', () => {
    for (const level of DIFFICULTIES) {
      const { strength } = DIFFICULTY_SETTINGS[level];
      if (strength.kind !== 'elo') continue;
      expect(strength.rating, level).toBeGreaterThanOrEqual(1320);
      expect(strength.rating, level).toBeLessThanOrEqual(3190);
    }
  });

  it('gives the weak levels a pause, so an instant reply does not look broken', () => {
    expect(DIFFICULTY_SETTINGS.learner.minThinkMs).toBeGreaterThan(0);
    expect(DIFFICULTY_SETTINGS.beginner.minThinkMs).toBeGreaterThan(0);
    expect(DIFFICULTY_SETTINGS.strong.minThinkMs).toBe(0);
  });

  it('allows a search at least as long as the budget the watchdog uses', () => {
    for (const level of DIFFICULTIES) {
      const s = DIFFICULTY_SETTINGS[level];
      if (s.search.kind === 'movetime')
        expect(s.budgetMs, level).toBeGreaterThanOrEqual(s.search.ms);
      else expect(s.budgetMs, level).toBeGreaterThan(0);
    }
  });
});

describe('goCommand', () => {
  it('limits by time or by depth, as the level asks', () => {
    expect(goCommand(DIFFICULTY_SETTINGS.learner)).toBe('go depth 1');
    expect(goCommand(DIFFICULTY_SETTINGS.strong)).toBe('go movetime 1500');
  });
});

describe('optionCommands', () => {
  it('turns strength limiting on with a rating', () => {
    expect(commands('casual')).toContain('setoption name UCI_LimitStrength value true');
    expect(commands('casual')).toContain('setoption name UCI_Elo value 1320');
  });

  it('turns strength limiting off again for a skill-based level', () => {
    // It persists in the engine, so switching from Casual to Strong must clear it.
    expect(commands('strong')).toContain('setoption name UCI_LimitStrength value false');
    expect(commands('strong')).toContain('setoption name Skill Level value 20');
    expect(commands('strong').join(' ')).not.toContain('UCI_Elo');
  });

  it('never sends both mechanisms at once', () => {
    for (const level of DIFFICULTIES) {
      const text = commands(level).join(' ');
      expect(text.includes('Skill Level') && text.includes('UCI_Elo'), level).toBe(false);
    }
  });

  it('skips options the engine did not advertise', () => {
    const spartan = new Set(['Hash']);
    expect(commands('casual', spartan)).toEqual(['setoption name Hash value 16']);
  });

  it('sends everything when the engine advertised nothing, rather than nothing at all', () => {
    // An empty set means the handshake told us nothing; assume a normal build.
    expect(commands('strong', new Set()).length).toBeGreaterThan(0);
  });
});

describe('one engine, three callers', () => {
  /**
   * The adapter's own queue is what stops a hint or an assessment stealing the
   * search the opponent is waiting on. This models the failure it was written
   * for: two callers passing the same "is anything pending?" check across an
   * await, and the later one overwriting the earlier one's slot.
   */
  it('a slot claimed after an await is not safe to check before it', async () => {
    let slot: string | null = null;
    const claim = async (name: string): Promise<string> => {
      // The shape the adapter used to have: check, yield, then claim.
      if (slot !== null) throw new Error('busy');
      await Promise.resolve();
      slot = name;
      return name;
    };
    await Promise.all([claim('move'), claim('hint')]);
    // Both passed the check; the second overwrote the first.
    expect(slot).toBe('hint');
  });

  it('a queue lets each one finish before the next begins', async () => {
    let chain: Promise<unknown> = Promise.resolve();
    let slot: string | null = null;
    const order: string[] = [];
    const enqueue = <T>(work: () => Promise<T>): Promise<T> => {
      const run = chain.then(work, work);
      chain = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    };
    const claim = (name: string): Promise<void> =>
      enqueue(async () => {
        expect(slot, `${name} found the slot taken`).toBeNull();
        slot = name;
        await Promise.resolve();
        order.push(name);
        slot = null;
      });

    await Promise.all([claim('move'), claim('hint'), claim('assessment')]);
    expect(order).toEqual(['move', 'hint', 'assessment']);
    expect(slot).toBeNull();
  });

  it('keeps going after one caller fails', async () => {
    let chain: Promise<unknown> = Promise.resolve();
    const enqueue = <T>(work: () => Promise<T>): Promise<T> => {
      const run = chain.then(work, work);
      chain = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    };
    const failed = enqueue(() => Promise.reject(new Error('engine gone')));
    await expect(failed).rejects.toThrow('engine gone');
    // A rejected caller must not stop the queue for everyone after it.
    await expect(enqueue(() => Promise.resolve('next'))).resolves.toBe('next');
  });
});
