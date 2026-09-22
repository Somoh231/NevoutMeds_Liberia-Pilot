import type { UUID } from "@/platform/db/types";
import { getSupabaseDb } from "@/platform/data/supabaseDb";

export async function createPurchaseOrder(args: {
  pharmacyId: UUID;
  supplierId: UUID;
  createdBy: UUID;
  whatsappMessage: string;
  total: number;
  items: Array<{ productId: UUID; name: string; qty: number; unitPrice: number }>;
}) {
  const db = getSupabaseDb();

  // One transaction for the order and its lines; the total is computed
  // server-side, so a half-written order can no longer exist (Phase 3).
  const { data, error } = await db.rpc("create_purchase_order", {
    p_pharmacy_id: args.pharmacyId,
    p_supplier_id: args.supplierId,
    p_items: args.items.map((i) => ({
      product_id: i.productId ?? null,
      name: i.name,
      qty: i.qty,
      unit_price: i.unitPrice
    })),
    p_whatsapp_message: args.whatsappMessage,
    p_currency: "USD"
  });
  if (error) throw error;
  return data as UUID;
}

export async function fetchPurchaseOrders(args: { pharmacyId: UUID }) {
  const db = getSupabaseDb();
  const { data, error } = await db
    .from("purchase_orders")
    .select("id,supplier_id,status,ordered_at,total,created_at")
    .eq("pharmacy_id", args.pharmacyId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return data as any[];
}

