/**
 * Minimal IndexedDB layer for NevOut Meds.
 *
 * Deliberately dependency-free: pharmacies run this on low-end Android phones
 * over expensive 3G, so a spreadsheet-sized library for three object stores is
 * not a good trade.
 *
 * Every record is partitioned by tenant (`pharmacy_id:user_id`). Nothing is read
 * without that prefix, so a second account signing in on the same device cannot
 * see the first account's cached data or queued work.
 */
const DB_NAME = "nevoutmeds";
const DB_VERSION = 1;

export const STORE_CACHE = "cache";
export const STORE_QUEUE = "queue";
export const STORE_META = "meta";

let dbPromise: Promise<IDBDatabase> | null = null;

export function isIndexedDbAvailable() {
  try {
    return typeof indexedDB !== "undefined" && indexedDB !== null;
  } catch {
    return false;
  }
}

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_CACHE)) {
        db.createObjectStore(STORE_CACHE, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(STORE_QUEUE)) {
        const queue = db.createObjectStore(STORE_QUEUE, { keyPath: "local_id" });
        queue.createIndex("by_tenant", "tenant_key", { unique: false });
        queue.createIndex("by_status", "status", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB unavailable"));
    req.onblocked = () => reject(new Error("IndexedDB blocked by another tab"));
  });
  return dbPromise;
}

async function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<any>): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

export async function idbPut(store: string, value: unknown): Promise<void> {
  await tx(store, "readwrite", (s) => s.put(value as any));
}

export async function idbGet<T>(store: string, key: IDBValidKey): Promise<T | null> {
  return (await tx<T | undefined>(store, "readonly", (s) => s.get(key))) ?? null;
}

export async function idbDelete(store: string, key: IDBValidKey): Promise<void> {
  await tx(store, "readwrite", (s) => s.delete(key));
}

export async function idbGetAll<T>(store: string): Promise<T[]> {
  return (await tx<T[]>(store, "readonly", (s) => s.getAll())) ?? [];
}

export async function idbGetAllByIndex<T>(store: string, index: string, value: IDBValidKey): Promise<T[]> {
  const db = await openDb();
  return new Promise<T[]>((resolve, reject) => {
    const t = db.transaction(store, "readonly");
    const req = t.objectStore(store).index(index).getAll(value);
    req.onsuccess = () => resolve((req.result as T[]) ?? []);
    req.onerror = () => reject(req.error);
  });
}

/** `pharmacy_id:user_id` — the partition key for everything stored locally. */
export function tenantKey(pharmacyId?: string | null, userId?: string | null) {
  if (!pharmacyId || !userId) return null;
  return `${pharmacyId}:${userId}`;
}

/** Wipes only this tenant's cached reads. Queued work is never touched here. */
export async function clearTenantCache(key: string) {
  const all = await idbGetAll<{ key: string }>(STORE_CACHE);
  await Promise.all(all.filter((r) => r.key.startsWith(`${key}:`)).map((r) => idbDelete(STORE_CACHE, r.key)));
}
