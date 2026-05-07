import type { UUID } from "@/platform/db/types";
import { getSupabaseDb } from "@/platform/data/supabaseDb";

export type RecordPurchaseItem = {
  productId: UUID;
  name: string;
  qty: number;
  unitPrice: number;
};

export async function recordPurchase(args: {
  pharmacyId: UUID;
  customerId: UUID;
  method: string;
  staffId: UUID;
  items: RecordPurchaseItem[];
}) {
  const db = getSupabaseDb();
  const payload = args.items.map((i) => ({
    product_id: i.productId,
    name: i.name,
    qty: i.qty,
    unit_price: i.unitPrice
  }));

  const { data, error } = await db.rpc("record_purchase", {
    p_pharmacy_id: args.pharmacyId,
    p_customer_id: args.customerId,
    p_method: args.method,
    p_staff_id: args.staffId,
    p_items: payload
  });
  if (error) throw error;
  return data as string;
}

