// WHAT: Key → value persistence, typed per store, on IndexedDB.
// HOW:  `KeyValueStore<T>` with two implementations: `IndexedDbStore<T>` (one
//       shared database, one object store per kind of data, every failure
//       logged and treated as a miss) and `MemoryStore<T>` for tests and for
//       browsers without IndexedDB. Values must be structured-cloneable; the
//       caller supplies a runtime guard for reads so a corrupt entry is a miss,
//       not a crash.
// WHY:  BUILD_PLAN Phase 6/7 — second loads must be instant, and Overpass must
//       not be re-asked for an area it has already answered. A cache problem
//       must never break the game, only slow it.

export interface KeyValueStore<T> {
  get(key: string): Promise<T | null>;
  put(key: string, value: T): Promise<void>;
}

export class MemoryStore<T> implements KeyValueStore<T> {
  private readonly map = new Map<string, T>();

  public get(key: string): Promise<T | null> {
    return Promise.resolve(this.map.get(key) ?? null);
  }

  public put(key: string, value: T): Promise<void> {
    this.map.set(key, value);
    return Promise.resolve();
  }

  public get size(): number {
    return this.map.size;
  }
}

const DB_NAME = 'mapchess';
/** Bump when adding a store; `onupgradeneeded` creates any that are missing. */
const DB_VERSION = 2;

export const STORES = {
  elevationTiles: 'elevation-tiles',
  features: 'features',
} as const;

export type StoreName = (typeof STORES)[keyof typeof STORES];

let sharedDb: Promise<IDBDatabase | null> | null = null;

export class IndexedDbStore<T> implements KeyValueStore<T> {
  public constructor(
    private readonly store: StoreName,
    private readonly isValid: (value: unknown) => value is T,
  ) {
    sharedDb ??= openDatabase();
  }

  public async get(key: string): Promise<T | null> {
    const db = await (sharedDb ?? Promise.resolve(null));
    if (db === null) return null;
    try {
      const value: unknown = await request(
        db.transaction(this.store, 'readonly').objectStore(this.store).get(key),
      );
      return this.isValid(value) ? value : null;
    } catch (error: unknown) {
      console.warn(`Cache read failed (${this.store}); treating as miss.`, error);
      return null;
    }
  }

  public async put(key: string, value: T): Promise<void> {
    const db = await (sharedDb ?? Promise.resolve(null));
    if (db === null) return;
    try {
      await request(
        db.transaction(this.store, 'readwrite').objectStore(this.store).put(value, key),
      );
    } catch (error: unknown) {
      console.warn(`Cache write failed (${this.store}); continuing without caching.`, error);
    }
  }
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      for (const name of Object.values(STORES)) {
        if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name);
      }
    };
    req.onsuccess = () => {
      resolve(req.result);
    };
    req.onerror = () => {
      console.warn('IndexedDB unavailable; nothing will be cached.', req.error);
      resolve(null);
    };
    req.onblocked = () => {
      console.warn('IndexedDB open blocked by another tab; continuing without cache.');
      resolve(null);
    };
  });
}

function request<R>(req: IDBRequest<R>): Promise<R> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => {
      resolve(req.result);
    };
    req.onerror = () => {
      reject(req.error ?? new Error('IndexedDB request failed'));
    };
  });
}
