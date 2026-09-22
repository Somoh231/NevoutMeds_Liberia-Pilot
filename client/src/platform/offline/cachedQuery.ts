import { readCache, writeCache, type CacheEntity } from "@/platform/offline/cache";

/**
 * Wraps a fetcher so the last good result is kept on the device.
 *
 * Online: fetch, then persist the snapshot.
 * Offline or unreachable: serve the snapshot for this tenant, so the pharmacy
 * keeps working. Returns null data only when there is no snapshot yet.
 */
export async function fetchWithCache<T>(args: {
  tenant: string | null;
  entity: CacheEntity;
  fetcher: () => Promise<T>;
}): Promise<T> {
  const { tenant, entity, fetcher } = args;
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;

  if (!offline) {
    try {
      const data = await fetcher();
      void writeCache(tenant, entity, data);
      return data;
    } catch (e) {
      const cached = await readCache<T>(tenant, entity);
      if (cached) return cached.data;
      throw e;
    }
  }

  const cached = await readCache<T>(tenant, entity);
  if (cached) return cached.data;
  throw new Error("This information is not available offline yet. Reconnect once to download it.");
}
