// WHAT: One JSON value under one key, typed, on `localStorage`.
// HOW:  `JsonStore<T>` with two implementations: `LocalJsonStore<T>`, which
//       treats every failure — unavailable storage, unparsable text, a value
//       the caller's guard rejects — as "nothing saved", and `MemoryJsonStore<T>`
//       for tests. The guard runs on every read, so an entry written by an
//       older version of the app is a miss rather than a crash.
// WHY:  Saving is a convenience; it must never be able to stop the game from
//       starting. Private-mode browsers throw on `localStorage`, and a
//       half-written entry survives a reload. Both are handled here, once.

export interface JsonStore<T> {
  read(): T | null;
  write(value: T): void;
  clear(): void;
}

export class LocalJsonStore<T> implements JsonStore<T> {
  public constructor(
    private readonly key: string,
    private readonly guard: (value: unknown) => value is T,
  ) {}

  public read(): T | null {
    let text: string | null;
    try {
      text = localStorage.getItem(this.key);
    } catch (error: unknown) {
      console.warn(`Could not read "${this.key}" from local storage.`, error);
      return null;
    }
    if (text === null) return null;

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error: unknown) {
      console.warn(`Discarding unreadable "${this.key}" in local storage.`, error);
      this.clear();
      return null;
    }
    if (!this.guard(parsed)) {
      console.warn(`Discarding "${this.key}": not in a shape this version understands.`);
      this.clear();
      return null;
    }
    return parsed;
  }

  public write(value: T): void {
    try {
      localStorage.setItem(this.key, JSON.stringify(value));
    } catch (error: unknown) {
      // Quota exceeded, or storage disabled: the game carries on unsaved.
      console.warn(`Could not save "${this.key}".`, error);
    }
  }

  public clear(): void {
    try {
      localStorage.removeItem(this.key);
    } catch (error: unknown) {
      console.warn(`Could not clear "${this.key}".`, error);
    }
  }
}

export class MemoryJsonStore<T> implements JsonStore<T> {
  private value: T | null = null;

  public read(): T | null {
    return this.value;
  }

  public write(value: T): void {
    this.value = value;
  }

  public clear(): void {
    this.value = null;
  }
}
