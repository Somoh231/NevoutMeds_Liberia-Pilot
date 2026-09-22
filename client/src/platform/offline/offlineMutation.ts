import { getSupabaseDb } from "@/platform/data/supabaseDb";
import { newIdempotencyKey, type MutationType } from "@/platform/offline/queue";

/**
 * Runs an offline-capable write.
 *
 * Online: sent straight away with an idempotency key, so a lost response can be
 * retried without creating a second purchase.
 * Offline (or the request never reaches the server): queued durably and reported
 * back as "queued", never as "saved".
 */
export type WriteOutcome<T> =
  | { status: "synced"; data: T }
  | { status: "queued"; idempotencyKey: string };

const RPC_FOR: Record<MutationType, string> = {
  record_purchase: "record_purchase_idempotent",
  adjust_stock: "adjust_stock_idempotent",
  create_customer: "create_customer_idempotent",
  create_reminder: "create_reminder_idempotent",
  create_product: "create_product_idempotent",
  create_purchase_order: "create_purchase_order_idempotent"
};

function isOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

export function isNetworkFailure(error: unknown) {
  const message = (error as { message?: string })?.message ?? "";
  return /failed to fetch|network|timeout|load failed|offline|fetch failed/i.test(message);
}

export async function runOfflineCapableWrite<T>(args: {
  type: MutationType;
  payload: Record<string, unknown>;
  summary: string;
  queueMutation: (a: { type: MutationType; payload: Record<string, unknown>; summary: string }) => Promise<string>;
}): Promise<WriteOutcome<T>> {
  const { type, payload, summary, queueMutation } = args;

  if (isOffline()) {
    const key = await queueMutation({ type, payload, summary });
    return { status: "queued", idempotencyKey: key };
  }

  const idempotencyKey = newIdempotencyKey();
  try {
    const db = getSupabaseDb();
    const { data, error } = await db.rpc(RPC_FOR[type], { ...payload, p_idempotency_key: idempotencyKey });
    if (error) {
      // The server answered and refused: a real validation/permission problem
      // the person must see now, not silent queueing.
      if (!isNetworkFailure(error)) throw error;
      const key = await queueMutation({ type, payload, summary });
      return { status: "queued", idempotencyKey: key };
    }
    return { status: "synced", data: data as T };
  } catch (e) {
    if (isNetworkFailure(e)) {
      const key = await queueMutation({ type, payload, summary });
      return { status: "queued", idempotencyKey: key };
    }
    throw e;
  }
}
