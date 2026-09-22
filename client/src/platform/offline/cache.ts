import { STORE_CACHE, idbGet, idbPut, isIndexedDbAvailable } from "@/platform/offline/db";

/**
 * Tenant-partitioned snapshot cache, so the app is useful with no connectivity.
 *
 * Only operational data a pharmacy needs to keep working offline is stored.
 * Platform-admin data, audit logs, invitations and staff management are never
 * cached: they are online-only by design.
 */
export type CacheEntity =
  | "products"
  | "inventory"
  | "customers"
  | "purchases"
  | "reminders"
  | "suppliers"
  | "purchase_orders"
  | "dashboard"
  | "context";

type CacheRecord<T> = { key: string; tenant: string; entity: CacheEntity; updated_at: string; data: T };

const cacheKey = (tenant: string, entity: CacheEntity) => `${tenant}:${entity}`;

export async function writeCache<T>(tenant: string | null, entity: CacheEntity, data: T) {
  if (!tenant || !isIndexedDbAvailable()) return;
  try {
    await idbPut(STORE_CACHE, {
      key: cacheKey(tenant, entity),
      tenant,
      entity,
      updated_at: new Date().toISOString(),
      data
    } satisfies CacheRecord<T>);
  } catch {
    // A full or blocked IndexedDB must never break the app.
  }
}

export async function readCache<T>(tenant: string | null, entity: CacheEntity): Promise<{ data: T; updated_at: string } | null> {
  if (!tenant || !isIndexedDbAvailable()) return null;
  try {
    const rec = await idbGet<CacheRecord<T>>(STORE_CACHE, cacheKey(tenant, entity));
    if (!rec) return null;
    return { data: rec.data, updated_at: rec.updated_at };
  } catch {
    return null;
  }
}
