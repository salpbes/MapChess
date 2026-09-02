// WHAT: Key → Float32Array persistence for decoded elevation tiles.
// HOW:  `ITileCache` with two implementations: `IndexedDbTileCache` (one
//       object store, structured-clone of the typed array, all failures
//       logged and treated as a miss) and `MemoryTileCache` for tests and
//       for browsers where IndexedDB is unavailable.
// WHY:  BUILD_PLAN Phase 6 — "the second load is instant". Decoded tiles are
//       256 KB each; a 2 km board needs 4–9 of them. A cache miss must never
//       break the game, only slow it, so every IDB error degrades to a miss.

export interface ITileCache {
  get(key: string): Promise<Float32Array | null>;
  put(key: string, data: Float32Array): Promise<void>;
}

export class MemoryTileCache implements ITileCache {
  private readonly map = new Map<string, Float32Array>();

  public get(key: string): Promise<Float32Array | null> {
    return Promise.resolve(this.map.get(key) ?? null);
  }

  public put(key: string, data: Float32Array): Promise<void> {
    this.map.set(key, data);
    return Promise.resolve();
  }

  public get size(): number {
    return this.map.size;
  }
}

const DB_NAME = 'mapchess';
const DB_VERSION = 1;
const STORE = 'elevation-tiles';

export class IndexedDbTileCache implements ITileCache {
  private readonly db: Promise<IDBDatabase | null>;

  public constructor() {
    this.db = openDatabase();
  }

  public async get(key: string): Promise<Float32Array | null> {
    const db = await this.db;
    if (db === null) return null;
    try {
      const result = await request<unknown>(
        db.transaction(STORE, 'readonly').objectStore(STORE).get(key),
      );
      return result instanceof Float32Array ? result : null;
    } catch (error: unknown) {
      console.warn('Tile cache read failed; treating as miss.', error);
      return null;
    }
  }

  public async put(key: string, data: Float32Array): Promise<void> {
    const db = await this.db;
    if (db === null) return;
    try {
      await request(db.transaction(STORE, 'readwrite').objectStore(STORE).put(data, key));
    } catch (error: unknown) {
      console.warn('Tile cache write failed; continuing without caching.', error);
    }
  }
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => {
      resolve(req.result);
    };
    req.onerror = () => {
      console.warn('IndexedDB unavailable; elevation tiles will not be cached.', req.error);
      resolve(null);
    };
    req.onblocked = () => {
      console.warn('IndexedDB open blocked by another tab; continuing without cache.');
      resolve(null);
    };
  });
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => {
      resolve(req.result);
    };
    req.onerror = () => {
      reject(req.error ?? new Error('IndexedDB request failed'));
    };
  });
}
