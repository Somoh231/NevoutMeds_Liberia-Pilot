import type { PurchaseOrderItemRow, PurchaseOrderRow, UUID } from "@/platform/db/types";
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
  const { data: po, error } = await db
    .from("purchase_orders")
    .insert({
      pharmacy_id: args.pharmacyId,
      supplier_id: args.supplierId,
      status: "sent",
      ordered_at: new Date().toISOString(),
      currency: "USD",
      total: args.total,
      whatsapp_message: args.whatsappMessage,
      created_by: args.createdBy
    })
    .select("*")
    .single();
  if (error) throw error;

  const poRow = po as unknown as PurchaseOrderRow;

  if (args.items.length > 0) {
    const insertItems = args.items.map((i) => ({
      pharmacy_id: args.pharmacyId,
      purchase_order_id: poRow.id,
      product_id: i.productId,
      name: i.name,
      qty: i.qty,
      unit_price: i.unitPrice,
      line_total: i.qty * i.unitPrice
    }));
    const { error: iErr } = await db.from("purchase_order_items").insert(insertItems).select("id").limit(1);
    if (iErr) throw iErr;
  }

  return poRow.id;
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

